import {
  model,
  models,
  Schema,
  Types,
  type HydratedDocument,
  type Model,
} from 'mongoose';

export type PersonType = 'individual' | 'merchant' | 'institution';

export interface PersonRecord {
  userId: Types.ObjectId;
  displayName: string;
  aliases: string[];
  upiId?: string;
  maskedAccount?: string;
  personType: PersonType;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PersonDocument = HydratedDocument<PersonRecord>;
type PersonModelType = Model<PersonRecord>;

const personSchema = new Schema<PersonRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    aliases: {
      type: [String],
      default: [],
      validate: {
        validator: (aliases: string[]) =>
          aliases.every((alias) => alias.trim().length > 0 && alias.length <= 120),
        message: 'Aliases must contain non-empty values of at most 120 characters.',
      },
    },
    upiId: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    maskedAccount: {
      type: String,
      trim: true,
      maxlength: 32,
    },
    personType: {
      type: String,
      enum: ['individual', 'merchant', 'institution'],
      required: true,
      default: 'individual',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1_000,
    },
  },
  { timestamps: true, collection: 'financial_people' },
);

personSchema.index({ userId: 1, displayName: 1 });
personSchema.index({ userId: 1, upiId: 1 }, { sparse: true });
personSchema.index({ userId: 1, aliases: 1 });

export const PersonModel =
  (models.FinancialPerson as PersonModelType | undefined) ??
  model<PersonRecord, PersonModelType>(
    'FinancialPerson',
    personSchema,
    'financial_people',
  );
