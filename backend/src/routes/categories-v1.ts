import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { CategoryModel } from '../../models/Category';
import { TransactionModel } from '../../models/Transaction';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';

const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['income', 'expense', 'transfer']),
}).strict();
const defaultCategories = [
  ['Salary', 'income'], ['Business income', 'income'], ['Investment income', 'income'], ['Refunds', 'income'], ['Other income', 'income'],
  ['Food', 'expense'], ['Shopping', 'expense'], ['Travel', 'expense'], ['Bills', 'expense'], ['Subscriptions', 'expense'],
  ['Healthcare', 'expense'], ['Rent', 'expense'], ['Fuel', 'expense'], ['Education', 'expense'], ['Fees', 'expense'],
  ['Other', 'expense'], ['Transfer', 'transfer'], ['Uncategorised', 'expense'],
] as const;

export const categoriesV1Router = Router();
categoriesV1Router.use(verifyToken);

function getUserId(request: { auth?: { userId: string } }): Types.ObjectId | null {
  const userId = request.auth?.userId;
  return userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
}

async function seedDefaults(userId: Types.ObjectId): Promise<void> {
  await CategoryModel.bulkWrite(defaultCategories.map(([name, kind]) => ({
    updateOne: {
      filter: { userId, name },
      update: { $setOnInsert: { userId, name, kind, isDefault: true } },
      upsert: true,
    },
  })));
}

categoriesV1Router.get('/', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  try {
    await seedDefaults(userId);
    const categories = await CategoryModel.find({ userId }).sort({ kind: 1, name: 1 }).lean();
    return response.status(200).json({
      success: true,
      data: categories.map((item) => ({
        id: item._id.toString(), name: item.name, kind: item.kind, isDefault: item.isDefault,
      })),
    });
  } catch (error) {
    logger.error('Category list request failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not load categories.' });
  }
});

categoriesV1Router.post('/', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const parsed = categorySchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ success: false, error: 'Invalid category.' });
  try {
    const category = await CategoryModel.create({ ...parsed.data, userId, isDefault: false });
    return response.status(201).json({ success: true, data: { id: category._id.toString(), ...parsed.data, isDefault: false } });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      return response.status(409).json({ success: false, error: 'A category with this name already exists.' });
    }
    logger.error('Category creation failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not create category.' });
  }
});

categoriesV1Router.patch('/assign', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const parsed = z.object({
    transactionId: z.string().regex(/^[a-f\d]{24}$/i),
    categoryId: z.string().regex(/^[a-f\d]{24}$/i),
  }).strict().safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ success: false, error: 'Transaction and category IDs are required.' });
  try {
    const categoryId = new Types.ObjectId(parsed.data.categoryId);
    const transactionId = new Types.ObjectId(parsed.data.transactionId);
    const [category, transaction] = await Promise.all([
      CategoryModel.findOne({ _id: categoryId, userId }),
      TransactionModel.findOne({ _id: transactionId, userId }).select('category categoryId userEdits'),
    ]);
    if (!category) return response.status(404).json({ success: false, error: 'Category was not found.' });
    if (!transaction) return response.status(404).json({ success: false, error: 'Transaction was not found.' });
    const edit = {
      field: 'category',
      previousValue: transaction.category,
      value: category.name,
      editedAt: new Date(),
    };
    await TransactionModel.updateOne(
      { _id: transactionId, userId },
      { $set: { category: category.name, categoryId }, $push: { userEdits: edit } },
    );
    return response.status(200).json({ success: true, data: { transactionId: parsed.data.transactionId, categoryId: parsed.data.categoryId, category: category.name } });
  } catch (error) {
    logger.error('Transaction category assignment failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not assign category.' });
  }
});

categoriesV1Router.patch('/:id', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  if (!Types.ObjectId.isValid(request.params.id)) return response.status(400).json({ success: false, error: 'Category ID is invalid.' });
  const parsed = categorySchema.partial().strict().refine((value) => Object.keys(value).length > 0).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ success: false, error: 'Provide a valid category name or kind.' });
  try {
    const category = await CategoryModel.findOneAndUpdate(
      { _id: new Types.ObjectId(request.params.id), userId, isDefault: false },
      { $set: parsed.data },
      { new: true, runValidators: true },
    );
    if (!category) return response.status(404).json({ success: false, error: 'Editable category was not found.' });
    return response.status(200).json({ success: true, data: { id: category._id.toString(), name: category.name, kind: category.kind, isDefault: category.isDefault } });
  } catch (error) {
    logger.error('Category update failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not update category.' });
  }
});

categoriesV1Router.delete('/:id', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  if (!Types.ObjectId.isValid(request.params.id)) return response.status(400).json({ success: false, error: 'Category ID is invalid.' });
  try {
    const categoryId = new Types.ObjectId(request.params.id);
    const category = await CategoryModel.findOne({ _id: categoryId, userId });
    if (!category || category.isDefault) return response.status(404).json({ success: false, error: 'Editable category was not found.' });
    const assigned = await TransactionModel.exists({ userId, categoryId });
    if (assigned) return response.status(409).json({ success: false, error: 'Reassign transactions before deleting this category.' });
    await category.deleteOne();
    return response.status(200).json({ success: true, data: { id: categoryId.toString() } });
  } catch (error) {
    logger.error('Category deletion failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not delete category.' });
  }
});
