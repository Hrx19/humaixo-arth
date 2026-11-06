import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { logger } from '../config/logger';
import {
  confirmInternalTransfer,
  detectInternalTransfers,
  InternalTransferError,
} from '../services/internal-transfer-intelligence';

const suggestSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();

const confirmSchema = z.object({
  debitTransactionId: z.string().regex(/^[a-f\d]{24}$/i),
  creditTransactionId: z.string().regex(/^[a-f\d]{24}$/i),
}).strict().refine(
  (value) => value.debitTransactionId.toLowerCase() !== value.creditTransactionId.toLowerCase(),
  'Select two different transactions.',
);

function getUserId(request: Request): Types.ObjectId | null {
  const userId = request.auth?.userId;
  return userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
}

export async function suggestInternalTransfers(request: Request, response: Response): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const parsed = suggestSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid suggestions request.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  try {
    const data = await detectInternalTransfers(userId, parsed.data);
    return response.status(200).json({ success: true, ...data });
  } catch (error) {
    logger.error('Internal transfer suggestion failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not detect internal transfer suggestions.' });
  }
}

export async function confirmInternalTransferPair(request: Request, response: Response): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const parsed = confirmSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid transfer confirmation.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const data = await confirmInternalTransfer(
      userId,
      new Types.ObjectId(parsed.data.debitTransactionId),
      new Types.ObjectId(parsed.data.creditTransactionId),
    );
    return response.status(data.alreadyConfirmed ? 200 : 201).json({ success: true, data });
  } catch (error) {
    if (error instanceof InternalTransferError) {
      const status = error.code === 'not_found' ? 404 : error.code === 'already_linked' ? 409 : 422;
      return response.status(status).json({ success: false, error: error.message });
    }
    logger.error('Internal transfer confirmation failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not confirm the internal transfer.' });
  }
}
