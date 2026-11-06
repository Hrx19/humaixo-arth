import { Router } from 'express';
import Decimal from 'decimal.js';
import { Types } from 'mongoose';
import { z } from 'zod';
import { TransactionModel } from '../../models/Transaction';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';

const monthlyTrendQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
}).strict();

type TypeTotal = { _id: 'credit' | 'debit'; amount: Types.Decimal128 };
type CategoryTotal = { _id: string; amount: Types.Decimal128; count: number };
type MonthlyTotal = {
  _id: { year: number; month: number; type: 'credit' | 'debit' };
  amount: Types.Decimal128;
};

export const analyticsRouter = Router();
analyticsRouter.use(verifyToken);

function userObjectId(userId: string): Types.ObjectId {
  return new Types.ObjectId(userId);
}

analyticsRouter.get('/summary', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  try {
    const totals = await TransactionModel.aggregate<TypeTotal>([
      { $match: { userId: userObjectId(userId) } },
      { $group: { _id: '$type', amount: { $sum: { $convert: { input: '$amount', to: 'decimal' } } } } },
    ]);
    const income = totals.find((item) => item._id === 'credit')?.amount.toString() ?? '0';
    const expense = totals.find((item) => item._id === 'debit')?.amount.toString() ?? '0';
    return response.status(200).json({
      success: true,
      data: {
        totalIncome: income,
        totalExpense: expense,
        currentBalance: new Decimal(income).minus(expense).toString(),
      },
    });
  } catch (error) {
    logger.error('Analytics summary request failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load analytics summary.' });
  }
});

analyticsRouter.get('/category-breakdown', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  try {
    const categories = await TransactionModel.aggregate<CategoryTotal>([
      { $match: { userId: userObjectId(userId), type: 'debit' } },
      {
        $group: {
          _id: '$category',
          amount: { $sum: { $convert: { input: '$amount', to: 'decimal' } } },
          count: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
    ]);
    return response.status(200).json({
      success: true,
      data: categories.map(({ _id, amount, count }) => ({
        category: _id,
        amount: amount.toString(),
        count,
      })),
    });
  } catch (error) {
    logger.error('Analytics category breakdown request failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load category breakdown.' });
  }
});

analyticsRouter.get('/monthly-trend', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsedQuery = monthlyTrendQuerySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid monthly analytics range.',
      details: parsedQuery.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - parsedQuery.data.months + 1, 1);
    const rows = await TransactionModel.aggregate<MonthlyTotal>([
      {
        $match: {
          userId: userObjectId(userId),
          date: { $gte: startDate, $lte: now },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            type: '$type',
          },
          amount: { $sum: { $convert: { input: '$amount', to: 'decimal' } } },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const months = new Map<string, { year: number; month: number; income: string; expense: string }>();
    for (let offset = parsedQuery.data.months - 1; offset >= 0; offset -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth() + 1;
      months.set(`${year}-${month}`, { year, month, income: '0', expense: '0' });
    }

    for (const row of rows) {
      const month = months.get(`${row._id.year}-${row._id.month}`);
      if (!month) continue;
      if (row._id.type === 'credit') month.income = row.amount.toString();
      else month.expense = row.amount.toString();
    }

    return response.status(200).json({ success: true, data: Array.from(months.values()) });
  } catch (error) {
    logger.error('Analytics monthly trend request failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load monthly trends.' });
  }
});
