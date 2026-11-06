import { model, models, Schema, Types, type HydratedDocument, type Model } from 'mongoose';

export interface OwnerSessionRecord {
  sessionId: string;
  ownerId: Types.ObjectId;
  tokenHash: string;
  scopes: string[];
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  reason?: string;
  ipFingerprint: string;
}

export type OwnerSessionDocument = HydratedDocument<OwnerSessionRecord>;
type OwnerSessionModelType = Model<OwnerSessionRecord>;

const ownerSessionSchema = new Schema<OwnerSessionRecord>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    scopes: { type: [String], required: true, default: [] },
    issuedAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    reason: { type: String, maxlength: 300 },
    ipFingerprint: { type: String, required: true, select: false },
  },
  { collection: 'owner_sessions', versionKey: false },
);

ownerSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ownerSessionSchema.index({ ownerId: 1, revokedAt: 1, expiresAt: 1 });

export const OwnerSessionModel =
  (models.OwnerSession as OwnerSessionModelType | undefined) ??
  model<OwnerSessionRecord, OwnerSessionModelType>('OwnerSession', ownerSessionSchema);
