import { model, models, Schema, Types, type HydratedDocument, type Model } from 'mongoose';

export type CategoryKind = 'income' | 'expense' | 'transfer';

export interface CategoryRecord {
  userId: Types.ObjectId;
  name: string;
  kind: CategoryKind;
  isDefault: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

type CategoryModelType = Model<CategoryRecord>;
export type CategoryDocument = HydratedDocument<CategoryRecord>;

const categorySchema = new Schema<CategoryRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    kind: { type: String, enum: ['income', 'expense', 'transfer'], required: true },
    isDefault: { type: Boolean, default: false, required: true },
  },
  { timestamps: true },
);

categorySchema.index({ userId: 1, name: 1 }, { unique: true });

export const CategoryModel =
  (models.FinancialCategory as CategoryModelType | undefined) ??
  model<CategoryRecord, CategoryModelType>('FinancialCategory', categorySchema, 'categories');
