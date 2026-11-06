import argon2 from 'argon2';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { HttpError } from '../middleware/errorHandler';
import { MasterCodeCredentialModel } from '../models/MasterCodeCredential';
import { OwnerSessionModel } from '../models/OwnerSession';

const CREDENTIAL_ID = 'owner-master-code';
const SESSION_TTL_MS = 15 * 60 * 1_000;
const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1, hashLength: 32 } as const;
export const OWNER_SCOPES = [
  'actions:authorize',
  'emergency:cache_flush',
  'emergency:restart_service',
  'code:mutate',
] as const;

export type OwnerScope = (typeof OWNER_SCOPES)[number];
export interface IssuedOwnerSession {
  ownerToken: string;
  sessionId: string;
  expiresAt: string;
  scopes: readonly OwnerScope[];
}

function assertCode(code: string): void {
  if (typeof code !== 'string' || !/^[A-Za-z0-9]{12,128}$/.test(code)) {
    throw new HttpError(400, 'Master Code must be 12 to 128 letters or numbers.', 'INVALID_MASTER_CODE');
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function ipFingerprint(ipAddress: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(ipAddress).digest('hex');
}

function assertConfiguredOwner(ownerId: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(ownerId) || !env.AI_OWNER_USER_IDS.includes(ownerId)) {
    throw new HttpError(403, 'This account is not permitted to use owner controls.', 'OWNER_ACCESS_DENIED');
  }
  return new Types.ObjectId(ownerId);
}

async function createOwnerSession(ownerId: string, ipAddress: string, reason: string): Promise<IssuedOwnerSession> {
  const ownerObjectId = assertConfiguredOwner(ownerId);
  const ownerToken = randomBytes(32).toString('base64url');
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_MS);
  const sessionId = randomUUID();

  await OwnerSessionModel.create({
    sessionId,
    ownerId: ownerObjectId,
    tokenHash: hashToken(ownerToken),
    scopes: [...OWNER_SCOPES],
    issuedAt,
    expiresAt,
    reason: reason.slice(0, 300),
    ipFingerprint: ipFingerprint(ipAddress),
  });

  return { ownerToken, sessionId, expiresAt: expiresAt.toISOString(), scopes: OWNER_SCOPES };
}

export async function enrollMasterCode(
  code: string,
  ownerId: string,
  ipAddress: string,
): Promise<IssuedOwnerSession> {
  assertConfiguredOwner(ownerId);
  assertCode(code);
  const existing = await MasterCodeCredentialModel.exists({ _id: CREDENTIAL_ID });
  if (existing) {
    throw new HttpError(409, 'Master Code enrollment has already been completed.', 'MASTER_CODE_ALREADY_ENROLLED');
  }

  const salt = randomBytes(16);
  const hash = await argon2.hash(code, { ...ARGON_OPTIONS, salt });
  try {
    await MasterCodeCredentialModel.create({
      _id: CREDENTIAL_ID,
      hash,
      salt: salt.toString('hex'),
      params: {
        memoryCost: ARGON_OPTIONS.memoryCost,
        timeCost: ARGON_OPTIONS.timeCost,
        parallelism: ARGON_OPTIONS.parallelism,
        hashLength: ARGON_OPTIONS.hashLength,
      },
      version: 1,
      enrolledAt: new Date(),
      rotatedAt: new Date(),
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      throw new HttpError(409, 'Master Code enrollment has already been completed.', 'MASTER_CODE_ALREADY_ENROLLED');
    }
    throw error;
  }

  return createOwnerSession(ownerId, ipAddress, 'master-code-enrollment');
}

export async function masterCodeStatus(ownerId: string): Promise<{ enrolled: boolean }> {
  assertConfiguredOwner(ownerId);
  return { enrolled: Boolean(await MasterCodeCredentialModel.exists({ _id: CREDENTIAL_ID })) };
}

export async function verifyMasterCode(
  code: string,
  ownerId: string,
  ipAddress: string,
): Promise<IssuedOwnerSession> {
  assertConfiguredOwner(ownerId);
  assertCode(code);
  const credential = await MasterCodeCredentialModel.findById(CREDENTIAL_ID).select('+hash +salt');
  if (!credential || !(await argon2.verify(credential.hash, code))) {
    throw new HttpError(401, 'Master Code is invalid.', 'MASTER_CODE_INVALID');
  }
  return createOwnerSession(ownerId, ipAddress, 'master-code-verification');
}

export async function rotateMasterCode(
  oldCode: string,
  newCode: string,
  ownerId: string,
  ipAddress: string,
): Promise<IssuedOwnerSession> {
  assertConfiguredOwner(ownerId);
  assertCode(oldCode);
  assertCode(newCode);
  if (oldCode === newCode) {
    throw new HttpError(400, 'The new Master Code must differ from the current code.', 'MASTER_CODE_UNCHANGED');
  }

  const credential = await MasterCodeCredentialModel.findById(CREDENTIAL_ID).select('+hash +salt');
  if (!credential || !(await argon2.verify(credential.hash, oldCode))) {
    throw new HttpError(401, 'Current Master Code is invalid.', 'MASTER_CODE_INVALID');
  }

  const salt = randomBytes(16);
  const hash = await argon2.hash(newCode, { ...ARGON_OPTIONS, salt });
  const updated = await MasterCodeCredentialModel.findOneAndUpdate(
    { _id: CREDENTIAL_ID, hash: credential.hash, version: credential.version },
    {
      $set: {
        hash,
        salt: salt.toString('hex'),
        params: {
          memoryCost: ARGON_OPTIONS.memoryCost,
          timeCost: ARGON_OPTIONS.timeCost,
          parallelism: ARGON_OPTIONS.parallelism,
          hashLength: ARGON_OPTIONS.hashLength,
        },
        rotatedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { new: true },
  );
  if (!updated) {
    throw new HttpError(409, 'Master Code changed during rotation. Verify the current code and retry.', 'MASTER_CODE_ROTATION_CONFLICT');
  }

  await OwnerSessionModel.updateMany(
    { ownerId: new Types.ObjectId(ownerId), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), reason: 'master-code-rotated' } },
  );
  return createOwnerSession(ownerId, ipAddress, 'master-code-rotation');
}

export async function validateOwnerSession(
  ownerToken: string,
  ownerId: string,
  requiredScope: string,
): Promise<{ sessionId: string; scopes: string[] } | null> {
  if (!ownerToken || !Types.ObjectId.isValid(ownerId) || !env.AI_OWNER_USER_IDS.includes(ownerId)) return null;
  const session = await OwnerSessionModel.findOne({
    ownerId: new Types.ObjectId(ownerId),
    tokenHash: hashToken(ownerToken),
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
    scopes: requiredScope,
  }).select('+tokenHash');
  return session ? { sessionId: session.sessionId, scopes: session.scopes } : null;
}

export async function revokeOwnerSession(ownerToken: string, ownerId: string): Promise<void> {
  await OwnerSessionModel.updateOne(
    {
      ownerId: new Types.ObjectId(ownerId),
      tokenHash: hashToken(ownerToken),
      revokedAt: { $exists: false },
    },
    { $set: { revokedAt: new Date(), reason: 'owner-logout' } },
  );
}
