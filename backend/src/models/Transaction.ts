import {
  model,
  models,
  Schema,
  Types,
  type HydratedDocument,
  type Model,
} from 'mongoose';

export type TransactionDirection = 'debit' | 'credit';
export type FinancialTransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'refund'
  | 'adjustment'
  | 'fee'
  | 'interest';
export type TransactionStatus = 'posted' | 'pending' | 'failed';

export interface TransactionRecord {
  userId: Types.ObjectId;
  accountId: Types.ObjectId;
  statementId?: Types.ObjectId;
  date: Date;
  description: string;
  originalDescription?: string;
  referenceNumber?: string;
  amount: Types.Decimal128;
  currency: string;
  direction: TransactionDirection;
  type: FinancialTransactionType;
  categoryId?: Types.ObjectId;
  personId?: Types.ObjectId;
  paymentMethod?: string;
  status: TransactionStatus;
  isInternalTransfer: boolean;
  transferGroupId?: string;
  extractionConfidence?: number;
  sourceData?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TransactionDocument = HydratedDocument<TransactionRecord>;
type TransactionModelType = Model<TransactionRecord>;

const transactionSchema = new Schema<TransactionRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'FinancialAccount',
      required: true,
    },
    statementId: {
      type: Schema.Types.ObjectId,
      ref: 'StatementImport',
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    originalDescription: {
      type: String,
      trim: true,
      maxlength: 1_000,
    },
    referenceNumber: {
      type: String,
      trim: true,
      maxlength: 160,
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
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
    direction: {
      type: String,
      enum: ['debit', 'credit'],
      required: true,
    },
    type: {
      type: String,
      enum: ['income', 'expense', 'transfer', 'refund', 'adjustment', 'fee', 'interest'],
      required: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'FinancialCategory',
    },
    personId: {
      type: Schema.Types.ObjectId,
      ref: 'FinancialPerson',
    },
    paymentMethod: {
      type: String,
      trim: true,
      maxlength: 60,
    },
    status: {
      type: String,
      enum: ['posted', 'pending', 'failed'],
      default: 'posted',
      required: true,
    },
    isInternalTransfer: {
      type: Boolean,
      default: false,
      required: true,
    },
    transferGroupId: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    extractionConfidence: {
      type: Number,
      min: 0,
      max: 100,
    },
    sourceData: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true, collection: 'financial_transactions' },
);

transactionSchema.index({ userId: 1, date: -1, _id: -1 });
transactionSchema.index({ userId: 1, accountId: 1, date: -1 });
transactionSchema.index({ userId: 1, categoryId: 1, date: -1 });
transactionSchema.index({ userId: 1, personId: 1, date: -1 });
transactionSchema.index({ userId: 1, amount: 1 });
transactionSchema.index({ userId: 1, referenceNumber: 1 }, { sparse: true });
transactionSchema.index({ userId: 1, transferGroupId: 1 }, { sparse: true });

export const TransactionModel =
  (models.FinancialTransaction as TransactionModelType | undefined) ??
  model<TransactionRecord, TransactionModelType>(
    'FinancialTransaction',
    transactionSchema,
    'financial_transactions',
  );
