import Decimal from 'decimal.js';
import { Types, type ClientSession } from 'mongoose';
import { AccountModel, type AccountDocument, type AccountRecord } from '../../models/Account';
import { TransactionModel, type TransactionType } from '../../models/Transaction';

type AccountBalanceSource = Pick<AccountRecord, 'openingBalance' | 'openingBalanceDate'> & {
  _id: Types.ObjectId;
};

type BalanceSnapshot = {
  _id: Types.ObjectId;
  date: Date;
  balanceAfter: Types.Decimal128;
};

type SignedAmountAggregate = { _id: null; total: Types.Decimal128 };
type BalanceEvent = {
  accountId: string;
  date: Date;
  order: number;
  type: TransactionType | 'opening';
  amount: string;
  balanceAfter?: string;
  id?: string;
};

const ZERO = '0';

async function sumTransactionChanges(
  userId: Types.ObjectId,
  accountId: Types.ObjectId,
  dateFilter: Record<string, unknown>,
  session?: ClientSession,
): Promise<string> {
  const amount = { $convert: { input: '$amount', to: 'decimal' } };
  const aggregate = TransactionModel.aggregate<SignedAmountAggregate>([
    { $match: { userId, accountId, ...dateFilter } },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'credit'] },
              amount,
              { $multiply: [amount, Types.Decimal128.fromString('-1')] },
            ],
          },
        },
      },
    },
  ]);
  if (session) aggregate.session(session);
  const [result] = await aggregate;
  return result?.total.toString() ?? ZERO;
}

export async function getAccountBalanceAt(
  userId: Types.ObjectId,
  account: AccountBalanceSource | AccountDocument,
  at: Date,
  session?: ClientSession,
): Promise<string> {
  const snapshotQuery = TransactionModel.findOne({
    userId,
    accountId: account._id,
    date: { $lte: at },
    balanceAfter: { $exists: true, $ne: null },
    source: 'statement',
  })
    .select('_id date balanceAfter')
    .sort({ date: -1, _id: -1 });
  if (session) snapshotQuery.session(session);
  const snapshot = await snapshotQuery.lean<BalanceSnapshot>();

  if (snapshot) {
    const laterTransactions = await sumTransactionChanges(userId, account._id, {
      $or: [
        { date: { $gt: snapshot.date, $lte: at } },
        { date: snapshot.date, _id: { $gt: snapshot._id } },
      ],
    }, session);
    return new Decimal(snapshot.balanceAfter.toString()).plus(laterTransactions).toString();
  }

  if (account.openingBalanceDate > at) return ZERO;
  const changes = await sumTransactionChanges(userId, account._id, {
    date: { $gte: account.openingBalanceDate, $lte: at },
  }, session);
  return new Decimal(account.openingBalance.toString()).plus(changes).toString();
}

export async function getUserAccountBalances(
  userId: Types.ObjectId,
  at = new Date(),
  requestedAccountId?: Types.ObjectId,
): Promise<Array<{ account: AccountDocument; balance: string }>> {
  const accounts = await AccountModel.find({
    userId,
    isArchived: false,
    ...(requestedAccountId ? { _id: requestedAccountId } : {}),
  }).sort({ createdAt: 1 });
  return Promise.all(accounts.map(async (account) => ({
    account,
    balance: await getAccountBalanceAt(userId, account, at),
  })));
}

export async function getMonthlyBalanceHistory(
  userId: Types.ObjectId,
  months: number,
  requestedAccountId?: Types.ObjectId,
): Promise<Array<{ date: string; balance: string }>> {
  const now = new Date();
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const accounts = await AccountModel.find({
    userId,
    isArchived: false,
    ...(requestedAccountId ? { _id: requestedAccountId } : {}),
  }).sort({ createdAt: 1 });

  const baselineDate = new Date(firstMonth.getTime() - 1);
  const baselines = await Promise.all(accounts.map(async (account) => ({
    account,
    balance: await getAccountBalanceAt(userId, account, baselineDate),
  })));
  const balances = new Map(baselines.map(({ account, balance }) => [account._id.toString(), balance]));
  const accountIds = accounts.map((account) => account._id);
  const transactions = accountIds.length
    ? await TransactionModel.find({
      userId,
      accountId: { $in: accountIds },
      date: { $gte: firstMonth, $lte: now },
      status: { $ne: 'failed' },
    })
      .select('_id accountId amount type date balanceAfter')
      .sort({ date: 1, _id: 1 })
      .lean()
    : [];
  const events: BalanceEvent[] = [];

  for (const { account } of baselines) {
    if (account.openingBalanceDate >= firstMonth && account.openingBalanceDate <= now) {
      events.push({
        accountId: account._id.toString(),
        date: account.openingBalanceDate,
        order: 0,
        type: 'opening',
        amount: account.openingBalance.toString(),
      });
    }
  }
  for (const transaction of transactions) {
    if (!transaction.accountId || !transaction.date) continue;
    events.push({
      accountId: transaction.accountId.toString(),
      date: transaction.date,
      order: 1,
      type: transaction.type,
      amount: transaction.amount.toString(),
      balanceAfter: transaction.balanceAfter?.toString(),
      id: transaction._id.toString(),
    });
  }
  events.sort((left, right) =>
    left.date.getTime() - right.date.getTime() ||
    left.order - right.order ||
    (left.id ?? '').localeCompare(right.id ?? ''),
  );

  let eventIndex = 0;
  const results: Array<{ date: string; balance: string }> = [];
  for (let offset = 0; offset < months; offset += 1) {
    const monthDate = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + offset, 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
    const boundary = monthEnd > now ? now : monthEnd;
    while (eventIndex < events.length && events[eventIndex].date <= boundary) {
      const event = events[eventIndex];
      const previous = balances.get(event.accountId) ?? ZERO;
      if (event.type === 'opening') balances.set(event.accountId, event.amount);
      else if (event.balanceAfter !== undefined) balances.set(event.accountId, event.balanceAfter);
      else {
        const signed = event.type === 'credit' ? event.amount : new Decimal(event.amount).negated().toString();
        balances.set(event.accountId, new Decimal(previous).plus(signed).toString());
      }
      eventIndex += 1;
    }
    const total = [...balances.values()].reduce(
      (sum, accountBalance) => sum.plus(accountBalance),
      new Decimal(ZERO),
    );
    results.push({ date: boundary.toISOString(), balance: total.toString() });
  }
  return results;
}
