import Decimal from 'decimal.js';
import { Types } from 'mongoose';
import { AccountModel } from '../../models/Account';
import { TransactionModel } from '../../models/Transaction';
import { recordNotification } from './notifications';

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_ANALYSIS_TRANSACTIONS = 10_000;
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });

type TransactionForAnalysis = {
  _id: Types.ObjectId;
  accountId?: Types.ObjectId;
  amount: Types.Decimal128;
  type: 'credit' | 'debit';
  category: string;
  merchant: string;
  counterparty?: string;
  counterpartyKey?: string;
  currency: string;
  currencyKey: string;
  date: Date;
  isInternalTransfer?: boolean;
  isLoanRepayment?: boolean;
};

type RawMonthTotal = {
  _id: { month: string; accountId: Types.ObjectId | null };
  total: Types.Decimal128;
};

export type DetectedAnomaly = {
  id: string;
  type: 'large_transaction' | 'spending_spike' | 'possible_duplicate';
  message: string;
  transaction_ids: string[];
  amount: string | null;
  detected_at: string;
  reviewed: boolean;
};

function normalizedCounterparty(transaction: TransactionForAnalysis): string {
  return (transaction.counterpartyKey ?? transaction.counterparty ?? transaction.merchant)
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-IN')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function counterpartyLabel(transaction: TransactionForAnalysis): string {
  return transaction.counterparty?.trim() || transaction.merchant.trim() || 'the same counterparty';
}

function monthStartUTC(date: Date, monthOffset = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1));
}

async function getAccountCurrencies(
  userId: Types.ObjectId,
  accountIds: Types.ObjectId[],
): Promise<Map<string, string>> {
  if (!accountIds.length) return new Map();
  const uniqueAccountIds = [...new Map(accountIds.map((id) => [id.toString(), id])).values()];
  const accounts = await AccountModel.find({ userId, _id: { $in: uniqueAccountIds } })
    .select('_id currency')
    .lean();
  return new Map(accounts.map((account) => [account._id.toString(), account.currency]));
}

function subtractUtcMonths(date: Date, monthCount: number): Date {
  const targetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - monthCount, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth(),
    Math.min(date.getUTCDate(), lastDay),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
}

function toAnomaly(
  id: string,
  type: DetectedAnomaly['type'],
  message: string,
  transactionIds: string[],
  amount: string | null,
  detectedAt: Date,
): Omit<DetectedAnomaly, 'reviewed'> {
  return {
    id,
    type,
    message,
    transaction_ids: transactionIds,
    amount,
    detected_at: detectedAt.toISOString(),
  };
}

async function detectLargeTransactions(
  userId: Types.ObjectId,
  transactions: TransactionForAnalysis[],
  since: Date,
): Promise<DetectedAnomaly[]> {
  const expenses = transactions.filter((transaction) =>
    transaction.type === 'debit' &&
    transaction.isInternalTransfer !== true &&
    transaction.isLoanRepayment !== true,
  );
  const anomalies: DetectedAnomaly[] = [];

  for (const transaction of expenses) {
    if (transaction.date < since) continue;
    const historicalFrom = subtractUtcMonths(transaction.date, 6);
    const history = expenses.filter((candidate) =>
      candidate.category.trim().toLocaleLowerCase('en-IN') ===
        transaction.category.trim().toLocaleLowerCase('en-IN') &&
      candidate.currencyKey === transaction.currencyKey &&
      candidate.date >= historicalFrom &&
      candidate.date < transaction.date,
    );
    if (!history.length) continue;

    const historicalTotal = history.reduce(
      (total, candidate) => total.plus(candidate.amount.toString()),
      new Decimal(0),
    );
    const average = historicalTotal.div(history.length);
    const amount = new Decimal(transaction.amount.toString());
    if (!average.isPositive() || !amount.gt(average.mul(3))) continue;

    const ratio = amount.div(average).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString();
    const id = `large:${transaction._id.toString()}`;
    const message =
      `${transaction.category} transaction of ${amount.toString()} ${transaction.currency} is ${ratio}x its ` +
      `six-month category average of ${average.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString()} ${transaction.currency}.`;
    const notification = await recordNotification({
      userId,
      type: 'anomaly',
      message,
      relatedEntityId: transaction._id,
      dedupeKey: `anomaly:${id}`,
    });
    anomalies.push({
      ...toAnomaly(
        id,
        'large_transaction',
        message,
        [transaction._id.toString()],
        amount.toString(),
        transaction.date,
      ),
      reviewed: notification.is_read,
    });
  }

  return anomalies;
}

async function detectDuplicateTransactions(
  userId: Types.ObjectId,
  transactions: TransactionForAnalysis[],
  since: Date,
): Promise<DetectedAnomaly[]> {
  const candidates = transactions
    .filter((transaction) => transaction.date >= since)
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const lastByKey = new Map<string, TransactionForAnalysis>();
  const anomalies: DetectedAnomaly[] = [];

  for (const transaction of candidates) {
    const counterparty = normalizedCounterparty(transaction);
    if (!counterparty) continue;
    const normalizedAmount = new Decimal(transaction.amount.toString()).toString();
    const key = `${normalizedAmount}|${transaction.currencyKey}|${counterparty}`;
    const previous = lastByKey.get(key);
    lastByKey.set(key, transaction);
    if (!previous || transaction.date.getTime() - previous.date.getTime() > DAY_MS) continue;

    const previousId = previous._id.toString();
    const transactionId = transaction._id.toString();
    const id = `duplicate:${previousId}:${transactionId}`;
    const amount = transaction.amount.toString();
    const message =
      `Possible duplicate: ${amount} ${transaction.currency} to ${counterpartyLabel(transaction)} appears within 24 hours ` +
      `of transaction ${previous.date.toISOString()}.`;
    const notification = await recordNotification({
      userId,
      type: 'anomaly',
      message,
      relatedEntityId: transaction._id,
      dedupeKey: `anomaly:${id}`,
    });
    anomalies.push({
      ...toAnomaly(
        id,
        'possible_duplicate',
        message,
        [previousId, transactionId],
        amount,
        transaction.date,
      ),
      reviewed: notification.is_read,
    });
  }

  return anomalies;
}

async function detectMonthlySpendingSpikes(
  userId: Types.ObjectId,
  transactions: TransactionForAnalysis[],
  now: Date,
): Promise<DetectedAnomaly[]> {
  const latestCompleteMonth = monthStartUTC(now, -1);
  const previousMonth = monthStartUTC(now, -2);
  const rows = await TransactionModel.aggregate<RawMonthTotal>([
    {
      $match: {
        userId,
        type: 'debit',
        date: { $gte: previousMonth, $lt: monthStartUTC(now) },
        isInternalTransfer: { $ne: true },
        isLoanRepayment: { $ne: true },
      },
    },
    {
      $group: {
        _id: {
          month: { $dateToString: { format: '%Y-%m', date: '$date', timezone: 'UTC' } },
          accountId: '$accountId',
        },
        total: { $sum: { $convert: { input: '$amount', to: 'decimal' } } },
      },
    },
  ]);
  const latestKey = latestCompleteMonth.toISOString().slice(0, 7);
  const previousKey = previousMonth.toISOString().slice(0, 7);
  const latestLabel = latestCompleteMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const previousLabel = previousMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const currencyByAccount = await getAccountCurrencies(
    userId,
    transactions.flatMap((transaction) => transaction.accountId ? [transaction.accountId] : []),
  );
  const analysisFrom = previousMonth;
  const analysisTo = monthStartUTC(now);
  if (transactions.some((transaction) =>
    transaction.date >= analysisFrom &&
    transaction.date < analysisTo &&
    (!transaction.accountId || !currencyByAccount.has(transaction.accountId.toString())),
  )) {
    return [];
  }
  const totalsByMonthAndCurrency = new Map<string, Decimal>();
  const currencyLabels = new Map<string, string>();
  for (const row of rows) {
    if (!row._id.accountId) continue;
    const accountId = row._id.accountId.toString();
    const currency = currencyByAccount.get(accountId);
    const currencyKey = currency ? `currency:${currency}` : `account:${accountId}`;
    currencyLabels.set(currencyKey, currency ?? 'currency unavailable');
    const key = `${row._id.month}|${currencyKey}`;
    totalsByMonthAndCurrency.set(
      key,
      (totalsByMonthAndCurrency.get(key) ?? new Decimal(0)).plus(row.total.toString()),
    );
  }

  const currencies = new Set(
    [...totalsByMonthAndCurrency.keys()].map((key) => key.slice(key.indexOf('|') + 1)),
  );
  const anomalies = await Promise.all([...currencies].map(async (currencyKey) => {
    const currency = currencyLabels.get(currencyKey) ?? 'currency unavailable';
    const latestTotal = totalsByMonthAndCurrency.get(`${latestKey}|${currencyKey}`) ?? new Decimal(0);
    const previousTotal = totalsByMonthAndCurrency.get(`${previousKey}|${currencyKey}`) ?? new Decimal(0);
    if (!previousTotal.isPositive() || !latestTotal.gt(previousTotal.mul(1.5))) return null;

    const increase = latestTotal.minus(previousTotal)
      .div(previousTotal)
      .mul(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toString();
    const message =
      `Expenses in ${latestLabel} were ${latestTotal.toString()} ${currency}, ` +
      `${increase}% higher than ${previousLabel} (${previousTotal.toString()} ${currency}); ` +
      'the alert threshold is 50%.';
    const id = `monthly-spike:${latestKey}:${currencyKey}`;
    const notification = await recordNotification({
      userId,
      type: 'anomaly',
      message,
      dedupeKey: `anomaly:${id}`,
    });

    return {
      ...toAnomaly(id, 'spending_spike', message, [], latestTotal.toString(), latestCompleteMonth),
      reviewed: notification.is_read,
    } satisfies DetectedAnomaly;
  }));
  return anomalies.filter((anomaly): anomaly is DetectedAnomaly => anomaly !== null);
}

export async function detectUserAnomalies(
  userId: Types.ObjectId,
  now = new Date(),
): Promise<DetectedAnomaly[]> {
  const queryFrom = monthStartUTC(now, -9);
  const duplicateSince = new Date(now.getTime() - 30 * DAY_MS);
  const largeTransactionSince = new Date(now.getTime() - 30 * DAY_MS);
  const transactions = await TransactionModel.find({
    userId,
    type: { $in: ['debit', 'credit'] },
    date: { $gte: queryFrom, $lte: now },
  })
    .select('_id accountId amount type category merchant counterparty counterpartyKey date isInternalTransfer isLoanRepayment')
    .sort({ date: 1, _id: 1 })
    .limit(MAX_ANALYSIS_TRANSACTIONS + 1)
    .lean<TransactionForAnalysis[]>();

  if (transactions.length > MAX_ANALYSIS_TRANSACTIONS) {
    throw new Error('Anomaly analysis exceeded its transaction safety limit; narrow the analysis window.');
  }

  const currencyByAccount = await getAccountCurrencies(
    userId,
    transactions.flatMap((transaction) => transaction.accountId ? [transaction.accountId] : []),
  );
  const transactionsWithCurrency = transactions.map((transaction) => ({
    ...transaction,
    currency: transaction.accountId
      ? currencyByAccount.get(transaction.accountId.toString()) ?? 'currency unavailable'
      : 'currency unspecified',
    currencyKey: transaction.accountId
      ? currencyByAccount.has(transaction.accountId.toString())
        ? `currency:${currencyByAccount.get(transaction.accountId.toString())}`
        : `account:${transaction.accountId.toString()}`
      : `transaction:${transaction._id.toString()}`,
  }));
  const [large, duplicates, monthlySpikes] = await Promise.all([
    detectLargeTransactions(userId, transactionsWithCurrency, largeTransactionSince),
    detectDuplicateTransactions(userId, transactionsWithCurrency, duplicateSince),
    detectMonthlySpendingSpikes(userId, transactionsWithCurrency, now),
  ]);
  return [...large, ...duplicates, ...monthlySpikes]
    .sort((left, right) => right.detected_at.localeCompare(left.detected_at))
    .slice(0, 100);
}
