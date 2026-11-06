import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { verifyToken } from '../middleware/verifyToken';
import {
  enrollMasterCode,
  masterCodeStatus,
  revokeOwnerSession,
  rotateMasterCode,
  verifyMasterCode,
} from '../services/masterKeyService';

const codeSchema = z.string().regex(/^[A-Za-z0-9]{12,128}$/);
const enrollSchema = z.object({ code: codeSchema }).strict();
const verifySchema = z.object({ code: codeSchema }).strict();
const rotateSchema = z.object({ oldCode: codeSchema, newCode: codeSchema }).strict();
const credentialRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  keyGenerator: (request) => request.auth?.userId ?? 'unauthenticated',
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: 'Too many Master Code attempts. Retry later.' },
});

export const aiMasterV1Router = Router();
aiMasterV1Router.use(verifyToken);

aiMasterV1Router.get('/status', async (request, response) => {
  const data = await masterCodeStatus(request.auth!.userId);
  return response.status(200).json({ success: true, data });
});

aiMasterV1Router.post('/enroll', credentialRateLimit, async (request, response) => {
  const parsed = enrollSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ success: false, error: 'Master Code must be 12 to 128 letters or numbers.' });
  const session = await enrollMasterCode(parsed.data.code, request.auth!.userId, request.ip ?? 'unknown');
  return response.status(201).json({ success: true, data: session });
});

aiMasterV1Router.post('/verify', credentialRateLimit, async (request, response) => {
  const parsed = verifySchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ success: false, error: 'Master Code must be 12 to 128 letters or numbers.' });
  const session = await verifyMasterCode(parsed.data.code, request.auth!.userId, request.ip ?? 'unknown');
  return response.status(200).json({ success: true, data: session });
});

aiMasterV1Router.post('/rotate', credentialRateLimit, async (request, response) => {
  const parsed = rotateSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ success: false, error: 'Both Master Codes must be 12 to 128 letters or numbers.' });
  const session = await rotateMasterCode(
    parsed.data.oldCode,
    parsed.data.newCode,
    request.auth!.userId,
    request.ip ?? 'unknown',
  );
  return response.status(200).json({ success: true, data: session });
});

aiMasterV1Router.post('/revoke', async (request, response) => {
  const token = request.get('x-owner-session-token');
  if (!token) return response.status(400).json({ success: false, error: 'Owner session token is required.' });
  await revokeOwnerSession(token, request.auth!.userId);
  return response.status(204).end();
});
