import { model, models, Schema, Types, type HydratedDocument, type Model } from 'mongoose';

export interface PersonRecord {
  userId: Types.ObjectId;
  normalizedKey: string;
  displayName: string;
  source: 'statement' | 'user';
  createdAt?: Date;
  updatedAt?: Date;
}

type PersonModelType = Model<PersonRecord>;
export type PersonDocument = HydratedDocument<PersonRecord>;

const personSchema = new Schema<PersonRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    normalizedKey: { type: String, required: true, trim: true, maxlength: 140 },
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    source: { type: String, enum: ['statement', 'user'], default: 'statement', required: true },
  },
  { timestamps: true },
);

personSchema.index({ userId: 1, normalizedKey: 1 }, { unique: true });

export const PersonModel =
  (models.FinancialPerson as PersonModelType | undefined) ??
  model<PersonRecord, PersonModelType>('FinancialPerson', personSchema, 'people');
