import { createHash } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel } from '../../models/Account';
import { TransactionModel } from '../../models/Transaction';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
  fileFilter(_request, file, callback) {
    const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    if (!isPdf) {
      callback(new Error('Choose a PDF bank statement.'));
      return;
    }
    callback(null, true);
  },
});

const parseUpload: RequestHandler = (request, response, next) => {
  upload.single('file')(request, response, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      response.status(tooLarge ? 413 : 400).json({
        success: false,
        error: tooLarge ? 'PDF files must be 5 MB or smaller.' : 'Upload one PDF file.',
      });
      return;
    }

    if (error instanceof Error) {
      response.status(400).json({ success: false, error: error.message });
      return;
    }

    next(error);
  });
};

const uploadSchema = z.object({
  accountId: z.string().regex(/^[a-f\d]{24}$/i),
}).strict();

const datePattern =
  /\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}[- ](?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[- ]\d{2,4})\b/i;
const amountPattern = /-?\d[\d,]*(?:\.\d{1,2})?/g;
const monthNumbers: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

type ParsedPdfTransaction = {
  date: Date;
  amount: number;
  type: 'credit' | 'debit';
  merchant: string;
  category: string;
  balanceAfter?: number;
};

function parseDate(value: string): Date | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));

  const named = /^(\d{1,2})[- ]([A-Z]{3})[- ](\d{2,4})$/i.exec(value);
  if (named) {
    const month = monthNumbers[named[2].toUpperCase()];
    if (month === undefined) return null;
    const rawYear = Number(named[3]);
    const year = rawYear < 100 ? (rawYear < 70 ? 2000 + rawYear : 1900 + rawYear) : rawYear;
    return new Date(Date.UTC(year, month, Number(named[1])));
  }

  const indian = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(value);
  if (!indian) return null;
  const rawYear = Number(indian[3]);
  const year = rawYear < 100 ? (rawYear < 70 ? 2000 + rawYear : 1900 + rawYear) : rawYear;
  const date = new Date(Date.UTC(year, Number(indian[2]) - 1, Number(indian[1])));
  return date.getUTCDate() === Number(indian[1]) ? date : null;
}

function categoryFor(description: string, type: ParsedPdfTransaction['type']): string {
  const normalized = description.toLowerCase();
  if (type === 'credit') return /salary|payroll/.test(normalized) ? 'Salary' : 'Income';
  if (/swiggy|zomato|restaurant|food|cafe/.test(normalized)) return 'Food';
  if (/uber|ola|irctc|flight|travel|metro/.test(normalized)) return 'Travel';
  if (/electric|water|gas|bill|recharge|broadband/.test(normalized)) return 'Bills';
  if (/amazon|flipkart|shopping|mall/.test(normalized)) return 'Shopping';
  if (/petrol|fuel|indian oil|bharat petroleum/.test(normalized)) return 'Fuel';
  if (/hospital|pharmacy|medical|clinic/.test(normalized)) return 'Healthcare';
  return 'Other';
}

function parseStatementLines(text: string): ParsedPdfTransaction[] {
  const parsed: ParsedPdfTransaction[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    const dateMatch = datePattern.exec(line);
    if (!dateMatch) continue;

    const date = parseDate(dateMatch[1]);
    if (!date) continue;

    const withoutDate = line.replace(dateMatch[0], ' ');
    const values = [...withoutDate.matchAll(amountPattern)]
      .map((match) => Number(match[0].replace(/,/g, '')))
      .filter(Number.isFinite);
    if (values.length === 0) continue;

    const balanceAfter = values.length > 1 ? Math.abs(values[values.length - 1]) : undefined;
    const amountValues = values.length > 1 ? values.slice(0, -1) : values;
    const amount = Math.abs([...amountValues].reverse().find((value) => value !== 0) ?? 0);
    if (amount <= 0) continue;

    const description = withoutDate
      .replace(amountPattern, ' ')
      .replace(/\b(?:DR|CR|DEBIT|CREDIT|BALANCE|INR|RS\.?)\b/gi, ' ')
      .replace(/[|,;:_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!description || description.length > 180) continue;

    const type: ParsedPdfTransaction['type'] =
      /\b(?:CR|CREDIT|DEPOSIT|SALARY|RECEIVED)\b/i.test(line) ? 'credit' : 'debit';
    parsed.push({
      date,
      amount,
      type,
      merchant: description.slice(0, 120),
      category: categoryFor(description, type),
      ...(balanceAfter !== undefined ? { balanceAfter } : {}),
    });
  }

  return parsed;
}

function getDedupeKey(accountId: Types.ObjectId, transaction: ParsedPdfTransaction): string {
  return createHash('sha256')
    .update([
      accountId.toString(),
      transaction.date.toISOString(),
      transaction.amount.toFixed(2),
      transaction.type,
      transaction.merchant.toLocaleLowerCase('en-IN'),
    ].join('|'))
    .digest('hex');
}

export const pdfParserRouter = Router();
pdfParserRouter.use(verifyToken);

pdfParserRouter.post('/', parseUpload, async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsedBody = uploadSchema.safeParse(request.body);
  if (!parsedBody.success) {
    return response.status(400).json({
      success: false,
      error: 'Choose a valid account for this statement.',
    });
  }

  const file = request.file;
  if (!file) {
    return response.status(400).json({ success: false, error: 'Select a PDF statement to upload.' });
  }
  if (file.buffer.length < 5 || file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return response.status(400).json({ success: false, error: 'The selected file is not a valid PDF.' });
  }

  const userObjectId = new Types.ObjectId(userId);
  const accountId = new Types.ObjectId(parsedBody.data.accountId);
  const account = await AccountModel.findOne({
    _id: accountId,
    userId: userObjectId,
    isArchived: false,
  });
  if (!account) {
    return response.status(404).json({ success: false, error: 'Selected account was not found.' });
  }

  const parser = new PDFParse({ data: file.buffer });
  let extractedText: string;
  try {
    extractedText = (await parser.getText()).text;
  } catch (error) {
    logger.warn('PDF statement text extraction failed.', {
      message: error instanceof Error ? error.message : String(error),
      userId,
      fileSize: file.size,
    });
    return response.status(422).json({
      success: false,
      error: 'Could not read this PDF statement. Try an exported digital statement.',
    });
  } finally {
    await parser.destroy();
  }

  const transactions = parseStatementLines(extractedText);
  if (transactions.length === 0) {
    return response.status(422).json({
      success: false,
      error: 'No readable transaction rows were found. Scanned PDFs are not supported yet.',
    });
  }

  try {
    const dedupeKeys = transactions.map((transaction) => getDedupeKey(accountId, transaction));
    const existing = await TransactionModel.find({
      userId: userObjectId,
      accountId,
      dedupeKey: { $in: dedupeKeys },
    }).select('dedupeKey').lean();
    const existingKeys = new Set(existing.flatMap((item) => item.dedupeKey ? [item.dedupeKey] : []));
    const newTransactions = transactions.filter(
      (transaction) => !existingKeys.has(getDedupeKey(accountId, transaction)),
    );

    const writeResult = newTransactions.length > 0
      ? await TransactionModel.bulkWrite(newTransactions.map((transaction) => ({
        updateOne: {
          filter: {
            userId: userObjectId,
            dedupeKey: getDedupeKey(accountId, transaction),
          },
          update: {
            $setOnInsert: {
              userId: userObjectId,
              accountId,
              amount: transaction.amount,
              type: transaction.type,
              category: transaction.category,
              merchant: transaction.merchant,
              date: transaction.date,
              ...(transaction.balanceAfter !== undefined
                ? { balanceAfter: transaction.balanceAfter }
                : {}),
              source: 'statement',
              confidence: 0.65,
              dedupeKey: getDedupeKey(accountId, transaction),
              description: transaction.merchant,
            },
          },
          upsert: true,
        },
      })))
      : null;

    const importedCount = writeResult?.upsertedCount ?? 0;
    return response.status(200).json({
      success: true,
      data: {
        importedCount,
        duplicateCount: transactions.length - importedCount,
        account: account.name,
      },
    });
  } catch (error) {
    logger.error('Parsed PDF transactions could not be saved.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId,
      fileSize: file.size,
    });
    return response.status(500).json({
      success: false,
      error: 'The statement was read, but its transactions could not be saved.',
    });
  }
});
