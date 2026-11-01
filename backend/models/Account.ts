import {
  model,
  models,
  Schema,
  Types,
  type HydratedDocument,
  type Model,
} from 'mongoose';

export type AccountType =
  | 'bank'
  | 'savings'
  | 'current'
  | 'credit_card'
  | 'wallet'
  | 'cash'
  | 'investment';

export interface AccountRecord {
  userId: Types.ObjectId;
  name: string;
  institution: string;
  type: AccountType;
  accountSuffix?: string;
  currency: string;
  openingBalance: number;
  openingBalanceDate: Date;
  color: string;
  isArchived: boolean;
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
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    institution: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    type: {
      type: String,
      enum: ['bank', 'savings', 'current', 'credit_card', 'wallet', 'cash', 'investment'],
      required: true,
    },
    accountSuffix: {
      type: String,
      trim: true,
      match: /^\d{0,4}$/,
    },
    currency: {
      type: String,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
      default: 'INR',
      required: true,
    },
    openingBalance: {
      type: Number,
      required: true,
      min: -1_000_000_000_000,
      max: 1_000_000_000_000,
      default: 0,
    },
    openingBalanceDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    color: {
      type: String,
      match: /^#[0-9a-fA-F]{6}$/,
      default: '#7c5cff',
    },
    isArchived: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  { timestamps: true },
);

accountSchema.index({ userId: 1, createdAt: 1 });
accountSchema.index({ userId: 1, name: 1 }, { unique: true });

export const AccountModel =
  (models.Account as AccountModelType | undefined) ??
  model<AccountRecord, AccountModelType>('Account', accountSchema);
