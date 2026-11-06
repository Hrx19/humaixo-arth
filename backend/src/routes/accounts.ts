import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel, type AccountType } from '../../models/Account';
import { logger } from '../config/logger';
import { getAccountBalanceAt } from '../services/account-balances';
import { decimal128 } from '../services/money';
import { verifyToken } from '../middleware/verifyToken';
import {
  archiveAccount,
  createAccount,
  getAccount,
  listActiveAccounts,
  updateAccount,
} from '../controllers/accountsController';

const accountTypeSchema = z.enum([
  'bank',
  'savings',
  'current',
  'credit_card',
  'wallet',
  'cash',
  'investment',
]);

const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  institution: z.string().trim().min(1).max(100),
  type: accountTypeSchema,
  accountSuffix: z.string().regex(/^\d{0,4}$/).optional(),
  currency: z.string().trim().length(3).default('INR'),
  openingBalance: z.string().regex(/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/),
  openingBalanceDate: z.coerce.date(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#7c5cff'),
}).strict();

export const accountRouter = Router();
accountRouter.use(verifyToken);

function getUserId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

accountRouter.get('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  try {
    const accountId = request.query.accountId;
    if (accountId !== undefined && (typeof accountId !== 'string' || !Types.ObjectId.isValid(accountId))) {
      return response.status(400).json({ success: false, error: 'Account ID is invalid.' });
    }

    const accounts = await AccountModel.find({
      userId: getUserId(userId),
      isArchived: false,
      ...(typeof accountId === 'string' ? { _id: accountId } : {}),
    }).sort({ createdAt: 1 });

    const serialized = await Promise.all(
      accounts.map(async (account) => ({
        id: account._id.toString(),
        name: account.name,
        institution: account.institution,
        type: account.type as AccountType,
        accountSuffix: account.accountSuffix ?? '',
        currency: account.currency,
        openingBalance: account.openingBalance.toString(),
        openingBalanceDate: account.openingBalanceDate.toISOString(),
        balance: await getAccountBalanceAt(getUserId(userId), account, new Date()),
        color: account.color,
        source: account.source,
        createdAt: account.createdAt?.toISOString() ?? new Date().toISOString(),
      })),
    );

    return response.status(200).json(serialized);
  } catch (error) {
    logger.error('Account list request failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Failed to fetch accounts.' });
  }
});

accountRouter.post('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsed = createAccountSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid account details.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const account = await AccountModel.create({
      ...parsed.data,
      openingBalance: decimal128(parsed.data.openingBalance),
      userId: getUserId(userId),
    });
    const balance = await getAccountBalanceAt(getUserId(userId), account, new Date());
    return response.status(201).json({
      success: true,
      data: {
        id: account._id.toString(),
        name: account.name,
        institution: account.institution,
        type: account.type,
        accountSuffix: account.accountSuffix ?? '',
        currency: account.currency,
        openingBalance: account.openingBalance.toString(),
        openingBalanceDate: account.openingBalanceDate.toISOString(),
        balance,
        color: account.color,
        source: account.source,
        createdAt: account.createdAt?.toISOString() ?? new Date().toISOString(),
      },
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return response.status(409).json({
        success: false,
        error: 'An account with this name already exists.',
      });
    }

    logger.error('Account creation request failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Failed to create account.' });
  }
});

accountRouter.patch('/:accountId/archive', async (request, response) => {
  const userId = request.auth?.userId;
  const { accountId } = request.params;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }
  if (!Types.ObjectId.isValid(accountId)) {
    return response.status(400).json({ success: false, error: 'Account ID is invalid.' });
  }

  try {
    const account = await AccountModel.findOneAndUpdate(
      { _id: accountId, userId: getUserId(userId), isArchived: false },
      { $set: { isArchived: true } },
      { new: true },
    );

    if (!account) {
      return response.status(404).json({ success: false, error: 'Account was not found.' });
    }

    return response.status(200).json({ success: true, message: 'Account archived.' });
  } catch (error) {
    logger.error('Account archive request failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Failed to archive account.' });
  }
});

const financialAccountTypes = ['savings', 'current', 'cash', 'wallet', 'credit_card'] as const;
const financialAccountStatuses = ['active', 'archived'] as const;
const financialAccountIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const decimalValueSchema = z.string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,18})?$/, 'Enter a valid decimal amount.')
  .refine(
    (value) => value.replace(/[-.]/g, '').replace(/^0+/, '').length <= 34,
    'Amount exceeds Decimal128 precision.',
  );

const createFinancialAccountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  institutionName: z.string().trim().min(1).max(120),
  type: z.enum(financialAccountTypes),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).default('INR'),
  maskedNumber: z.string().regex(/^\d{4}$/, 'Enter only the last four digits.').optional(),
  openingBalance: decimalValueSchema,
  openingBalanceDate: z.coerce.date().optional(),
}).strict();

const updateFinancialAccountSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  institutionName: z.string().trim().min(1).max(120).optional(),
  type: z.enum(financialAccountTypes).optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).optional(),
  maskedNumber: z.string().regex(/^\d{4}$/).nullable().optional(),
  status: z.enum(financialAccountStatuses).optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one account field to update.',
);

export const financialAccountRouter = Router();
financialAccountRouter.use(verifyToken);

function logFinancialAccountError(message: string, error: unknown): void {
  logger.error(message, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

financialAccountRouter.post('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsed = createFinancialAccountSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid account details.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    return response.status(201).json({
      success: true,
      data: await createAccount(getUserId(userId), parsed.data),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return response.status(409).json({
        success: false,
        error: 'An account with this name already exists.',
      });
    }

    logFinancialAccountError('Account creation request failed.', error);
    return response.status(500).json({ success: false, error: 'Failed to create account.' });
  }
});

financialAccountRouter.get('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  try {
    const data = await listActiveAccounts(getUserId(userId));
    return response.status(200).json({ success: true, data });
  } catch (error) {
    logFinancialAccountError('Account list request failed.', error);
    return response.status(500).json({ success: false, error: 'Failed to fetch accounts.' });
  }
});

financialAccountRouter.get('/:id', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsedId = financialAccountIdSchema.safeParse(request.params.id);
  if (!parsedId.success) {
    return response.status(400).json({ success: false, error: 'Account ID is invalid.' });
  }

  try {
    const account = await getAccount(getUserId(userId), new Types.ObjectId(parsedId.data));
    if (!account) {
      return response.status(404).json({ success: false, error: 'Account was not found.' });
    }

    return response.status(200).json({ success: true, data: account });
  } catch (error) {
    logFinancialAccountError('Account detail request failed.', error);
    return response.status(500).json({ success: false, error: 'Failed to fetch account.' });
  }
});

financialAccountRouter.patch('/:id', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsedId = financialAccountIdSchema.safeParse(request.params.id);
  if (!parsedId.success) {
    return response.status(400).json({ success: false, error: 'Account ID is invalid.' });
  }

  const parsedUpdate = updateFinancialAccountSchema.safeParse(request.body);
  if (!parsedUpdate.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid account update.',
      details: parsedUpdate.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const account = await updateAccount(
      getUserId(userId),
      new Types.ObjectId(parsedId.data),
      parsedUpdate.data,
    );
    if (!account) {
      return response.status(404).json({ success: false, error: 'Account was not found.' });
    }

    return response.status(200).json({ success: true, data: account });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return response.status(409).json({
        success: false,
        error: 'An account with this name already exists.',
      });
    }

    logFinancialAccountError('Account update request failed.', error);
    return response.status(500).json({ success: false, error: 'Failed to update account.' });
  }
});

financialAccountRouter.delete('/:id', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }

  const parsedId = financialAccountIdSchema.safeParse(request.params.id);
  if (!parsedId.success) {
    return response.status(400).json({ success: false, error: 'Account ID is invalid.' });
  }

  try {
    const account = await archiveAccount(
      getUserId(userId),
      new Types.ObjectId(parsedId.data),
    );
    if (!account) {
      return response.status(404).json({ success: false, error: 'Account was not found.' });
    }

    return response.status(200).json({
      success: true,
      data: account,
    });
  } catch (error) {
    logFinancialAccountError('Account archive request failed.', error);
    return response.status(500).json({ success: false, error: 'Failed to archive account.' });
  }
});
