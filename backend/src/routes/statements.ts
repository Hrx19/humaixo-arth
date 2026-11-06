import { Router } from 'express';
import Decimal from 'decimal.js';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel } from '../../models/Account';
import { StatementImportModel } from '../../models/StatementImport';
import { TransactionModel, type TransactionType } from '../../models/Transaction';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';
import { getAccountBalanceAt } from '../services/account-balances';
import { findOrCreateCategory, findOrCreatePerson } from '../services/financial-directory';
import { hashStatement, parseStatementCsv, type StatementCandidate } from '../services/statement-csv';

const statementRequestSchema = z.object({
  accountId: z.string().regex(/^[a-f\d]{24}$/i),
  fileName: z.string().trim().min(1).max(180),
  csvContent: z.string().min(1).max(5_000_000),
}).strict();

type ExistingLedgerEntry = {
  _id: Types.ObjectId;
  date: Date;
  amount: Types.Decimal128;
  type: TransactionType;
  balanceAfter?: Types.Decimal128;
  dedupeKey?: string;
};

type LedgerEvent =
  | { kind: 'existing'; date: Date; id: string; entry: ExistingLedgerEntry }
  | { kind: 'new'; date: Date; id: string; candidate: StatementCandidate };

export const statementRouter = Router();
statementRouter.use(verifyToken);

function getUserObjectId(userId: string): Types.ObjectId {
  return new Types.ObjectId(userId);
}

function safeFileName(value: string): string {
  return (value.split(/[\\/]/).pop() ?? 'bank-statement.csv').trim().slice(0, 180);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function getIssueCounts(issues: Array<{ message: string }>): { duplicates: number; rejected: number } {
  return issues.reduce(
    (counts, issue) => {
      if (issue.message.toLowerCase().includes('duplicate')) counts.duplicates += 1;
      else counts.rejected += 1;
      return counts;
    },
    { duplicates: 0, rejected: 0 },
  );
}

function transactionDelta(type: TransactionType, amount: string): string {
  const value = new Decimal(amount);
  return (type === 'credit' ? value : value.negated()).toString();
}

async function parseOwnedStatement(
  userId: Types.ObjectId,
  body: z.infer<typeof statementRequestSchema>,
) {
  const account = await AccountModel.findOne({
    _id: body.accountId,
    userId,
    isArchived: false,
  });
  if (!account) {
    throw Object.assign(new Error('Selected account was not found.'), { statusCode: 404 });
  }

  const parsed = parseStatementCsv(body.csvContent, account._id.toString());
  if (parsed.rows.length === 0) {
    throw Object.assign(new Error('No valid transactions were found in this statement.'), {
      statusCode: 422,
      issues: parsed.issues.slice(0, 20),
    });
  }

  const fileName = safeFileName(body.fileName);
  const fileHash = hashStatement(account._id.toString(), body.csvContent);
  const dedupeKeys = parsed.rows.map((row) => row.dedupeKey);
  const existing = await TransactionModel.find({
    userId,
    accountId: account._id,
    dedupeKey: { $in: dedupeKeys },
  })
    .select('dedupeKey')
    .lean();
  const existingKeys = new Set(
    existing.flatMap((transaction) => transaction.dedupeKey ? [transaction.dedupeKey] : []),
  );
  const newRows = parsed.rows.filter((row) => !existingKeys.has(row.dedupeKey));
  const issueCounts = getIssueCounts(parsed.issues);

  return {
    account,
    parsed,
    fileName,
    fileHash,
    newRows,
    duplicateCount: issueCounts.duplicates + existingKeys.size,
    rejectedCount: issueCounts.rejected,
  };
}

function serializeCandidate(candidate: StatementCandidate) {
  return {
    date: candidate.date.toISOString(),
    amount: candidate.amount,
    type: candidate.type,
    merchant: candidate.merchant,
    counterparty: candidate.counterparty ?? null,
    category: candidate.category,
    paymentMethod: candidate.paymentMethod ?? null,
    balanceBefore: candidate.balanceBefore ?? null,
    balanceAfter: candidate.balanceAfter ?? null,
    referenceNumber: candidate.referenceNumber ?? null,
  };
}

statementRouter.get('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  try {
    const imports = await StatementImportModel.find({ userId: getUserObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return response.status(200).json(
      imports.map((entry) => ({
        id: entry._id.toString(),
        accountId: entry.accountId.toString(),
        fileName: entry.fileName,
        totalRows: entry.totalRows,
        importedRows: entry.importedRows,
        duplicateRows: entry.duplicateRows,
        rejectedRows: entry.rejectedRows,
        periodStart: entry.periodStart?.toISOString() ?? null,
        periodEnd: entry.periodEnd?.toISOString() ?? null,
        createdAt: entry.createdAt?.toISOString() ?? new Date().toISOString(),
      })),
    );
  } catch (error) {
    logger.error('Statement import history request failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load statement history.' });
  }
});

statementRouter.post('/preview', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsedRequest = statementRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid statement upload.',
      details: parsedRequest.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const result = await parseOwnedStatement(getUserObjectId(userId), parsedRequest.data);
    const issueCounts = getIssueCounts(result.parsed.issues);
    return response.status(200).json({
      fileName: result.fileName,
      account: {
        id: result.account._id.toString(),
        name: result.account.name,
        institution: result.account.institution,
      },
      totalRows: result.parsed.totalRows,
      validRows: result.parsed.rows.length,
      newRows: result.newRows.length,
      duplicateRows: result.duplicateCount,
      rejectedRows: issueCounts.rejected,
      rowsWithBalance: result.parsed.rows.filter((row) => row.balanceAfter !== undefined).length,
      personTransfers: result.parsed.rows.filter((row) => row.counterpartyType === 'person').length,
      period: {
        from: result.parsed.periodStart?.toISOString() ?? null,
        to: result.parsed.periodEnd?.toISOString() ?? null,
      },
      sample: result.parsed.rows.slice(0, 10).map(serializeCandidate),
      issues: result.parsed.issues.slice(0, 20),
      alreadyImported: await StatementImportModel.exists({
        userId: getUserObjectId(userId),
        fileHash: result.fileHash,
      }).then(Boolean),
    });
  } catch (error) {
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 400;
    const issues =
      typeof error === 'object' && error !== null && 'issues' in error && Array.isArray(error.issues)
        ? error.issues
        : undefined;
    return response.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Could not preview statement.',
      ...(issues ? { issues } : {}),
    });
  }
});

statementRouter.post('/import', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsedRequest = statementRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid statement upload.',
      details: parsedRequest.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const userObjectId = getUserObjectId(userId);
  let session: mongoose.ClientSession | undefined;

  try {
    const result = await parseOwnedStatement(userObjectId, parsedRequest.data);
    const alreadyImported = await StatementImportModel.exists({
      userId: userObjectId,
      fileHash: result.fileHash,
    });
    if (alreadyImported) {
      return response.status(409).json({
        success: false,
        error: 'This exact statement file has already been imported for the selected account.',
      });
    }
    if (result.newRows.length === 0) {
      return response.status(409).json({
        success: false,
        error: 'Every valid transaction in this statement is already in your ledger.',
      });
    }

    const sortedRows = [...result.newRows].sort(
      (left, right) => left.date.getTime() - right.date.getTime(),
    );
    const firstDate = sortedRows[0].date;
    const lastDate = sortedRows[sortedRows.length - 1].date;
    const existingRows = await TransactionModel.find({
      userId: userObjectId,
      accountId: result.account._id,
      date: { $gte: firstDate, $lte: lastDate },
    })
      .select('_id date amount type balanceAfter dedupeKey')
      .sort({ date: 1, _id: 1 })
      .lean<ExistingLedgerEntry[]>();

    const events: LedgerEvent[] = [
      ...existingRows.map((entry) => ({
        kind: 'existing' as const,
        date: entry.date,
        id: entry._id.toString(),
        entry,
      })),
      ...sortedRows.map((candidate) => ({
        kind: 'new' as const,
        date: candidate.date,
        id: candidate.dedupeKey,
        candidate,
      })),
    ].sort((left, right) => {
      const dateDifference = left.date.getTime() - right.date.getTime();
      return dateDifference !== 0 ? dateDifference : left.id.localeCompare(right.id);
    });

    let runningBalance = await getAccountBalanceAt(
      userObjectId,
      result.account,
      new Date(firstDate.getTime() - 1),
    );
    const balancesByKey = new Map<string, { balanceBefore: string; balanceAfter: string }>();

    for (const event of events) {
      if (event.kind === 'existing') {
        if (event.entry.balanceAfter !== undefined) {
          runningBalance = event.entry.balanceAfter.toString();
        } else {
          runningBalance = new Decimal(runningBalance)
            .plus(transactionDelta(event.entry.type, event.entry.amount.toString()))
            .toString();
        }
        continue;
      }

      const candidate = event.candidate;
      const delta = transactionDelta(candidate.type, candidate.amount);
      const balanceBefore = candidate.balanceAfter === undefined
        ? runningBalance
        : new Decimal(candidate.balanceAfter).minus(delta).toString();
      const balanceAfter = candidate.balanceAfter ?? new Decimal(balanceBefore).plus(delta).toString();
      balancesByKey.set(candidate.dedupeKey, { balanceBefore, balanceAfter });
      runningBalance = balanceAfter;
    }

    session = await mongoose.startSession();
    let importedRows = 0;
    let statementId = '';

    await session.withTransaction(async () => {
      const [statementImport] = await StatementImportModel.create(
        [
          {
            userId: userObjectId,
            accountId: result.account._id,
            fileName: result.fileName,
            fileHash: result.fileHash,
            totalRows: result.parsed.totalRows,
            importedRows: 0,
            duplicateRows: result.duplicateCount,
            rejectedRows: result.rejectedCount,
            periodStart: result.parsed.periodStart,
            periodEnd: result.parsed.periodEnd,
          },
        ],
        { session },
      );
      statementId = statementImport._id.toString();

      const operations = await Promise.all(result.newRows.map(async (candidate) => {
        const balance = balancesByKey.get(candidate.dedupeKey);
        const [categoryId, personId] = await Promise.all([
          findOrCreateCategory(
            userObjectId,
            candidate.category,
            candidate.category.toLowerCase() === 'transfer'
              ? 'transfer'
              : candidate.type === 'credit' ? 'income' : 'expense',
            session,
          ),
          findOrCreatePerson(
            userObjectId,
            candidate.counterpartyType === 'person' ? candidate.counterparty : null,
            session,
          ),
        ]);
        return {
          updateOne: {
            filter: { userId: userObjectId, dedupeKey: candidate.dedupeKey },
            update: {
              $setOnInsert: {
                userId: userObjectId,
                accountId: result.account._id,
                amount: Types.Decimal128.fromString(candidate.amount),
                type: candidate.type,
                category: candidate.category,
                merchant: candidate.merchant,
                counterparty: candidate.counterparty,
                counterpartyKey: candidate.counterpartyKey,
                counterpartyType: candidate.counterpartyType,
                paymentMethod: candidate.paymentMethod,
                date: candidate.date,
                balanceBefore: balance?.balanceBefore ? Types.Decimal128.fromString(balance.balanceBefore) : undefined,
                balanceAfter: balance?.balanceAfter ? Types.Decimal128.fromString(balance.balanceAfter) : undefined,
                referenceNumber: candidate.referenceNumber,
                description: candidate.description,
                source: 'statement',
                confidence: candidate.counterparty ? 0.85 : 0.7,
                dedupeKey: candidate.dedupeKey,
                statementImportId: statementImport._id,
                categoryId,
                ...(personId ? { personId } : {}),
                isInternalTransfer: candidate.isInternalTransfer,
              },
            },
            upsert: true,
          },
        };
      }));

      const bulkResult = await TransactionModel.bulkWrite(operations, { session, ordered: true });
      importedRows = bulkResult.upsertedCount;
      await StatementImportModel.updateOne(
        { _id: statementImport._id, userId: userObjectId },
        { $set: { importedRows } },
        { session },
      );
    });

    return response.status(201).json({
      success: true,
      statementId,
      fileName: result.fileName,
      account: result.account.name,
      totalRows: result.parsed.totalRows,
      importedRows,
      duplicateRows: result.duplicateCount,
      rejectedRows: result.rejectedCount,
      period: {
        from: result.parsed.periodStart?.toISOString() ?? null,
        to: result.parsed.periodEnd?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return response.status(409).json({
        success: false,
        error: 'This statement or one of its transactions was imported at the same time.',
      });
    }

    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (statusCode === 400 || statusCode === 404 || statusCode === 422) {
      return response.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Could not import statement.',
      });
    }

    logger.error('Statement import failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Statement import failed.' });
  } finally {
    await session?.endSession();
  }
});
