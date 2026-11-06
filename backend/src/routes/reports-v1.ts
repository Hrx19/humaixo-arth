import { Router } from 'express';
import Decimal from 'decimal.js';
import { Types } from 'mongoose';
import { z } from 'zod';
import { TransactionModel } from '../../models/Transaction';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to);

export const reportsV1Router = Router();
reportsV1Router.use(verifyToken);

function parsePeriod(value: unknown, monthly: boolean) {
  const query = rangeSchema.safeParse(value);
  if (!query.success) return null;
  const to = query.data.to ?? new Date();
  const from = query.data.from ?? (monthly
    ? new Date(to.getFullYear(), to.getMonth(), 1)
    : new Date(to.getFullYear(), to.getMonth(), to.getDate()));
  return from <= to ? { from, to } : null;
}

function createReportRouter(period: 'daily' | 'monthly'): Router {
  const router = Router();
  router.get('/', async (request, response) => {
    const userId = request.auth?.userId;
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return response.status(401).json({ success: false, error: 'Authentication is required.' });
    }
    const range = parsePeriod(request.query, period === 'monthly');
    if (!range) return response.status(400).json({ success: false, error: 'Invalid report period.' });
    try {
      const { from, to } = range;
      const rows = await TransactionModel.aggregate<{
        _id: { year: number; month: number; day?: number };
        income: Types.Decimal128;
        expenses: Types.Decimal128;
        categories: Array<{ name: string; amount: Types.Decimal128 }>;
        count: number;
      }>([
        {
          $match: {
            userId: new Types.ObjectId(userId),
            date: { $gte: from, $lte: to },
            type: { $in: ['credit', 'debit'] },
            isInternalTransfer: { $ne: true },
            isLoanRepayment: { $ne: true },
            status: { $ne: 'failed' },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' },
              ...(period === 'daily' ? { day: { $dayOfMonth: '$date' } } : {}),
            },
            income: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $convert: { input: '$amount', to: 'decimal' } }, Types.Decimal128.fromString('0')] } },
            expenses: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, { $convert: { input: '$amount', to: 'decimal' } }, Types.Decimal128.fromString('0')] } },
            count: { $sum: 1 },
            categoryRows: { $push: { name: '$category', amount: { $convert: { input: '$amount', to: 'decimal' } }, type: '$type' } },
          },
        },
        {
          $project: {
            _id: 1,
            income: 1,
            expenses: 1,
            count: 1,
            categories: {
              $map: {
                input: {
                  $filter: {
                    input: { $setUnion: [{ $map: { input: '$categoryRows', as: 'row', in: '$$row.name' } }, []] },
                    as: 'categoryName',
                    cond: { $ne: ['$$categoryName', null] },
                  },
                },
                as: 'categoryName',
                in: {
                  name: '$$categoryName',
                  amount: {
                    $sum: {
                      $map: {
                        input: {
                          $filter: {
                            input: '$categoryRows',
                            as: 'row',
                            cond: { $and: [{ $eq: ['$$row.name', '$$categoryName'] }, { $eq: ['$$row.type', 'debit'] }] },
                          },
                        },
                        as: 'row',
                        in: '$$row.amount',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]);
      return response.status(200).json({
        success: true,
        period: { from: from.toISOString(), to: to.toISOString() },
        data: rows.map((row) => ({
          period: row._id,
          totalIncome: row.income.toString(),
          totalExpenses: row.expenses.toString(),
          netCashFlow: new Decimal(row.income.toString()).minus(row.expenses.toString()).toString(),
          transactionCount: row.count,
          topCategories: row.categories
            .sort((left, right) => {
              return new Decimal(right.amount.toString()).cmp(left.amount.toString());
            })
            .slice(0, 5)
            .map((category) => ({ name: category.name, total: category.amount.toString() })),
        })),
      });
    } catch (error) {
      logger.error(`${period} report request failed.`, { message: error instanceof Error ? error.message : String(error) });
      return response.status(500).json({ success: false, error: `Could not generate ${period} report.` });
    }
  });
  return router;
}

export const dailyReportRouter = createReportRouter('daily');
export const monthlyReportRouter = createReportRouter('monthly');
