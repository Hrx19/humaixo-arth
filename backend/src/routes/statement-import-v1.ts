import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { Router, type Request } from 'express';
import multer from 'multer';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel } from '../../models/Account';
import { StatementImportModel } from '../../models/StatementImport';
import { TransactionModel } from '../../models/Transaction';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';
import { getAccountBalanceAt } from '../services/account-balances';
import { statementStorage } from '../services/statement-storage';
import { getStatementParser } from '../services/statement_parser';
import { findOrCreateCategory, findOrCreatePerson } from '../services/financial-directory';
import { recordNotification } from '../services/notifications';
import Decimal from 'decimal.js';
import type { NormalizedStatementRow, ParsedStatementRow } from '../services/statement_parser';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4, fieldSize: 1_024 },
});
const csvParser = getStatementParser('csv');

const accountIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value,
  'Enter a valid ISO date.',
);
const correctionSchema = z.object({
  rowNumber: z.number().int().min(2).max(10_001),
  date: isoDateSchema.nullable().optional(),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/).nullable().optional(),
  amount: z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,18})?$/)
    .refine((value) => new Decimal(value).isPositive(), 'Amount must be positive.')
    .nullable().optional(),
  direction: z.enum(['credit', 'debit']).nullable().optional(),
  description: z.string().trim().min(1).max(500).nullable().optional(),
  counterparty: z.string().trim().max(120).nullable().optional(),
  referenceNumber: z.string().trim().max(120).nullable().optional(),
}).strict();
const confirmSchema = z.object({ corrections: z.array(correctionSchema).max(10_000).default([]) }).strict();
type Correction = z.infer<typeof correctionSchema>;

export const statementImportV1Router = Router();
statementImportV1Router.use(verifyToken);

function getUserId(request: Request): Types.ObjectId | null {
  const userId = request.auth?.userId;
  return userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
}

function safeFileName(value: string): string {
  return (value.split(/[\\/]/).pop() ?? 'bank-statement.csv').trim().slice(0, 180) || 'bank-statement.csv';
}

async function decodeCsvUpload(request: Request): Promise<string> {
  const file = request.file;
  if (!file) throw Object.assign(new Error('Choose a CSV file to upload.'), { statusCode: 400 });
  if (!file.originalname.toLowerCase().endsWith('.csv')) {
    throw Object.assign(new Error('Only CSV statement files are accepted.'), { statusCode: 415 });
  }
  const mimeType = file.mimetype.toLowerCase();
  if (!['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'].includes(mimeType)) {
    throw Object.assign(new Error('The uploaded file MIME type is not an accepted CSV type.'), { statusCode: 415 });
  }
  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(file.buffer);
  if (detected) {
    throw Object.assign(new Error('The file contents are not a plain-text CSV statement.'), { statusCode: 415 });
  }

  let contents: string;
  try {
    contents = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
  } catch {
    throw Object.assign(new Error('CSV must be encoded as UTF-8.'), { statusCode: 415 });
  }
  if (!contents.trim() || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(contents)) {
    throw Object.assign(new Error('The uploaded file is not valid UTF-8 CSV text.'), { statusCode: 415 });
  }
  return contents;
}

function getIssueLog(rows: ParsedStatementRow[]): Array<Record<string, unknown>> {
  return rows.flatMap(({ normalized }) => normalized.issues.map((message) => ({
    rowNumber: normalized.rowNumber,
    code: 'row_validation',
    message,
    status: 'needs_review',
  })));
}

async function loadRawRows(storageKey: string | undefined, parserVersion: string): Promise<Map<number, ParsedStatementRow['raw']>> {
  if (!storageKey || !['csv-v1', csvParser.version].includes(parserVersion)) {
    throw Object.assign(new Error('The original statement source is unavailable for this parser version.'), { statusCode: 409 });
  }
  const contents = new TextDecoder('utf-8', { fatal: true }).decode(await statementStorage.read(storageKey));
  const parsedRows = csvParser.parse(contents);
  return new Map(parsedRows.map((row) => [row.raw.rowNumber, row.raw]));
}

function applyCorrections(row: NormalizedStatementRow, correction?: Correction): NormalizedStatementRow {
  if (!correction) return row;
  return {
    ...row,
    ...(correction.date !== undefined ? { date: correction.date } : {}),
    ...(correction.time !== undefined ? { time: correction.time } : {}),
    ...(correction.amount !== undefined ? { amount: correction.amount } : {}),
    ...(correction.direction !== undefined ? { direction: correction.direction } : {}),
    ...(correction.description !== undefined ? { description: correction.description } : {}),
    ...(correction.counterparty !== undefined ? { counterparty: correction.counterparty } : {}),
    ...(correction.referenceNumber !== undefined ? { referenceNumber: correction.referenceNumber } : {}),
  };
}

function rowDedupeKey(accountId: string, row: NormalizedStatementRow): string {
  return createHash('sha256')
    .update(JSON.stringify([
      accountId,
      row.date,
      row.amount,
      row.direction,
      row.description?.normalize('NFKC').trim(),
      row.counterparty?.normalize('NFKC').trim() ?? '',
      row.referenceNumber?.trim() ?? '',
    ]))
    .digest('hex');
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

statementImportV1Router.post('/upload', upload.single('file'), async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const accountId = accountIdSchema.safeParse(request.body.accountId);
  if (!accountId.success) return response.status(400).json({ success: false, error: 'A valid accountId is required.' });

  try {
    const contents = await decodeCsvUpload(request);
    const account = await AccountModel.findOne({
      _id: accountId.data,
      userId,
      isArchived: false,
    }).select('_id name institution');
    if (!account) return response.status(404).json({ success: false, error: 'Selected account was not found.' });

    const file = request.file;
    if (!file) return response.status(400).json({ success: false, error: 'Choose a CSV file to upload.' });
    const fileName = safeFileName(file.originalname);
    const fileHash = createHash('sha256').update(account._id.toString()).update('\n').update(file.buffer).digest('hex');
    const priorImport = await StatementImportModel.findOne({ userId, accountId: account._id, fileHash });
    if (priorImport) {
      priorImport.import_logs.push({
        rowNumber: 0,
        code: 'duplicate_upload',
        message: 'An identical file was uploaded before; this upload is linked to the existing review.',
        status: 'duplicate_suspected',
        occurredAt: new Date(),
      });
      await priorImport.save();
      return response.status(200).json({
        success: true,
        data: { statementId: priorImport._id.toString(), fileName: priorImport.fileName, duplicateUpload: true },
      });
    }

    let parsedRows: ParsedStatementRow[];
    try {
      parsedRows = csvParser.parse(contents);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CSV structure could not be parsed.';
      return response.status(422).json({
        success: false,
        error: message,
        issues: [{ rowNumber: 1, code: 'file_parse_failed', message }],
      });
    }
    const storageKey = await statementStorage.store(file.buffer);
    const dates = parsedRows.flatMap(({ normalized }) => normalized.date ? [new Date(normalized.date)] : []);
    const issues = getIssueLog(parsedRows);
    let statement;
    try {
      statement = await StatementImportModel.create({
        userId,
        accountId: account._id,
        fileName,
        fileHash,
        storageKey,
        parserVersion: csvParser.version,
        status: 'pending_review',
        totalRows: parsedRows.length,
        importedRows: 0,
        duplicateRows: 0,
        rejectedRows: new Set(issues.map((issue) => issue.rowNumber)).size,
        normalizedRows: parsedRows.map(({ normalized }) => normalized),
        import_logs: issues,
        periodStart: dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : undefined,
        periodEnd: dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : undefined,
      });
    } catch (error) {
      await statementStorage.remove(storageKey);
      if (isDuplicateKeyError(error)) {
        const existing = await StatementImportModel.findOne({ userId, fileHash });
        if (existing) {
          existing.import_logs.push({
            rowNumber: 0,
            code: 'duplicate_upload',
            message: 'An identical file was uploaded concurrently; this upload is linked to the existing review.',
            status: 'duplicate_suspected',
            occurredAt: new Date(),
          });
          await existing.save();
          return response.status(200).json({
            success: true,
            data: { statementId: existing._id.toString(), fileName: existing.fileName, duplicateUpload: true },
          });
        }
      }
      throw error;
    }

    return response.status(201).json({
      success: true,
      data: { statementId: statement._id.toString(), fileName, rowCount: parsedRows.length },
    });
  } catch (error) {
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (statusCode >= 500) {
      logger.error('Statement upload failed.', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return response.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Statement upload failed.',
    });
  }
});

statementImportV1Router.get('/:id/preview', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  if (!Types.ObjectId.isValid(request.params.id)) return response.status(400).json({ success: false, error: 'Statement ID is invalid.' });

  try {
    const statement = await StatementImportModel.findOne({ _id: request.params.id, userId })
      .select('+storageKey')
      .lean();
    if (!statement) return response.status(404).json({ success: false, error: 'Statement was not found.' });
    const rawRows = await loadRawRows(statement.storageKey, statement.parserVersion);
    const account = await AccountModel.findOne({ _id: statement.accountId, userId }).select('name institution');
    return response.status(200).json({
      success: true,
      data: {
        id: statement._id.toString(),
        fileName: statement.fileName,
        status: statement.status,
        account: account ? { id: statement.accountId.toString(), name: account.name, institution: account.institution } : null,
        totalRows: statement.totalRows,
        importedRows: statement.importedRows,
        duplicateRows: statement.duplicateRows,
        rejectedRows: statement.rejectedRows,
        period: {
          from: statement.periodStart?.toISOString() ?? null,
          to: statement.periodEnd?.toISOString() ?? null,
        },
        rows: statement.normalizedRows.map((normalized) => {
          const row = normalized as NormalizedStatementRow;
          return {
            raw: rawRows.get(row.rowNumber) ?? null,
            normalized: {
              ...row,
              amount: row.amount == null ? null : String(row.amount),
            },
          };
        }),
        issues: statement.import_logs,
        result: statement.result
          ? {
            ...statement.result,
            ...(statement.result.currentBalance !== undefined
              ? { currentBalance: statement.result.currentBalance == null ? null : String(statement.result.currentBalance) }
              : {}),
          }
          : null,
      },
    });
  } catch (error) {
    logger.error('Statement preview failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load statement preview.' });
  }
});

statementImportV1Router.post('/:id/confirm', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  if (!Types.ObjectId.isValid(request.params.id)) return response.status(400).json({ success: false, error: 'Statement ID is invalid.' });
  const parsedBody = confirmSchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return response.status(400).json({
      success: false,
      error: 'Corrections are invalid.',
      details: parsedBody.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  const correctionMap = new Map<number, Correction>();
  for (const correction of parsedBody.data.corrections) {
    if (correctionMap.has(correction.rowNumber)) {
      return response.status(400).json({ success: false, error: `Correction for row ${correction.rowNumber} is repeated.` });
    }
    correctionMap.set(correction.rowNumber, correction);
  }

  const sourceStatement = await StatementImportModel.findOne({ _id: request.params.id, userId })
    .select('+storageKey');
  if (!sourceStatement) return response.status(404).json({ success: false, error: 'Statement was not found.' });
  let rawRows: Map<number, ParsedStatementRow['raw']>;
  try {
    rawRows = sourceStatement.status === 'confirmed'
      ? new Map()
      : await loadRawRows(sourceStatement.storageKey, sourceStatement.parserVersion);
  } catch (error) {
    return response.status(
      typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500,
    ).json({ success: false, error: error instanceof Error ? error.message : 'Original statement source could not be loaded.' });
  }

  const session = await mongoose.startSession();
  let result: Record<string, unknown> | null = null;
  let responseStatus = 200;
  try {
    await session.withTransaction(async () => {
      const statement = await StatementImportModel.findOne({ _id: request.params.id, userId }).session(session);
      if (!statement) throw Object.assign(new Error('Statement was not found.'), { statusCode: 404 });
      if (statement.status === 'confirmed') {
        result = statement.result ?? {
          statementId: statement._id.toString(),
          importedRows: statement.importedRows,
          duplicateRows: statement.duplicateRows,
          rejectedRows: statement.rejectedRows,
        };
        return;
      }

      const account = await AccountModel.findOne({
        _id: statement.accountId,
        userId,
        isArchived: false,
      }).session(session);
      if (!account) throw Object.assign(new Error('Selected account was not found.'), { statusCode: 404 });

      const rows = statement.normalizedRows.map((stored) => {
        const row = stored as NormalizedStatementRow;
        return { ...row, amount: row.amount == null ? null : String(row.amount) };
      });
      const knownRowNumbers = new Set(rows.map((row) => row.rowNumber));
      const unknownCorrectionRows = [...correctionMap.keys()].filter((rowNumber) => !knownRowNumbers.has(rowNumber));
      if (unknownCorrectionRows.length) {
        throw Object.assign(
          new Error(`Corrections reference unknown row(s): ${unknownCorrectionRows.join(', ')}.`),
          { statusCode: 400 },
        );
      }
      const candidates = rows.map((row) => ({
        original: row,
        normalized: applyCorrections(row, correctionMap.get(row.rowNumber)),
        raw: rawRows.get(row.rowNumber),
      }));
      const rejected: Array<Record<string, unknown>> = [];
      const valid = candidates.filter(({ normalized, raw }) => {
        const rowIssues: string[] = [];
        if (!normalized.date || !Number.isFinite(Date.parse(normalized.date))) rowIssues.push('A valid date is required.');
        if (normalized.amount === null || !normalized.amount || !new Decimal(normalized.amount).isFinite() || !new Decimal(normalized.amount).isPositive()) rowIssues.push('A positive amount is required.');
        if (!normalized.direction) rowIssues.push('Credit or debit direction is required.');
        if (!normalized.description?.trim()) rowIssues.push('A description is required.');
        if (!raw) rowIssues.push('Original row data is unavailable.');
        if (rowIssues.length) {
          rejected.push({
            rowNumber: normalized.rowNumber,
            code: 'row_rejected',
            message: rowIssues.join(' '),
            status: 'rejected',
            occurredAt: new Date(),
          });
          return false;
        }
        return true;
      });

      const keys = new Set<string>();
      const accepted: typeof valid = [];
      let duplicateRows = 0;
      for (const candidate of valid) {
        const key = rowDedupeKey(account._id.toString(), candidate.normalized);
        if (keys.has(key)) {
          duplicateRows += 1;
          rejected.push({
            rowNumber: candidate.normalized.rowNumber,
            code: 'duplicate_suspected',
            message: 'Duplicate transaction within this statement; row was not imported.',
            status: 'duplicate_suspected',
            occurredAt: new Date(),
          });
          continue;
        }
        keys.add(key);
        accepted.push(candidate);
      }

      const candidateKeys = accepted.map(({ normalized }) => rowDedupeKey(account._id.toString(), normalized));
      const existing = candidateKeys.length
        ? await TransactionModel.find({ userId, dedupeKey: { $in: candidateKeys } })
          .select('dedupeKey')
          .session(session)
          .lean()
        : [];
      const existingKeys = new Set(existing.flatMap((transaction) => transaction.dedupeKey ? [transaction.dedupeKey] : []));
      const insertCandidates = accepted.flatMap(({ original, normalized, raw }) => {
        const dedupeKey = rowDedupeKey(account._id.toString(), normalized);
        if (existingKeys.has(dedupeKey)) {
          duplicateRows += 1;
          rejected.push({
            rowNumber: normalized.rowNumber,
            code: 'duplicate_suspected',
            message: 'Matching transaction already exists in this account; row was not imported.',
            status: 'duplicate_suspected',
            occurredAt: new Date(),
          });
          return [];
        }
        const correction = correctionMap.get(normalized.rowNumber);
        const provenance = { ...original.provenance };
        if (correction) {
          for (const field of Object.keys(correction)) {
            if (field !== 'rowNumber') provenance[field] = {
              sourceColumn: null,
              parserVersion: 'user-correction',
              confidence: 1,
            };
          }
        }
        const merchantProvenance = normalized.counterparty
          ? provenance.counterparty
          : provenance.description;
        provenance.merchant = merchantProvenance ?? null;
        return [{
          userId,
          accountId: account._id,
          amount: Types.Decimal128.fromString(normalized.amount!),
          type: normalized.direction!,
          category: 'Uncategorised',
          merchant: normalized.counterparty ?? normalized.description!,
          counterparty: normalized.counterparty ?? undefined,
          date: new Date(normalized.date!),
          transactionTime: normalized.time,
          referenceNumber: normalized.referenceNumber ?? undefined,
          description: normalized.description!,
          source: 'statement' as const,
          isInternalTransfer: /\b(?:self transfer|own account|own accounts|internal transfer|between my accounts)\b/i.test(normalized.description!),
          confidence: Object.values(provenance).reduce((total, item) => total + (item?.confidence ?? 0), 0)
            / Math.max(Object.values(provenance).filter(Boolean).length, 1),
          dedupeKey,
          statementImportId: statement._id,
          sourceRowNumber: normalized.rowNumber,
          rawSourceData: raw,
          sourceProvenance: provenance,
          ...(correction ? { userCorrections: correction } : {}),
        }];
      });
      const inserts = await Promise.all(insertCandidates.map(async (transaction) => {
        const [categoryId, personId] = await Promise.all([
          findOrCreateCategory(
            userId,
            transaction.category,
            transaction.isInternalTransfer ? 'transfer' : transaction.type === 'credit' ? 'income' : 'expense',
            session,
          ),
          findOrCreatePerson(
            userId,
            transaction.counterparty &&
              (/@/.test(transaction.counterparty) || /\b(?:sent to|received from|self transfer|own account)\b/i.test(transaction.description))
              ? transaction.counterparty
              : null,
            session,
          ),
        ]);
        return { ...transaction, categoryId, ...(personId ? { personId } : {}) };
      }));

      if (inserts.length) await TransactionModel.insertMany(inserts, { session, ordered: true });
      const importedRows = inserts.length;
      const correctedRowNumbers = new Set(correctionMap.keys());
      const resolvedIssues = statement.import_logs.map((issue) => {
        if (typeof issue !== 'object' || issue === null || !('rowNumber' in issue) || !('code' in issue)) return issue;
        if (
          typeof issue.rowNumber === 'number' &&
          correctedRowNumbers.has(issue.rowNumber) &&
          issue.code === 'row_validation'
        ) {
          return { ...issue, status: 'reviewed_by_user', reviewedAt: new Date() };
        }
        return issue;
      });
      const nextIssues = [...resolvedIssues, ...rejected];
      const rejectedRows = rejected.filter((issue) => issue.status === 'rejected').length;
      const currentBalance = await getAccountBalanceAt(userId, account, new Date(), session);
      account.set('currentBalance', Types.Decimal128.fromString(currentBalance));
      await account.save({ session });

      result = {
        statementId: statement._id.toString(),
        fileName: statement.fileName,
        account: account.name,
        totalRows: statement.totalRows,
        importedRows,
        duplicateRows,
        rejectedRows,
        currentBalance,
        period: {
          from: statement.periodStart?.toISOString() ?? null,
          to: statement.periodEnd?.toISOString() ?? null,
        },
      };
      statement.status = 'confirmed';
      statement.importedRows = importedRows;
      statement.duplicateRows += duplicateRows;
      statement.rejectedRows = rejectedRows;
      statement.import_logs = nextIssues;
      statement.corrections = parsedBody.data.corrections;
      statement.confirmedAt = new Date();
      statement.result = result;
      await statement.save({ session });
      responseStatus = 201;
    });
    await recordNotification({
      userId,
      type: 'import_completed',
      message: 'Statement import completed. Your imported transactions are ready to review.',
      relatedEntityId: sourceStatement._id,
      dedupeKey: `statement-import:${sourceStatement._id.toString()}`,
    });
    return response.status(responseStatus).json({ success: true, data: result });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      await StatementImportModel.updateOne(
        { _id: request.params.id, userId },
        {
          $push: {
            import_logs: {
              rowNumber: 0,
              code: 'concurrent_duplicate',
              message: 'A concurrent import created a matching transaction; retry preview to see its final status.',
              status: 'duplicate_suspected',
              occurredAt: new Date(),
            },
          },
        },
      );
      return response.status(409).json({ success: false, error: 'A matching transaction was imported concurrently; the statement remains available for review.' });
    }
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (statusCode >= 500) {
      logger.error('Statement confirmation failed.', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return response.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Could not confirm statement.',
    });
  } finally {
    await session.endSession();
  }
});
