import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel } from '../../models/Account';
import { StatementImportModel } from '../../models/StatementImport';
import { TransactionModel } from '../../models/Transaction';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';
import {
  listTransactions,
  searchTransactions,
  type TransactionSort,
} from '../services/transaction-intelligence';

const moneySchema = z.string()
  .regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/, 'Enter an amount with at most two decimal places.')
  .refine((value) => {
    try {
      Types.Decimal128.fromString(value);
      return true;
    } catch {
      return false;
    }
  }, 'Enter a valid decimal amount.');

function toMinorUnits(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(['newest', 'oldest', 'highest_amount']).default('newest'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  minAmount: moneySchema.optional(),
  maxAmount: moneySchema.optional(),
  type: z.enum(['credit', 'debit']).optional(),
  accountId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  category: z.string().trim().min(1).max(60).optional(),
}).strict().refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  { path: ['to'], message: 'End date must be on or after start date.' },
).refine(
  (value) => value.minAmount === undefined || value.maxAmount === undefined ||
    toMinorUnits(value.minAmount) <= toMinorUnits(value.maxAmount),
  { path: ['maxAmount'], message: 'Maximum amount must be greater than or equal to minimum amount.' },
);

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();

const transactionIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const updateSchema = z.object({
  category: z.string().trim().min(1).max(60).optional(),
  note: z.string().trim().max(500).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide a category or note to update.');

export const transactionV1Router = Router();
transactionV1Router.use(verifyToken);

function serializeListResult(result: Awaited<ReturnType<typeof listTransactions>>) {
  return {
    ...result,
    data: result.data.map((row) => {
      const { _id, ...transaction } = row;
      return { ...transaction, id: String(_id) };
    }),
  };
}

function getUserId(request: { auth?: { userId: string } }): Types.ObjectId | null {
  return request.auth?.userId && Types.ObjectId.isValid(request.auth.userId)
    ? new Types.ObjectId(request.auth.userId)
    : null;
}

function serializeDetail(transaction: Record<string, unknown>, accountName: string | null, statement: {
  id: string;
  fileName: string;
} | null) {
  return {
    id: String(transaction._id),
    accountId: transaction.accountId ? String(transaction.accountId) : null,
    accountName,
    amount: String(transaction.amount),
    type: transaction.type,
    category: transaction.category,
    merchant: transaction.merchant,
    counterparty: transaction.counterparty ?? null,
    paymentMethod: transaction.paymentMethod ?? null,
    date: transaction.date instanceof Date ? transaction.date.toISOString() : null,
    time: transaction.transactionTime ?? null,
    balanceBefore: transaction.balanceBefore === undefined ? null : String(transaction.balanceBefore),
    balanceAfter: transaction.balanceAfter === undefined ? null : String(transaction.balanceAfter),
    referenceNumber: transaction.referenceNumber ?? null,
    note: transaction.note ?? null,
    source: transaction.source ?? 'manual',
    confidence: transaction.confidence ?? 1,
    description: transaction.description ?? null,
    sourceRowNumber: transaction.sourceRowNumber ?? null,
    isInternalTransfer: transaction.isInternalTransfer === true,
    transferGroupId: transaction.transferGroupId ? String(transaction.transferGroupId) : null,
    isLoanRepayment: transaction.isLoanRepayment === true,
    loanId: transaction.loanId ? String(transaction.loanId) : null,
    rawSourceData: transaction.rawSourceData ?? null,
    provenance: transaction.sourceProvenance ?? null,
    userCorrections: transaction.userCorrections ?? null,
    userEdits: transaction.userEdits ?? [],
    statement: statement ? {
      id: statement.id,
      fileName: statement.fileName,
      previewUrl: `/api/v1/statements/${statement.id}/preview`,
    } : null,
  };
}

transactionV1Router.get('/search', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const query = searchQuerySchema.safeParse(request.query);
  if (!query.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid transaction search.',
      details: query.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  try {
    const result = await searchTransactions(userId, query.data.q, query.data.page, query.data.limit);
    return response.status(200).json(serializeListResult(result));
  } catch (error) {
    logger.error('Transaction search failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not search transactions.' });
  }
});

transactionV1Router.get('/:id', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const parsedId = transactionIdSchema.safeParse(request.params.id);
  if (!parsedId.success) return response.status(400).json({ success: false, error: 'Transaction ID is invalid.' });

  try {
    const transaction = await TransactionModel.findOne({
      _id: new Types.ObjectId(parsedId.data),
      userId,
    })
      .select('+rawSourceData +sourceProvenance +userCorrections +userEdits')
      .lean();
    if (!transaction) return response.status(404).json({ success: false, error: 'Transaction was not found.' });
    const account = transaction.accountId
      ? await AccountModel.findOne({ _id: transaction.accountId, userId }).select('name')
      : null;
    const importId = transaction.statementImportId;
    const statementImport = importId
      ? await StatementImportModel.findOne({ _id: importId, userId }).select('fileName')
      : null;
    const statement = importId && statementImport
      ? { id: importId.toString(), fileName: statementImport.fileName }
      : null;
    return response.status(200).json({
      success: true,
      data: serializeDetail(
        transaction as unknown as Record<string, unknown>,
        account?.name ?? null,
        statement,
      ),
    });
  } catch (error) {
    logger.error('Transaction detail failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load transaction details.' });
  }
});

transactionV1Router.patch('/:id', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const parsedId = transactionIdSchema.safeParse(request.params.id);
  if (!parsedId.success) return response.status(400).json({ success: false, error: 'Transaction ID is invalid.' });
  const update = updateSchema.safeParse(request.body);
  if (!update.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid transaction update.',
      details: update.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }

  try {
    const filter = { _id: new Types.ObjectId(parsedId.data), userId };
    const transaction = await TransactionModel.findOne(filter).select('category note');
    if (!transaction) return response.status(404).json({ success: false, error: 'Transaction was not found.' });
    const edits = Object.entries(update.data).map(([field, value]) => ({
      field,
      previousValue: transaction.get(field) ?? null,
      value,
      editedAt: new Date(),
    }));
    const updated = await TransactionModel.findOneAndUpdate(
      filter,
      {
        $set: update.data,
        $push: { userEdits: { $each: edits } },
      },
      { new: true, runValidators: true },
    )
      .select('+rawSourceData +sourceProvenance +userCorrections +userEdits')
      .lean();
    if (!updated) return response.status(404).json({ success: false, error: 'Transaction was not found.' });

    const account = updated.accountId
      ? await AccountModel.findOne({ _id: updated.accountId, userId }).select('name')
      : null;
    const importId = updated.statementImportId;
    const statementImport = importId
      ? await StatementImportModel.findOne({ _id: importId, userId }).select('fileName')
      : null;
    const statement = importId && statementImport
      ? { id: importId.toString(), fileName: statementImport.fileName }
      : null;
    return response.status(200).json({
      success: true,
      data: serializeDetail(
        updated as unknown as Record<string, unknown>,
        account?.name ?? null,
        statement,
      ),
    });
  } catch (error) {
    logger.error('Transaction update failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not update transaction.' });
  }
});

transactionV1Router.get('/', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const parsedQuery = listQuerySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid transaction filters.',
      details: parsedQuery.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  try {
    const { page, limit, sort, accountId, ...filter } = parsedQuery.data;
    const result = await listTransactions({
      userId,
      ...filter,
      ...(accountId ? { accountId: new Types.ObjectId(accountId) } : {}),
      page,
      limit,
      sort: sort as TransactionSort,
    });
    return response.status(200).json(serializeListResult(result));
  } catch (error) {
    logger.error('Transaction list failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load transactions.' });
  }
});
