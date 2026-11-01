import { Types } from 'mongoose';
import { AccountModel, type AccountDocument, type AccountRecord } from '../../models/Account';
import { TransactionModel, type TransactionType } from '../../models/Transaction';

type AccountBalanceSource = Pick<AccountRecord, 'openingBalance' | 'openingBalanceDate'> & {
  _id: Types.ObjectId;
};

type BalanceSnapshot = {
  _id: Types.ObjectId;
  date: Date;
  balanceAfter: number;
};

type SignedAmountAggregate = {
  _id: null;
  total: number;
};

type BalanceEvent = {
  accountId: string;
  date: Date;
  order: number;
  type: TransactionType | 'opening';
  amount: number;
  balanceAfter?: number;
  id?: string;
};

function signedAmountExpression(): Record<string, unknown> {
  return {
    $cond: [
      { $eq: ['$type', 'credit'] },
      '$amount',
      { $multiply: ['$amount', -1] },
    ],
  };
}

async function sumTransactionChanges(
  userId: Types.ObjectId,
  accountId: Types.ObjectId,
  dateFilter: Record<string, unknown>,
): Promise<number> {
  const [result] = await TransactionModel.aggregate<SignedAmountAggregate>([
    {
      $match: {
        userId,
        accountId,
        ...dateFilter,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: signedAmountExpression() },
      },
    },
  ]);

  return result?.total ?? 0;
}

export async function getAccountBalanceAt(
  userId: Types.ObjectId,
  account: AccountBalanceSource | AccountDocument,
  at: Date,
): Promise<number> {
  const snapshot = await TransactionModel.findOne({
    userId,
    accountId: account._id,
    date: { $lte: at },
    balanceAfter: { $exists: true, $ne: null },
  })
    .select('_id date balanceAfter')
    .sort({ date: -1, _id: -1 })
    .lean<BalanceSnapshot>();

  if (snapshot) {
    const laterTransactions = await sumTransactionChanges(userId, account._id, {
      date: { $lte: at },
      $or: [
        { date: { $gt: snapshot.date } },
        { date: snapshot.date, _id: { $gt: snapshot._id } },
      ],
    });
    return snapshot.balanceAfter + laterTransactions;
  }

  // A statement can provide an authoritative balance before the opening
  // baseline entered in the UI, so only fall back to zero after checking it.
  if (account.openingBalanceDate > at) return 0;

  const changesSinceOpening = await sumTransactionChanges(userId, account._id, {
    date: { $gte: account.openingBalanceDate, $lte: at },
  });
  return account.openingBalance + changesSinceOpening;
}

export async function getUserAccountBalances(
  userId: Types.ObjectId,
  at = new Date(),
  requestedAccountId?: Types.ObjectId,
): Promise<Array<{ account: AccountDocument; balance: number }>> {
  const accounts = await AccountModel.find({
    userId,
    isArchived: false,
    ...(requestedAccountId ? { _id: requestedAccountId } : {}),
  }).sort({ createdAt: 1 });

  return Promise.all(
    accounts.map(async (account) => ({
      account,
      balance: await getAccountBalanceAt(userId, account, at),
    })),
  );
}

export async function getMonthlyBalanceHistory(
  userId: Types.ObjectId,
  months: number,
  requestedAccountId?: Types.ObjectId,
): Promise<Array<{ date: string; balance: number }>> {
  const now = new Date();
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const accounts = await AccountModel.find({
    userId,
    isArchived: false,
    ...(requestedAccountId ? { _id: requestedAccountId } : {}),
  }).sort({ createdAt: 1 });

  if (accounts.length === 0) {
    return Array.from({ length: months }, (_, index) => {
      const date = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
      return { date: date.toISOString(), balance: 0 };
    });
  }

  const baselineBalances = new Map<string, number>();
  const events: BalanceEvent[] = [];
  const baselineDate = new Date(firstMonth.getTime() - 1);
  const accountBaselines = await Promise.all(
    accounts.map(async (account) => ({
      account,
      balance: await getAccountBalanceAt(userId, account, baselineDate),
    })),
  );

  for (const { account, balance } of accountBaselines) {
    const key = account._id.toString();
    baselineBalances.set(key, balance);
    if (account.openingBalanceDate >= firstMonth && account.openingBalanceDate <= now) {
      events.push({
        accountId: key,
        date: account.openingBalanceDate,
        order: 0,
        type: 'opening',
        amount: account.openingBalance,
      });
    }
  }

  const transactions = await TransactionModel.find({
    userId,
    accountId: { $in: accounts.map((account) => account._id) },
    date: { $gte: firstMonth, $lte: now },
  })
    .select('_id accountId amount type date balanceAfter')
    .sort({ date: 1, _id: 1 })
    .lean();

  for (const transaction of transactions) {
    if (!transaction.accountId || !transaction.date) continue;
    events.push({
      accountId: transaction.accountId.toString(),
      date: transaction.date,
      order: 1,
      type: transaction.type,
      amount: transaction.amount,
      balanceAfter: transaction.balanceAfter,
      id: transaction._id.toString(),
    });
  }

  events.sort((left, right) => {
    const dateDifference = left.date.getTime() - right.date.getTime();
    if (dateDifference !== 0) return dateDifference;
    if (left.order !== right.order) return left.order - right.order;
    return (left.id ?? '').localeCompare(right.id ?? '');
  });

  let eventIndex = 0;
  const results: Array<{ date: string; balance: number }> = [];

  for (let offset = 0; offset < months; offset += 1) {
    const monthDate = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + offset, 1);
    const monthEnd = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const boundary = monthEnd > now ? now : monthEnd;

    while (eventIndex < events.length && events[eventIndex].date <= boundary) {
      const event = events[eventIndex];
      const previousBalance = baselineBalances.get(event.accountId) ?? 0;
      if (event.type === 'opening') {
        baselineBalances.set(event.accountId, event.amount);
      } else if (event.balanceAfter !== undefined) {
        baselineBalances.set(event.accountId, event.balanceAfter);
      } else {
        const delta = event.type === 'credit' ? event.amount : -event.amount;
        baselineBalances.set(event.accountId, previousBalance + delta);
      }
      eventIndex += 1;
    }

    const balance = Array.from(baselineBalances.values()).reduce(
      (total, accountBalance) => total + accountBalance,
      0,
    );
    results.push({ date: boundary.toISOString(), balance });
  }

  return results;
}
