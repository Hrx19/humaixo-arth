import type { Request, Response } from 'express';
import Decimal from 'decimal.js';
import { Types } from 'mongoose';
import { z } from 'zod';
import { logger } from '../config/logger';
import {
  createLoan,
  getLoanBalance,
  listLoans,
  LoanLedgerError,
  recordLoanRepayment,
} from '../services/loan-ledger';

const moneySchema = z.string()
  .regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/)
  .refine((value) => {
    try {
      Types.Decimal128.fromString(value);
      return true;
    } catch {
      return false;
    }
  });
const createSchema = z.object({
  personId: z.string().regex(/^[a-f\d]{24}$/i),
  direction: z.enum(['lent', 'borrowed']),
  principal: moneySchema.refine((value) => new Decimal(value).isPositive()),
  interestRate: z.number().finite().min(0).max(100).optional(),
  startDate: z.coerce.date(),
}).strict();
const repaymentSchema = z.object({
  transactionId: z.string().regex(/^[a-f\d]{24}$/i),
  note: z.string().trim().max(500).optional(),
}).strict();

function getUserId(request: Request): Types.ObjectId | null {
  const userId = request.auth?.userId;
  return userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
}

function parseId(value: string | string[] | undefined): Types.ObjectId | null {
  return typeof value === 'string' && Types.ObjectId.isValid(value)
    ? new Types.ObjectId(value)
    : null;
}

export async function createUserLoan(request: Request, response: Response): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid loan.',
      details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  try {
    const data = await createLoan(userId, {
      ...parsed.data,
      personId: new Types.ObjectId(parsed.data.personId),
    });
    if (!data) return response.status(404).json({ success: false, error: 'Person was not found.' });
    return response.status(201).json({ success: true, data });
  } catch (error) {
    logger.error('Loan creation failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not create loan.' });
  }
}

export async function createLoanRepayment(request: Request, response: Response): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const loanId = parseId(request.params.id);
  if (!loanId) return response.status(400).json({ success: false, error: 'Loan ID is invalid.' });
  const parsed = repaymentSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'A valid transaction ID is required for repayment.',
      details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  try {
    const data = await recordLoanRepayment(
      userId,
      loanId,
      new Types.ObjectId(parsed.data.transactionId),
      parsed.data.note,
    );
    return response.status(201).json({ success: true, data });
  } catch (error) {
    if (error instanceof LoanLedgerError) {
      const status = error.code === 'not_found' ? 404 : error.code === 'overpayment' ? 422 : 409;
      return response.status(status).json({ success: false, error: error.message });
    }
    logger.error('Loan repayment recording failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not record loan repayment.' });
  }
}

export async function getUserLoanBalance(request: Request, response: Response): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const loanId = parseId(request.params.id);
  if (!loanId) return response.status(400).json({ success: false, error: 'Loan ID is invalid.' });
  try {
    const data = await getLoanBalance(userId, loanId);
    if (!data) return response.status(404).json({ success: false, error: 'Loan was not found.' });
    return response.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Loan balance request failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not calculate loan balance.' });
  }
}

export async function listUserLoans(request: Request, response: Response): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  try {
    return response.status(200).json({ success: true, data: await listLoans(userId) });
  } catch (error) {
    logger.error('Loan list request failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load loans.' });
  }
}
