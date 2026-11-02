import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { BudgetModel } from '../../models/Budget';
import { TransactionModel } from '../../models/Transaction';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';

const setBudgetSchema = z.object({
  amount: z.coerce.number().finite().positive().max(1_000_000_000_000),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(9999).optional(),
}).strict();

type ExpenseTotal = { _id: null; amount: number };
type BudgetStatus = 'safe' | 'warning' | 'exceeded' | 'not_set';

function getBudgetStatus(amount: number | null, spent: number): BudgetStatus {
  if (amount === null) return 'not_set';
  if (spent >= amount) return 'exceeded';
  if (spent >= amount * 0.8) return 'warning';
  return 'safe';
}

async function getMonthlyExpense(userId: Types.ObjectId, year: number, month: number): Promise<number> {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const [total] = await TransactionModel.aggregate<ExpenseTotal>([
    {
      $match: {
        userId,
        type: 'debit',
        date: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: null,
        amount: { $sum: '$amount' },
      },
    },
  ]);
  return total?.amount ?? 0;
}

export const budgetRouter = Router();
budgetRouter.use(verifyToken);

budgetRouter.get('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  try {
    const userObjectId = new Types.ObjectId(userId);
    const [budget, spent] = await Promise.all([
      BudgetModel.findOne({ userId: userObjectId, month, year }).lean(),
      getMonthlyExpense(userObjectId, year, month),
    ]);
    const amount = budget?.amount ?? null;

    return response.status(200).json({
      success: true,
      data: {
        amount,
        month,
        year,
        spent,
        progress: amount === null ? 0 : Math.min(spent / amount, 1),
        status: getBudgetStatus(amount, spent),
      },
    });
  } catch (error) {
    logger.error('Monthly budget lookup failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load your monthly budget.' });
  }
});

budgetRouter.put('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsed = setBudgetSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Enter a valid budget greater than zero.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const now = new Date();
  const month = parsed.data.month ?? now.getMonth() + 1;
  const year = parsed.data.year ?? now.getFullYear();
  const userObjectId = new Types.ObjectId(userId);

  try {
    const budget = await BudgetModel.findOneAndUpdate(
      { userId: userObjectId, month, year },
      { $set: { amount: parsed.data.amount } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    const spent = await getMonthlyExpense(userObjectId, year, month);

    return response.status(200).json({
      success: true,
      data: {
        amount: budget.amount,
        month: budget.month,
        year: budget.year,
        spent,
        progress: Math.min(spent / budget.amount, 1),
        status: getBudgetStatus(budget.amount, spent),
      },
    });
  } catch (error) {
    logger.error('Monthly budget update failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not save your monthly budget.' });
  }
});
