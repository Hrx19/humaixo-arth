import { Router } from 'express';
import Decimal from 'decimal.js';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel } from '../../models/Account';
import { BudgetModel } from '../../models/Budget';
import { logger } from '../config/logger';
import { getMonthlyBalanceHistory, getUserAccountBalances } from '../services/account-balances';
import { verifyToken } from '../middleware/verifyToken';
import { decimal128 } from '../services/money';
import { findOrCreateCategory, findOrCreatePerson } from '../services/financial-directory';
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
  amount: z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/)
    .refine((value) => new Decimal(value).isPositive()),
  type: z.enum(['credit', 'debit']),
  category: z.string().trim().min(1).max(60).default('Uncategorised'),
  counterparty: z.string().trim().min(1).max(120).optional(),
  counterpartyType: z.enum(['person', 'merchant', 'other']).optional(),
  paymentMethod: z.string().trim().max(40).optional(),
  date: z.coerce.date().optional(),
  balanceBefore: z.string().regex(/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/).optional(),
  balanceAfter: z.string().regex(/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/).optional(),
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

type CategoryAggregate = { _id: string; amount: Types.Decimal128; count: number };
type CashFlowAggregate = {
  _id: null;
  income: Types.Decimal128;
  expense: Types.Decimal128;
};
type MonthlyCashFlowAggregate = {
  _id: { year: number; month: number };
  income: Types.Decimal128;
  expense: Types.Decimal128;
};
type MonthlySummary = { year: number; month: number; income: string; expense: string };
type BudgetStatus = 'safe' | 'warning' | 'exceeded' | 'not_set';
type PersonAggregate = {
  _id: string;
  name?: string;
  sent: Types.Decimal128;
  received: Types.Decimal128;
  count: number;
  lastDate: Date;
};
type MerchantAggregate = {
  _id: string;
  spent: Types.Decimal128;
  received: Types.Decimal128;
  count: number;
  lastDate: Date;
  categories: string[];
};
type TransactionViewSource = {
  _id: Types.ObjectId;
  accountId?: Types.ObjectId;
  merchant: string;
  amount: Types.Decimal128;
  type: TransactionType;
  category: string;
  counterparty?: string;
  counterpartyKey?: string;
  counterpartyType?: 'person' | 'merchant' | 'other';
  paymentMethod?: string;
  date?: Date;
  balanceBefore?: Types.Decimal128;
  balanceAfter?: Types.Decimal128;
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
    amount: transaction.amount.toString(),
    type: transaction.type,
    category: transaction.category,
    counterparty: transaction.counterparty ?? null,
    counterpartyKey: transaction.counterpartyKey ?? null,
    counterpartyType: transaction.counterpartyType ?? null,
    paymentMethod: transaction.paymentMethod ?? null,
    date: (transaction.date ?? new Date()).toISOString(),
    balanceBefore: transaction.balanceBefore?.toString() ?? null,
    balanceAfter: transaction.balanceAfter?.toString() ?? null,
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

function getBudgetStatus(amount: string | null, spent: string): BudgetStatus {
  if (amount === null) return 'not_set';
  if (new Decimal(spent).gte(amount)) return 'exceeded';
  if (new Decimal(spent).gte(new Decimal(amount).times('0.8'))) return 'warning';
  return 'safe';
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
    const match = {
      userId: userObjectId,
      date: { $gte: startDate, $lte: now },
      isInternalTransfer: { $ne: true },
      isLoanRepayment: { $ne: true },
    };

    const [periodTotals, categoryRows, monthlyRows, monthlyBudget] = await Promise.all([
      TransactionModel.aggregate<CashFlowAggregate>([
        { $match: match },
        {
          $group: {
            _id: null,
            income: {
              $sum: {
                $cond: [{ $eq: ['$type', 'credit'] }, '$amount', Types.Decimal128.fromString('0')],
              },
            },
            expense: {
              $sum: {
                $cond: [{ $eq: ['$type', 'debit'] }, '$amount', Types.Decimal128.fromString('0')],
              },
            },
          },
        },
      ]),
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
      TransactionModel.aggregate<MonthlyCashFlowAggregate>([
        { $match: match },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' },
            },
            income: {
              $sum: {
                $cond: [{ $eq: ['$type', 'credit'] }, '$amount', Types.Decimal128.fromString('0')],
              },
            },
            expense: {
              $sum: {
                $cond: [{ $eq: ['$type', 'debit'] }, '$amount', Types.Decimal128.fromString('0')],
              },
            },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      BudgetModel.findOne({
        userId: userObjectId,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      }).select('amount').lean(),
    ]);

    const monthlyByKey = new Map<string, MonthlySummary>();
    for (let offset = parsedQuery.data.months - 1; offset >= 0; offset -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth() + 1;
      monthlyByKey.set(`${year}-${month}`, { year, month, income: '0', expense: '0' });
    }

    for (const row of monthlyRows) {
      const summary = monthlyByKey.get(`${row._id.year}-${row._id.month}`);
      if (!summary) continue;
      summary.income = row.income.toString();
      summary.expense = row.expense.toString();
    }

    const monthlyTotals = Array.from(monthlyByKey.values());
    const totalIncome = periodTotals[0]?.income.toString() ?? '0';
    const totalExpense = periodTotals[0]?.expense.toString() ?? '0';
    const totals = { income: totalIncome, expense: totalExpense };
    const currentMonth = monthlyTotals[monthlyTotals.length - 1] ?? {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      income: '0',
      expense: '0',
    };
    const budgetAmount = monthlyBudget?.amount.toString() ?? null;
    const budgetStatus = getBudgetStatus(budgetAmount, currentMonth.expense);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

    const cashFlowForRange = (from: Date) => TransactionModel.aggregate<CashFlowAggregate>([
      {
        $match: {
          userId: userObjectId,
          date: { $gte: from, $lte: now },
          isInternalTransfer: { $ne: true },
          isLoanRepayment: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          income: {
            $sum: {
              $cond: [{ $eq: ['$type', 'credit'] }, '$amount', Types.Decimal128.fromString('0')],
            },
          },
          expense: {
            $sum: {
              $cond: [{ $eq: ['$type', 'debit'] }, '$amount', Types.Decimal128.fromString('0')],
            },
          },
        },
      },
    ]);

    const [todayRows, weekRows, accountBalances] = await Promise.all([
      cashFlowForRange(startOfToday),
      cashFlowForRange(startOfWeek),
      getUserAccountBalances(userObjectId, now),
    ]);

    const toIncomeExpense = (rows: CashFlowAggregate[]) => ({
      income: rows[0]?.income.toString() ?? '0',
      expense: rows[0]?.expense.toString() ?? '0',
    });

    const accountTotal = accountBalances.reduce(
      (sum, item) => sum.plus(item.balance),
      new Decimal('0'),
    ).toString();

    return response.status(200).json({
      byCategory: categoryRows.map((row) => ({
        category: row._id,
        amount: row.amount.toString(),
        count: row.count,
      })),
      categoryBreakdown: categoryRows.map((row) => ({
        category: row._id,
        amount: row.amount.toString(),
        count: row.count,
      })),
      monthlyTotals,
      monthlyTrend: monthlyTotals,
      totals: { ...totals, net: new Decimal(totals.income).minus(totals.expense).toString() },
      totalIncome,
      totalExpense,
      balance: new Decimal(totalIncome).minus(totalExpense).toString(),
      today: toIncomeExpense(todayRows),
      thisWeek: toIncomeExpense(weekRows),
      thisMonth: currentMonth,
      budgetStatus,
      budget: {
        amount: budgetAmount,
        spent: currentMonth.expense,
        progress: budgetAmount === null ? '0' : Decimal.min(new Decimal(currentMonth.expense).div(budgetAmount.toString()), 1).toString(),
        status: budgetStatus,
      },
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
      balance: byAccount.reduce((sum, account) => sum.plus(account.balance), new Decimal('0')).toString(),
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
          sent: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', Types.Decimal128.fromString('0')] } },
          received: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', Types.Decimal128.fromString('0')] } },
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
        sent: person.sent.toString(),
        received: person.received.toString(),
        net: new Decimal(person.received.toString()).minus(person.sent.toString()).toString(),
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
            sent: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', Types.Decimal128.fromString('0')] } },
            received: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', Types.Decimal128.fromString('0')] } },
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
        sent: summary.sent.toString(),
        received: summary.received.toString(),
        net: new Decimal(summary.received.toString()).minus(summary.sent.toString()).toString(),
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
          spent: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', Types.Decimal128.fromString('0')] } },
          received: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', Types.Decimal128.fromString('0')] } },
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
        spent: merchant.spent.toString(),
        received: merchant.received.toString(),
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
    const delta = parsed.data.type === 'credit'
      ? new Decimal(parsed.data.amount)
      : new Decimal(parsed.data.amount).negated();
    let balanceBefore = parsed.data.balanceBefore;
    let balanceAfter = parsed.data.balanceAfter;
    if (balanceAfter !== undefined && balanceBefore === undefined) {
      balanceBefore = new Decimal(balanceAfter).minus(delta).toString();
    }
    if (balanceBefore !== undefined && balanceAfter === undefined) {
      balanceAfter = new Decimal(balanceBefore).plus(delta).toString();
    }
    if (account && balanceBefore === undefined && balanceAfter === undefined) {
      balanceBefore = await getUserAccountBalances(userObjectId, new Date(transactionDate.getTime() - 1), account._id)
        .then((balances) => balances[0]?.balance);
      if (balanceBefore !== undefined) balanceAfter = new Decimal(balanceBefore).plus(delta).toString();
    }

    const counterparty = parsed.data.counterparty;
    const categoryId = await findOrCreateCategory(
      userObjectId,
      parsed.data.category,
      parsed.data.category.toLowerCase() === 'transfer'
        ? 'transfer'
        : parsed.data.type === 'credit' ? 'income' : 'expense',
    );
    const personId = parsed.data.counterpartyType === 'person'
      ? await findOrCreatePerson(userObjectId, counterparty)
      : undefined;
    const transaction = await TransactionModel.create({
      userId: userObjectId,
      accountId: account?._id,
      ...parsed.data,
      amount: decimal128(parsed.data.amount),
      balanceBefore: balanceBefore === undefined ? undefined : decimal128(balanceBefore),
      balanceAfter: balanceAfter === undefined ? undefined : decimal128(balanceAfter),
      categoryId,
      ...(personId ? { personId } : {}),
      isInternalTransfer: /\b(?:self transfer|own account|own accounts|internal transfer|between my accounts)\b/i.test(parsed.data.description ?? ''),
      date: transactionDate,
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

transactionRouter.delete('/:id', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const transactionId = request.params.id;
  if (!/^[a-f\d]{24}$/i.test(transactionId)) {
    return response.status(400).json({ success: false, error: 'Transaction ID is invalid.' });
  }

  try {
    const deleted = await TransactionModel.findOneAndDelete({
      _id: new Types.ObjectId(transactionId),
      userId: getUserObjectId(userId),
    });
    if (!deleted) {
      return response.status(404).json({ success: false, error: 'Transaction was not found.' });
    }

    return response.status(200).json({ success: true, message: 'Transaction deleted.' });
  } catch (error) {
    logger.error('Transaction delete request failed.', {
      message: errorResponse(error, 'Unknown transaction delete error.'),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Failed to delete transaction.' });
  }
});
