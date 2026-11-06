import {
  model,
  models,
  Schema,
  Types,
  type HydratedDocument,
  type Model,
} from 'mongoose';

export type RecurrenceInterval = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringTransactionStatus = 'confirmed' | 'paused';
export type RecurringTransactionDirection = 'credit' | 'debit';

export interface RecurringTransactionRecord {
  userId: Types.ObjectId;
  patternKey: string;
  accountId: Types.ObjectId;
  counterparty: string;
  description: string;
  direction: RecurringTransactionDirection;
  amount: Types.Decimal128;
  minAmount: Types.Decimal128;
  maxAmount: Types.Decimal128;
  interval: RecurrenceInterval;
  confidence: number;
  occurrenceCount: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  nextExpectedDate: Date;
  sourceTransactionIds: Types.ObjectId[];
  status: RecurringTransactionStatus;
  confirmedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type RecurringTransactionDocument = HydratedDocument<RecurringTransactionRecord>;
type RecurringTransactionModelType = Model<RecurringTransactionRecord>;

const recurringTransactionSchema = new Schema<RecurringTransactionRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    patternKey: { type: String, required: true, maxlength: 64 },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    counterparty: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    direction: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    minAmount: { type: Schema.Types.Decimal128, required: true },
    maxAmount: { type: Schema.Types.Decimal128, required: true },
    interval: {
      type: String,
      enum: ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'],
      required: true,
    },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    occurrenceCount: { type: Number, required: true, min: 3 },
    firstOccurrence: { type: Date, required: true },
    lastOccurrence: { type: Date, required: true },
    nextExpectedDate: { type: Date, required: true },
    sourceTransactionIds: [{ type: Schema.Types.ObjectId, ref: 'Transaction', required: true }],
    status: { type: String, enum: ['confirmed', 'paused'], default: 'confirmed', required: true },
    confirmedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

recurringTransactionSchema.index({ userId: 1, patternKey: 1 }, { unique: true });
recurringTransactionSchema.index({ userId: 1, status: 1, nextExpectedDate: 1 });

export const RecurringTransactionModel =
  (models.RecurringTransaction as RecurringTransactionModelType | undefined) ??
  model<RecurringTransactionRecord, RecurringTransactionModelType>(
    'RecurringTransaction',
    recurringTransactionSchema,
  );
