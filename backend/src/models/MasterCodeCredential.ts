import { model, models, Schema, type HydratedDocument, type Model } from 'mongoose';

export interface MasterCodeCredentialRecord {
  _id: string;
  hash: string;
  salt: string;
  params: { memoryCost: number; timeCost: number; parallelism: number; hashLength: number };
  version: number;
  enrolledAt: Date;
  rotatedAt: Date;
}

export type MasterCodeCredentialDocument = HydratedDocument<MasterCodeCredentialRecord>;
type MasterCodeCredentialModelType = Model<MasterCodeCredentialRecord>;

const masterCodeCredentialSchema = new Schema<MasterCodeCredentialRecord>(
  {
    _id: { type: String, default: 'owner-master-code' },
    hash: { type: String, required: true, select: false },
    salt: { type: String, required: true, select: false },
    params: {
      memoryCost: { type: Number, required: true },
      timeCost: { type: Number, required: true },
      parallelism: { type: Number, required: true },
      hashLength: { type: Number, required: true },
    },
    version: { type: Number, required: true, min: 1 },
    enrolledAt: { type: Date, required: true, immutable: true },
    rotatedAt: { type: Date, required: true },
  },
  { collection: 'master_code_credentials', versionKey: false },
);

export const MasterCodeCredentialModel =
  (models.MasterCodeCredential as MasterCodeCredentialModelType | undefined) ??
  model<MasterCodeCredentialRecord, MasterCodeCredentialModelType>(
    'MasterCodeCredential',
    masterCodeCredentialSchema,
  );
