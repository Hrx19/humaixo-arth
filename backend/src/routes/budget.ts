import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { BudgetModel } from '../../models/Budget';
import { TransactionModel } from '../../models/Transaction';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';
import Decimal from 'decimal.js';

const setBudgetSchema = z.object({
  amount: z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(9999).optional(),
}).strict();

type ExpenseTotal = { _id: null; amount: Types.Decimal128 };
type BudgetStatus = 'safe' | 'warning' | 'exceeded' | 'not_set';

function getBudgetStatus(amount: string | null, spent: string): BudgetStatus {
  if (amount === null) return 'not_set';
  if (new Decimal(spent).gte(amount)) return 'exceeded';
  if (new Decimal(spent).gte(new Decimal(amount).times('0.8'))) return 'warning';
  return 'safe';
}

async function getMonthlyExpense(userId: Types.ObjectId, year: number, month: number): Promise<string> {
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
        amount: { $sum: { $convert: { input: '$amount', to: 'decimal' } } },
      },
    },
  ]);
  return total?.amount.toString() ?? '0';
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
    const amount = budget?.amount?.toString() ?? null;

    return response.status(200).json({
      success: true,
      data: {
        amount,
        month,
        year,
        spent,
        progress: amount === null ? '0' : Decimal.min(new Decimal(spent).div(amount), 1).toString(),
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
      { $set: { amount: Types.Decimal128.fromString(parsed.data.amount) } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    const spent = await getMonthlyExpense(userObjectId, year, month);

    return response.status(200).json({
      success: true,
      data: {
        amount: budget.amount.toString(),
        month: budget.month,
        year: budget.year,
        spent,
        progress: Decimal.min(new Decimal(spent).div(budget.amount.toString()), 1).toString(),
        status: getBudgetStatus(budget.amount.toString(), spent),
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
