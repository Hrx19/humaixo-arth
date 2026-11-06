import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { RecurringTransactionModel } from '../../models/RecurringTransaction';
import { logger } from '../config/logger';
import {
  confirmRecurringPattern,
  detectRecurringPatterns,
} from '../services/recurring-transaction-intelligence';

const confirmSchema = z.object({
  patternKey: z.string().regex(/^[a-f\d]{64}$/i),
}).strict();

function getUserId(request: Request): Types.ObjectId | null {
  const userId = request.auth?.userId;
  return userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
}

export async function getDetectedRecurringPatterns(
  request: Request,
  response: Response,
): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  try {
    const data = await detectRecurringPatterns(userId);
    return response.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Recurring transaction detection failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not detect recurring transactions.' });
  }
}

export async function confirmDetectedRecurringPattern(
  request: Request,
  response: Response,
): Promise<Response> {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const parsed = confirmSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'A valid detected pattern key is required.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const existing = await RecurringTransactionModel.findOne({
      userId,
      patternKey: parsed.data.patternKey,
    });
    if (existing) {
      return response.status(200).json({
        success: true,
        data: {
          id: existing._id.toString(),
          patternKey: existing.patternKey,
          amount: existing.amount.toString(),
          interval: existing.interval,
          status: existing.status,
          alreadyConfirmed: true,
        },
      });
    }

    const data = await confirmRecurringPattern(userId, parsed.data.patternKey);
    if (!data) return response.status(404).json({ success: false, error: 'Detected pattern was not found or is no longer valid.' });
    return response.status(201).json({ success: true, data: { ...data, alreadyConfirmed: false } });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      const existing = await RecurringTransactionModel.findOne({
        userId,
        patternKey: parsed.data.patternKey,
      });
      if (existing) {
        return response.status(200).json({
          success: true,
          data: {
            id: existing._id.toString(),
            patternKey: existing.patternKey,
            amount: existing.amount.toString(),
            interval: existing.interval,
            status: existing.status,
            alreadyConfirmed: true,
          },
        });
      }
    }
    logger.error('Recurring transaction confirmation failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not confirm the recurring transaction.' });
  }
}
