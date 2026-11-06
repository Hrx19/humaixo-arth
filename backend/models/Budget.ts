import {
  model,
  models,
  Schema,
  Types,
  type HydratedDocument,
  type Model,
} from 'mongoose';

export interface BudgetRecord {
  userId: Types.ObjectId;
  amount: Types.Decimal128;
  month: number;
  year: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BudgetDocument = HydratedDocument<BudgetRecord>;
type BudgetModelType = Model<BudgetRecord>;

const budgetSchema = new Schema<BudgetRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
      min: 2000,
      max: 9999,
    },
  },
  { timestamps: true },
);

budgetSchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

export const BudgetModel =
  (models.Budget as BudgetModelType | undefined) ??
  model<BudgetRecord, BudgetModelType>('Budget', budgetSchema);
