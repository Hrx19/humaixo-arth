import { Types } from 'mongoose';
import {
  AccountModel,
  type AccountRecord,
  type AccountStatus,
  type AccountType,
} from '../models/Account';

export type CreateAccountInput = {
  name: string;
  institutionName: string;
  type: AccountType;
  currency: string;
  maskedNumber?: string;
  openingBalance: string;
  openingBalanceDate?: Date;
};

export type UpdateAccountInput = Partial<{
  name: string;
  institutionName: string;
  type: AccountType;
  currency: string;
  maskedNumber: string | null;
  status: AccountStatus;
}>;

export type AccountSummary = {
  id: string;
  name: string;
  institutionName: string;
  type: AccountType;
  currency: string;
  maskedNumber: string | null;
  openingBalance: string;
  openingBalanceDate: string;
  currentBalance: string;
  status: AccountStatus;
  source: AccountRecord['source'];
  createdAt: string | null;
  updatedAt: string | null;
};

function serializeAccount(account: AccountRecord & { _id: Types.ObjectId }): AccountSummary {
  return {
    id: account._id.toString(),
    name: account.name,
    institutionName: account.institutionName,
    type: account.type,
    currency: account.currency,
    maskedNumber: account.maskedNumber ?? null,
    openingBalance: account.openingBalance.toString(),
    openingBalanceDate: account.openingBalanceDate.toISOString(),
    currentBalance: account.currentBalance.toString(),
    status: account.status,
    source: account.source,
    createdAt: account.createdAt?.toISOString() ?? null,
    updatedAt: account.updatedAt?.toISOString() ?? null,
  };
}

export async function createAccount(
  userId: Types.ObjectId,
  input: CreateAccountInput,
): Promise<AccountSummary> {
  const openingBalance = Types.Decimal128.fromString(input.openingBalance);
  const account = await AccountModel.create({
    ...input,
    userId,
    openingBalance,
    currentBalance: openingBalance,
    openingBalanceDate: input.openingBalanceDate ?? new Date(),
    source: 'user_entered',
  });

  return serializeAccount(account);
}

export async function listActiveAccounts(userId: Types.ObjectId): Promise<AccountSummary[]> {
  const accounts = await AccountModel.find({ userId, status: 'active' })
    .sort({ createdAt: -1 })
    .exec();
  return accounts.map(serializeAccount);
}

export async function getAccount(
  userId: Types.ObjectId,
  accountId: Types.ObjectId,
): Promise<AccountSummary | null> {
  const account = await AccountModel.findOne({ _id: accountId, userId }).exec();
  return account ? serializeAccount(account) : null;
}

export async function updateAccount(
  userId: Types.ObjectId,
  accountId: Types.ObjectId,
  update: UpdateAccountInput,
): Promise<AccountSummary | null> {
  const account = await AccountModel.findOneAndUpdate(
    { _id: accountId, userId },
    { $set: update },
    { new: true, runValidators: true },
  ).exec();

  return account ? serializeAccount(account) : null;
}

export async function archiveAccount(
  userId: Types.ObjectId,
  accountId: Types.ObjectId,
): Promise<{ id: string; status: AccountStatus } | null> {
  const account = await AccountModel.findOneAndUpdate(
    { _id: accountId, userId, status: 'active' },
    { $set: { status: 'archived' } },
    { new: true, runValidators: true },
  ).exec();

  return account ? { id: account._id.toString(), status: account.status } : null;
}
