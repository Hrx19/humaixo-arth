import {
  model,
  models,
  Schema,
  Types,
  type HydratedDocument,
  type Model,
} from 'mongoose';

export type TransactionType = 'credit' | 'debit';
export type TransactionSource = 'manual' | 'sms' | 'statement';
export type CounterpartyType = 'person' | 'merchant' | 'other';

export interface TransactionRecord {
  userId: Types.ObjectId;
  accountId?: Types.ObjectId;
  amount: number;
  type: TransactionType;
  category: string;
  merchant: string;
  counterparty?: string;
  counterpartyKey?: string;
  counterpartyType?: CounterpartyType;
  paymentMethod?: string;
  date?: Date;
  balanceBefore?: number;
  balanceAfter?: number;
  referenceNumber?: string;
  note?: string;
  source?: TransactionSource;
  dedupeKey?: string;
  statementImportId?: Types.ObjectId;
  confidence?: number;
  description?: string;
  rawSMS?: string;
}

export type TransactionDocument = HydratedDocument<TransactionRecord>;
type TransactionModelType = Model<TransactionRecord>;

const transactionSchema = new Schema<TransactionRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
      max: 1_000_000_000_000,
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
      default: 'Uncategorised',
    },
    merchant: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    counterparty: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    counterpartyKey: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 140,
    },
    counterpartyType: {
      type: String,
      enum: ['person', 'merchant', 'other'],
    },
    paymentMethod: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    balanceBefore: {
      type: Number,
      min: -1_000_000_000_000,
      max: 1_000_000_000_000,
    },
    balanceAfter: {
      type: Number,
      min: -1_000_000_000_000,
      max: 1_000_000_000_000,
    },
    referenceNumber: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    source: {
      type: String,
      enum: ['manual', 'sms', 'statement'],
      default: 'manual',
      required: true,
    },
    dedupeKey: {
      type: String,
      trim: true,
      maxlength: 64,
    },
    statementImportId: {
      type: Schema.Types.ObjectId,
      ref: 'StatementImport',
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
      default: 1,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    rawSMS: {
      type: String,
      maxlength: 1_000,
      select: false,
    },
  },
  { timestamps: true },
);

transactionSchema.index({ userId: 1, date: -1, _id: -1 });
transactionSchema.index({ userId: 1, category: 1, date: -1 });
transactionSchema.index({ userId: 1, counterpartyKey: 1, date: -1 });
transactionSchema.index({ userId: 1, accountId: 1, date: -1 });
transactionSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);

export const TransactionModel =
  (models.Transaction as TransactionModelType | undefined) ??
  model<TransactionRecord, TransactionModelType>('Transaction', transactionSchema);
