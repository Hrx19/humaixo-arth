import {
  model,
  models,
  Schema,
  Types,
  type HydratedDocument,
  type Model,
} from 'mongoose';

export const ACCOUNT_TYPES = [
  'savings',
  'current',
  'cash',
  'wallet',
  'credit_card',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type AccountStatus = 'active' | 'archived';
export type AccountSource = 'user_entered' | 'statement_reported';

export interface AccountRecord {
  userId: Types.ObjectId;
  name: string;
  institutionName: string;
  type: AccountType;
  currency: string;
  maskedNumber?: string;
  openingBalance: Types.Decimal128;
  openingBalanceDate: Date;
  currentBalance: Types.Decimal128;
  status: AccountStatus;
  source: AccountSource;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AccountDocument = HydratedDocument<AccountRecord>;
type AccountModelType = Model<AccountRecord>;

const accountSchema = new Schema<AccountRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    institutionName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    type: {
      type: String,
      enum: ACCOUNT_TYPES,
      required: true,
    },
    currency: {
      type: String,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
      match: /^[A-Z]{3}$/,
      default: 'INR',
      required: true,
    },
    maskedNumber: {
      type: String,
      trim: true,
      match: /^\d{4}$/,
    },
    openingBalance: {
      type: Schema.Types.Decimal128,
      required: true,
      default: () => Types.Decimal128.fromString('0'),
    },
    openingBalanceDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    currentBalance: {
      type: Schema.Types.Decimal128,
      required: true,
      default: () => Types.Decimal128.fromString('0'),
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      required: true,
    },
    source: {
      type: String,
      enum: ['user_entered', 'statement_reported'],
      default: 'user_entered',
      required: true,
    },
  },
  { timestamps: true, collection: 'financial_accounts' },
);

accountSchema.index({ userId: 1, status: 1, createdAt: -1 });
accountSchema.index({ userId: 1, name: 1 }, { unique: true });

export const AccountModel =
  (models.FinancialAccount as AccountModelType | undefined) ??
  model<AccountRecord, AccountModelType>(
    'FinancialAccount',
    accountSchema,
    'financial_accounts',
  );
