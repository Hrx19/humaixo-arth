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

export type BudgetPeriod = 'monthly' | 'weekly';

export interface CategoryBudgetRecord {
  userId: Types.ObjectId;
  categoryId: Types.ObjectId;
  amount: Types.Decimal128;
  period: BudgetPeriod;
  startDate: Date;
  endDate: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CategoryBudgetDocument = HydratedDocument<CategoryBudgetRecord>;
type CategoryBudgetModelType = Model<CategoryBudgetRecord>;

const categoryBudgetSchema = new Schema<CategoryBudgetRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'FinancialCategory', required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    period: { type: String, enum: ['monthly', 'weekly'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { timestamps: true },
);

categoryBudgetSchema.index({ userId: 1, startDate: 1, endDate: 1 });
categoryBudgetSchema.index({ userId: 1, categoryId: 1, period: 1 });

export const CategoryBudgetModel =
  (models.CategoryBudget as CategoryBudgetModelType | undefined) ??
  model<CategoryBudgetRecord, CategoryBudgetModelType>(
    'CategoryBudget',
    categoryBudgetSchema,
    'budgets_v1',
  );
