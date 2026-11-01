import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel } from '../../models/Account';
import { logger } from '../config/logger';
import { getMonthlyBalanceHistory, getUserAccountBalances } from '../services/account-balances';
import { verifyToken } from '../middleware/verifyToken';
import {
  TransactionModel,
  type TransactionType,
} from '../../models/Transaction';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  category: z.string().trim().min(1).max(60).optional(),
  type: z.enum(['credit', 'debit']).optional(),
  accountId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  counterpartyKey: z.string().trim().min(1).max(140).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().max(100).optional(),
}).strict();

const createTransactionSchema = z.object({
  accountId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  merchant: z.string().trim().min(1).max(120),
  amount: z.coerce.number().positive().finite().max(1_000_000_000_000),
  type: z.enum(['credit', 'debit']),
  category: z.string().trim().min(1).max(60).default('Uncategorised'),
  counterparty: z.string().trim().min(1).max(120).optional(),
  counterpartyType: z.enum(['person', 'merchant', 'other']).optional(),
  paymentMethod: z.string().trim().max(40).optional(),
  date: z.coerce.date().optional(),
  balanceBefore: z.coerce.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000).optional(),
  balanceAfter: z.coerce.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000).optional(),
  referenceNumber: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  description: z.string().trim().max(500).optional(),
}).strict();

const analyticsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
}).strict();

const balanceAtQuerySchema = z.object({
  at: z.coerce.date(),
  accountId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
}).strict();

const balanceHistoryQuerySchema = z.object({
  months: z.coerce.number().int().min(3).max(36).default(12),
  accountId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
}).strict();

type CategoryAggregate = { _id: string; amount: number; count: number };
type MonthlyAggregate = {
  _id: { year: number; month: number; type: TransactionType };
  amount: number;
};
type MonthlySummary = { year: number; month: number; income: number; expense: number };
type PersonAggregate = {
  _id: string;
  name?: string;
  sent: number;
  received: number;
  count: number;
  lastDate: Date;
};
type MerchantAggregate = {
  _id: string;
  spent: number;
  received: number;
  count: number;
  lastDate: Date;
  categories: string[];
};
type TransactionViewSource = {
  _id: Types.ObjectId;
  accountId?: Types.ObjectId;
  merchant: string;
  amount: number;
  type: TransactionType;
  category: string;
  counterparty?: string;
  counterpartyKey?: string;
  counterpartyType?: 'person' | 'merchant' | 'other';
  paymentMethod?: string;
  date?: Date;
  balanceBefore?: number;
  balanceAfter?: number;
  referenceNumber?: string;
  note?: string;
  source?: string;
  confidence?: number;
  description?: string;
};

export const transactionRouter = Router();
transactionRouter.use(verifyToken);

function getUserObjectId(userId: string): Types.ObjectId {
  return new Types.ObjectId(userId);
}

function normalizeCounterparty(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-IN')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function serializeTransaction(transaction: TransactionViewSource) {
  return {
    id: transaction._id.toString(),
    accountId: transaction.accountId?.toString() ?? null,
    merchant: transaction.merchant,
    amount: transaction.amount,
    type: transaction.type,
    category: transaction.category,
    counterparty: transaction.counterparty ?? null,
    counterpartyKey: transaction.counterpartyKey ?? null,
    counterpartyType: transaction.counterpartyType ?? null,
    paymentMethod: transaction.paymentMethod ?? null,
    date: (transaction.date ?? new Date()).toISOString(),
    balanceBefore: transaction.balanceBefore ?? null,
    balanceAfter: transaction.balanceAfter ?? null,
    referenceNumber: transaction.referenceNumber ?? null,
    note: transaction.note ?? null,
    source: transaction.source ?? 'manual',
    confidence: transaction.confidence ?? 1,
    description: transaction.description ?? null,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function errorResponse(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

transactionRouter.get('/analytics', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsedQuery = analyticsQuerySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid analytics range.',
      details: parsedQuery.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - parsedQuery.data.months + 1, 1);
    const userObjectId = getUserObjectId(userId);
    const match = { userId: userObjectId, date: { $gte: startDate, $lte: now } };

    const [categoryRows, monthlyRows] = await Promise.all([
      TransactionModel.aggregate<CategoryAggregate>([
        { $match: { ...match, type: 'debit' } },
        {
          $group: {
            _id: '$category',
            amount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { amount: -1 } },
      ]),
      TransactionModel.aggregate<MonthlyAggregate>([
        { $match: match },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' },
              type: '$type',
            },
            amount: { $sum: '$amount' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    const monthlyByKey = new Map<string, MonthlySummary>();
    for (let offset = parsedQuery.data.months - 1; offset >= 0; offset -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth() + 1;
      monthlyByKey.set(`${year}-${month}`, { year, month, income: 0, expense: 0 });
    }

    for (const row of monthlyRows) {
      const summary = monthlyByKey.get(`${row._id.year}-${row._id.month}`);
      if (!summary) continue;
      if (row._id.type === 'credit') summary.income = row.amount;
      if (row._id.type === 'debit') summary.expense = row.amount;
    }

    const monthlyTotals = Array.from(monthlyByKey.values());
    const totals = monthlyTotals.reduce(
      (sum, month) => ({
        income: sum.income + month.income,
        expense: sum.expense + month.expense,
      }),
      { income: 0, expense: 0 },
    );
    const currentMonth = monthlyTotals[monthlyTotals.length - 1] ?? {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      income: 0,
      expense: 0,
    };
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

    const [todayRows, weekRows, accountBalances] = await Promise.all([
      TransactionModel.aggregate<MonthlyAggregate>([
        { $match: { userId: userObjectId, date: { $gte: startOfToday, $lte: now } } },
        { $group: { _id: { year: 0, month: 0, type: '$type' }, amount: { $sum: '$amount' } } },
      ]),
      TransactionModel.aggregate<MonthlyAggregate>([
        { $match: { userId: userObjectId, date: { $gte: startOfWeek, $lte: now } } },
        { $group: { _id: { year: 0, month: 0, type: '$type' }, amount: { $sum: '$amount' } } },
      ]),
      getUserAccountBalances(userObjectId, now),
    ]);

    const toIncomeExpense = (rows: MonthlyAggregate[]) => ({
      income: rows.find((row) => row._id.type === 'credit')?.amount ?? 0,
      expense: rows.find((row) => row._id.type === 'debit')?.amount ?? 0,
    });

    const accountTotal = accountBalances.reduce((sum, item) => sum + item.balance, 0);

    return response.status(200).json({
      byCategory: categoryRows.map((row) => ({
        category: row._id,
        amount: row.amount,
        count: row.count,
      })),
      monthlyTotals,
      totals: { ...totals, net: totals.income - totals.expense },
      today: toIncomeExpense(todayRows),
      thisWeek: toIncomeExpense(weekRows),
      thisMonth: currentMonth,
      trackedBalance: accountTotal,
      accounts: accountBalances.map(({ account, balance }) => ({
        id: account._id.toString(),
        name: account.name,
        institution: account.institution,
        type: account.type,
        accountSuffix: account.accountSuffix ?? '',
        currency: account.currency,
        balance,
        color: account.color,
      })),
      period: { from: startDate.toISOString(), to: now.toISOString() },
    });
  } catch (error) {
    logger.error('Transaction analytics request failed.', {
      message: errorResponse(error, 'Unknown analytics error.'),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({
      success: false,
      error: 'Failed to load transaction analytics.',
    });
  }
});

transactionRouter.get('/balance-at', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsedQuery = balanceAtQuerySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    return response.status(400).json({ success: false, error: 'A valid date is required.' });
  }

  try {
    const balances = await getUserAccountBalances(
      getUserObjectId(userId),
      parsedQuery.data.at,
      parsedQuery.data.accountId ? new Types.ObjectId(parsedQuery.data.accountId) : undefined,
    );
    const byAccount = balances.map(({ account, balance }) => ({
      id: account._id.toString(),
      name: account.name,
      institution: account.institution,
      balance,
      currency: account.currency,
    }));

    return response.status(200).json({
      at: parsedQuery.data.at.toISOString(),
      balance: byAccount.reduce((sum, account) => sum + account.balance, 0),
      byAccount,
    });
  } catch (error) {
    logger.error('Historical balance lookup failed.', {
      message: errorResponse(error, 'Unknown balance lookup error.'),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not calculate historical balance.' });
  }
});

transactionRouter.get('/balance-history', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsedQuery = balanceHistoryQuerySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    return response.status(400).json({ success: false, error: 'Invalid balance history range.' });
  }

  try {
    const history = await getMonthlyBalanceHistory(
      getUserObjectId(userId),
      parsedQuery.data.months,
      parsedQuery.data.accountId ? new Types.ObjectId(parsedQuery.data.accountId) : undefined,
    );
    return response.status(200).json({ series: history });
  } catch (error) {
    logger.error('Balance history request failed.', {
      message: errorResponse(error, 'Unknown balance history error.'),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load balance history.' });
  }
});

transactionRouter.get('/people', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  try {
    const people = await TransactionModel.aggregate<PersonAggregate>([
      {
        $match: {
          userId: getUserObjectId(userId),
          counterpartyKey: { $type: 'string', $ne: '' },
          counterpartyType: 'person',
        },
      },
      {
        $group: {
          _id: '$counterpartyKey',
          name: { $max: '$counterparty' },
          sent: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
          received: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
          count: { $sum: 1 },
          lastDate: { $max: '$date' },
        },
      },
      { $sort: { sent: -1, count: -1 } },
    ]);

    return response.status(200).json(
      people.map((person) => ({
        key: person._id,
        name: person.name ?? person._id,
        sent: person.sent,
        received: person.received,
        net: person.received - person.sent,
        transactionCount: person.count,
        lastDate: person.lastDate?.toISOString() ?? null,
      })),
    );
  } catch (error) {
    logger.error('People summary request failed.', {
      message: errorResponse(error, 'Unknown people summary error.'),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load people summaries.' });
  }
});

transactionRouter.get('/people/:counterpartyKey', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const counterpartyKey = normalizeCounterparty(request.params.counterpartyKey);
  if (!counterpartyKey || counterpartyKey.length > 140) {
    return response.status(400).json({ success: false, error: 'Person key is invalid.' });
  }

  try {
    const filter = {
      userId: getUserObjectId(userId),
      counterpartyKey,
      counterpartyType: 'person' as const,
    };
    const [transactions, totals] = await Promise.all([
      TransactionModel.find(filter)
        .select('-rawSMS')
        .sort({ date: -1, _id: -1 })
        .limit(100)
        .lean(),
      TransactionModel.aggregate<PersonAggregate>([
        { $match: filter },
        {
          $group: {
            _id: '$counterpartyKey',
            name: { $max: '$counterparty' },
            sent: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
            received: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
            count: { $sum: 1 },
            lastDate: { $max: '$date' },
          },
        },
      ]),
    ]);

    const summary = totals[0];
    if (!summary) return response.status(404).json({ success: false, error: 'Person was not found.' });

    return response.status(200).json({
      person: {
        key: summary._id,
        name: summary.name ?? summary._id,
        sent: summary.sent,
        received: summary.received,
        net: summary.received - summary.sent,
        transactionCount: summary.count,
        lastDate: summary.lastDate?.toISOString() ?? null,
      },
      transactions: transactions.map((transaction) =>
        serializeTransaction(transaction as unknown as TransactionViewSource),
      ),
    });
  } catch (error) {
    logger.error('Person transaction detail request failed.', {
      message: errorResponse(error, 'Unknown person detail error.'),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load person details.' });
  }
});

transactionRouter.get('/merchants', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  try {
    const merchants = await TransactionModel.aggregate<MerchantAggregate>([
      { $match: { userId: getUserObjectId(userId), merchant: { $type: 'string', $ne: '' } } },
      {
        $group: {
          _id: '$merchant',
          spent: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
          received: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
          count: { $sum: 1 },
          lastDate: { $max: '$date' },
          categories: { $addToSet: '$category' },
        },
      },
      { $sort: { spent: -1, count: -1 } },
      { $limit: 100 },
    ]);

    return response.status(200).json(
      merchants.map((merchant) => ({
        name: merchant._id,
        spent: merchant.spent,
        received: merchant.received,
        transactionCount: merchant.count,
        lastDate: merchant.lastDate?.toISOString() ?? null,
        categories: merchant.categories,
      })),
    );
  } catch (error) {
    logger.error('Merchant summary request failed.', {
      message: errorResponse(error, 'Unknown merchant summary error.'),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load merchant summaries.' });
  }
});

transactionRouter.get('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsedQuery = listQuerySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid transaction query.',
      details: parsedQuery.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const { page, limit, category, type, accountId, counterpartyKey, from, to, search } = parsedQuery.data;
  const filter: Record<string, unknown> = { userId: getUserObjectId(userId) };
  if (category) filter.category = category;
  if (type) filter.type = type;
  if (accountId) filter.accountId = new Types.ObjectId(accountId);
  if (counterpartyKey) filter.counterpartyKey = normalizeCounterparty(counterpartyKey);
  if (from || to) {
    filter.date = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { merchant: expression },
      { counterparty: expression },
      { category: expression },
      { description: expression },
      { referenceNumber: expression },
    ];
  }

  try {
    const [transactions, total] = await Promise.all([
      TransactionModel.find(filter)
        .select('-rawSMS')
        .sort({ date: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TransactionModel.countDocuments(filter),
    ]);

    response.set({
      'X-Total-Count': String(total),
      'X-Page': String(page),
      'X-Per-Page': String(limit),
    });
    return response.status(200).json(
      transactions.map((transaction) =>
        serializeTransaction(transaction as unknown as TransactionViewSource),
      ),
    );
  } catch (error) {
    logger.error('Transaction list request failed.', {
      message: errorResponse(error, 'Unknown transaction list error.'),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Failed to fetch transactions.' });
  }
});

transactionRouter.post('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsed = createTransactionSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid transaction details.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const userObjectId = getUserObjectId(userId);
    const account = parsed.data.accountId
      ? await AccountModel.findOne({ _id: parsed.data.accountId, userId: userObjectId, isArchived: false })
      : null;
    if (parsed.data.accountId && !account) {
      return response.status(404).json({ success: false, error: 'Selected account was not found.' });
    }

    const transactionDate = parsed.data.date ?? new Date();
    const delta = parsed.data.type === 'credit' ? parsed.data.amount : -parsed.data.amount;
    let balanceBefore = parsed.data.balanceBefore;
    let balanceAfter = parsed.data.balanceAfter;
    if (balanceAfter !== undefined && balanceBefore === undefined) balanceBefore = balanceAfter - delta;
    if (balanceBefore !== undefined && balanceAfter === undefined) balanceAfter = balanceBefore + delta;
    if (account && balanceBefore === undefined && balanceAfter === undefined) {
      balanceBefore = await getUserAccountBalances(userObjectId, new Date(transactionDate.getTime() - 1), account._id)
        .then((balances) => balances[0]?.balance);
      if (balanceBefore !== undefined) balanceAfter = balanceBefore + delta;
    }

    const counterparty = parsed.data.counterparty;
    const transaction = await TransactionModel.create({
      userId: userObjectId,
      accountId: account?._id,
      ...parsed.data,
      date: transactionDate,
      balanceBefore,
      balanceAfter,
      counterpartyKey: counterparty ? normalizeCounterparty(counterparty) : undefined,
      source: 'manual',
    });

    return response.status(201).json({
      success: true,
      data: serializeTransaction(transaction as unknown as TransactionViewSource),
    });
  } catch (error) {
    logger.error('Transaction create request failed.', {
      message: errorResponse(error, 'Unknown transaction create error.'),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Failed to create transaction.' });
  }
});
