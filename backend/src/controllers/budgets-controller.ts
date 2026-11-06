import type { Request, Response } from 'express';
import Decimal from 'decimal.js';
import { Types } from 'mongoose';
import { z } from 'zod';
import { CategoryBudgetModel } from '../../models/Budget';
import { logger } from '../config/logger';
import {
  assertExpenseCategory,
  createBudget,
  deleteBudget,
  getBudget,
  getBudgetProgress,
  listBudgets,
  updateBudget,
} from '../services/budget-management';

const moneySchema = z.string()
  .regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/)
  .refine((value) => {
    try {
      Types.Decimal128.fromString(value);
      return true;
    } catch {
      return false;
    }
  });
const budgetFields = {
  categoryId: z.string().regex(/^[a-f\d]{24}$/i).transform((id) => new Types.ObjectId(id)),
  amount: moneySchema,
  period: z.enum(['monthly', 'weekly']),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
};
const createSchema = z.object(budgetFields).strict().refine(
  (value) => value.endDate >= value.startDate,
  { path: ['endDate'], message: 'End date must be on or after start date.' },
).refine((value) => new Decimal(value.amount).isPositive(), {
  path: ['amount'],
  message: 'Budget amount must be greater than zero.',
});
const updateSchema = z.object({
  categoryId: budgetFields.categoryId.optional(),
  amount: moneySchema.optional(),
  period: budgetFields.period.optional(),
  startDate: budgetFields.startDate.optional(),
  endDate: budgetFields.endDate.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one budget field to update.')
  .refine((value) => value.amount === undefined || new Decimal(value.amount).isPositive(), {
    path: ['amount'],
    message: 'Budget amount must be greater than zero.',
  });

function getUserId(request: Request): Types.ObjectId | null {
  const userId = request.auth?.userId;
  return userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
}

function validId(value: string | string[] | undefined): Types.ObjectId | null {
  return typeof value === 'string' && Types.ObjectId.isValid(value)
    ? new Types.ObjectId(value)
    : null;
}

export async function listUserBudgets(request: Request, response: Response): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  try {
    return response.status(200).json({ success: true, data: await listBudgets(userId) });
  } catch (error) {
    logger.error('Budget list failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not load budgets.' });
  }
}

export async function createUserBudget(request: Request, response: Response): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid budget.',
      details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  try {
    if (!await assertExpenseCategory(userId, parsed.data.categoryId)) {
      return response.status(400).json({ success: false, error: 'An expense category owned by this user is required.' });
    }
    const data = await createBudget(userId, parsed.data);
    return response.status(201).json({ success: true, data });
  } catch (error) {
    logger.error('Budget creation failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not create budget.' });
  }
}

export async function getUserBudget(request: Request, response: Response): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const budgetId = validId(request.params.id);
  if (!budgetId) return response.status(400).json({ success: false, error: 'Budget ID is invalid.' });
  try {
    const data = await getBudget(userId, budgetId);
    return data
      ? response.status(200).json({ success: true, data })
      : response.status(404).json({ success: false, error: 'Budget was not found.' });
  } catch (error) {
    logger.error('Budget detail request failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not load budget.' });
  }
}

export async function updateUserBudget(request: Request, response: Response): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const budgetId = validId(request.params.id);
  if (!budgetId) return response.status(400).json({ success: false, error: 'Budget ID is invalid.' });
  const parsed = updateSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid budget update.',
      details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }

  try {
    const existing = await CategoryBudgetModel.findOne({ _id: budgetId, userId }).lean();
    if (!existing) return response.status(404).json({ success: false, error: 'Budget was not found.' });
    const startDate = parsed.data.startDate ?? existing.startDate;
    const endDate = parsed.data.endDate ?? existing.endDate;
    if (endDate < startDate) {
      return response.status(400).json({ success: false, error: 'End date must be on or after start date.' });
    }
    if (
      parsed.data.categoryId &&
      !await assertExpenseCategory(userId, parsed.data.categoryId)
    ) {
      return response.status(400).json({ success: false, error: 'An expense category owned by this user is required.' });
    }
    const data = await updateBudget(userId, budgetId, parsed.data);
    return data
      ? response.status(200).json({ success: true, data })
      : response.status(404).json({ success: false, error: 'Budget was not found.' });
  } catch (error) {
    logger.error('Budget update failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not update budget.' });
  }
}

export async function deleteUserBudget(request: Request, response: Response): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const budgetId = validId(request.params.id);
  if (!budgetId) return response.status(400).json({ success: false, error: 'Budget ID is invalid.' });
  try {
    const deleted = await deleteBudget(userId, budgetId);
    return deleted
      ? response.status(200).json({ success: true, data: { id: budgetId.toString() } })
      : response.status(404).json({ success: false, error: 'Budget was not found.' });
  } catch (error) {
    logger.error('Budget deletion failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not delete budget.' });
  }
}

export async function getUserBudgetProgress(request: Request, response: Response): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  let budgetId: Types.ObjectId | undefined;
  if (request.query.budgetId !== undefined) {
    if (typeof request.query.budgetId !== 'string' || !Types.ObjectId.isValid(request.query.budgetId)) {
      return response.status(400).json({ success: false, error: 'Budget ID is invalid.' });
    }
    budgetId = new Types.ObjectId(request.query.budgetId);
  }
  try {
    const data = await getBudgetProgress(userId, budgetId);
    if (budgetId && data.length === 0) {
      return response.status(404).json({ success: false, error: 'Active budget was not found.' });
    }
    return response.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Budget progress request failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not calculate budget progress.' });
  }
}
