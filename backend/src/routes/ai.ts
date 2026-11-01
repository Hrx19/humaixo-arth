import axios from 'axios';
import { createHash } from 'node:crypto';
import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel } from '../../models/Account';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';
import { TransactionModel } from '../../models/Transaction';
import { getAccountBalanceAt } from '../services/account-balances';

const parseRequestSchema = z.object({
  sms: z.string().trim().min(10).max(1_000),
  accountId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
}).strict();

const parsedTransactionSchema = z.object({
  success: z.boolean().optional(),
  amount: z.number().finite().positive(),
  currency: z.string().trim().min(1).optional(),
  type: z.enum(['credit', 'debit']),
  category: z.string().trim().min(1).max(60),
  merchant: z.string().trim().min(1).max(120),
  confidence: z.number().min(0).max(1),
  balanceAfter: z.number().finite().optional(),
}).strict();

export const aiRouter = Router();
aiRouter.use(verifyToken);

aiRouter.post('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsedRequest = parseRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    return response.status(400).json({
      success: false,
      error: 'SMS text must be between 10 and 1000 characters.',
      details: parsedRequest.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const userObjectId = new Types.ObjectId(userId);
    const account = parsedRequest.data.accountId
      ? await AccountModel.findOne({
          _id: parsedRequest.data.accountId,
          userId: userObjectId,
          isArchived: false,
        })
      : null;
    if (parsedRequest.data.accountId && !account) {
      return response.status(404).json({ success: false, error: 'Selected account was not found.' });
    }

    const aiResponse = await axios.post(
      env.AI_SERVICE_URL,
      { sms: parsedRequest.data.sms },
      {
        timeout: 15_000,
        ...(env.AI_SERVICE_API_KEY
          ? { headers: { 'X-Service-Key': env.AI_SERVICE_API_KEY } }
          : {}),
      },
    );
    const parsedResult = parsedTransactionSchema.safeParse(aiResponse.data);

    if (!parsedResult.success || parsedResult.data.success === false) {
      logger.warn('AI service returned an invalid parse result.', {
        issues: parsedResult.success
          ? undefined
          : parsedResult.error.issues.map((issue) => issue.message),
      });
      return response.status(422).json({
        success: false,
        error: 'The SMS could not be parsed as a transaction.',
      });
    }

    const transactionDate = new Date();
    const delta = parsedResult.data.type === 'credit'
      ? parsedResult.data.amount
      : -parsedResult.data.amount;
    const accountBalanceBefore = account
      ? await getAccountBalanceAt(
          userObjectId,
          account,
          new Date(transactionDate.getTime() - 1),
        )
      : undefined;
    const balanceBefore = parsedResult.data.balanceAfter !== undefined
      ? parsedResult.data.balanceAfter - delta
      : accountBalanceBefore;
    const balanceAfter = parsedResult.data.balanceAfter ??
      (accountBalanceBefore === undefined ? undefined : accountBalanceBefore + delta);
    const isPersonTransfer =
      parsedResult.data.category.toLowerCase() === 'transfer' &&
      parsedResult.data.merchant.toLowerCase() !== 'unknown';
    const counterparty = isPersonTransfer ? parsedResult.data.merchant : undefined;

    const transaction = await TransactionModel.create({
      userId: userObjectId,
      accountId: account?._id,
      amount: parsedResult.data.amount,
      type: parsedResult.data.type,
      category: parsedResult.data.category,
      merchant: parsedResult.data.merchant,
      counterparty,
      counterpartyKey: counterparty
        ?.normalize('NFKC')
        .toLocaleLowerCase('en-IN')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' '),
      counterpartyType: counterparty ? 'person' : undefined,
      paymentMethod: /\bUPI\b/i.test(parsedRequest.data.sms) ? 'UPI' : undefined,
      balanceBefore,
      balanceAfter,
      description: parsedResult.data.merchant,
      source: 'sms',
      confidence: parsedResult.data.confidence,
      rawSMS: parsedRequest.data.sms,
      dedupeKey: createHash('sha256')
        .update(`${account?._id.toString() ?? 'unassigned'}|${parsedRequest.data.sms.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()}`)
        .digest('hex'),
      date: transactionDate,
    });

    return response.status(201).json({
      success: true,
      data: {
        id: transaction._id.toString(),
        merchant: transaction.merchant,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        date: (transaction.date ?? new Date()).toISOString(),
        confidence: transaction.confidence,
        accountId: transaction.accountId?.toString() ?? null,
        counterparty: transaction.counterparty ?? null,
        counterpartyKey: transaction.counterpartyKey ?? null,
        counterpartyType: transaction.counterpartyType ?? null,
        paymentMethod: transaction.paymentMethod ?? null,
        balanceBefore: transaction.balanceBefore ?? null,
        balanceAfter: transaction.balanceAfter ?? null,
        referenceNumber: transaction.referenceNumber ?? null,
        source: transaction.source ?? 'sms',
      },
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      return response.status(409).json({
        success: false,
        error: 'This SMS has already been added to your ledger.',
      });
    }

    if (axios.isAxiosError(error) && error.response?.status === 422) {
      return response.status(422).json({
        success: false,
        error: 'No transaction amount could be found in this SMS.',
      });
    }

    const isAiConnectionFailure =
      axios.isAxiosError(error) &&
      (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT');

    logger.error('SMS parsing request failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      aiConnectionFailure: isAiConnectionFailure,
    });

    return response.status(isAiConnectionFailure ? 503 : 502).json({
      success: false,
      error: isAiConnectionFailure
        ? 'AI service is unavailable. Start the Python service and try again.'
        : 'Could not parse SMS with the AI service.',
    });
  }
});
