import {
  model,
  models,
  Schema,
  Types,
  type HydratedDocument,
  type Model,
} from 'mongoose';

export type CategoryType = 'income' | 'expense';

export interface CategoryRecord {
  userId: Types.ObjectId;
  name: string;
  type: CategoryType;
  color?: string;
  icon?: string;
  isDefault: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CategoryDocument = HydratedDocument<CategoryRecord>;
type CategoryModelType = Model<CategoryRecord>;

const categorySchema = new Schema<CategoryRecord>(
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
      maxlength: 80,
    },
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: true,
    },
    color: {
      type: String,
      trim: true,
      match: /^#[0-9a-fA-F]{6}$/,
    },
    icon: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    isDefault: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  { timestamps: true, collection: 'financial_categories' },
);

categorySchema.index({ userId: 1, type: 1, name: 1 }, { unique: true });
categorySchema.index({ userId: 1, isDefault: 1, type: 1 });

export const CategoryModel =
  (models.FinancialCategory as CategoryModelType | undefined) ??
  model<CategoryRecord, CategoryModelType>(
    'FinancialCategory',
    categorySchema,
    'financial_categories',
  );
