import Decimal from 'decimal.js';
import { Types } from 'mongoose';
import { AccountModel } from '../../models/Account';
import { TransactionModel } from '../../models/Transaction';

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });

type TotalRow = {
  credits: Types.Decimal128;
  debits: Types.Decimal128;
  firstDate?: Date;
  lastDate?: Date;
};

type SnapshotRow = {
  _id: Types.ObjectId;
  date: Date;
  balanceAfter: Types.Decimal128;
};

function sumPipeline(match: Record<string, unknown>) {
  const amount = { $convert: { input: '$amount', to: 'decimal' } };
  return [
    { $match: match },
    {
      $group: {
        _id: null,
        credits: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, amount, Types.Decimal128.fromString('0')] } },
        debits: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, amount, Types.Decimal128.fromString('0')] } },
        firstDate: { $min: '$date' },
        lastDate: { $max: '$date' },
      },
    },
  ];
}

async function transactionTotals(
  userId: Types.ObjectId,
  accountId: Types.ObjectId,
  from?: Date,
  to = new Date(),
  afterSnapshot?: SnapshotRow,
): Promise<TotalRow> {
  const dateFilter: Record<string, unknown> = {
    ...(from ? { $gte: from } : {}),
    $lte: to,
  };
  const match: Record<string, unknown> = { userId, accountId, date: dateFilter, status: { $ne: 'failed' } };
  if (afterSnapshot) {
    match.$or = [
      { date: { ...dateFilter, $gt: afterSnapshot.date } },
      { date: afterSnapshot.date, _id: { $gt: afterSnapshot._id } },
    ];
  }
  const [row] = await TransactionModel.aggregate<TotalRow>(sumPipeline(match));
  return row ?? {
    credits: Types.Decimal128.fromString('0'),
    debits: Types.Decimal128.fromString('0'),
  };
}

export async function reconstructAccountBalance(
  userId: Types.ObjectId,
  accountId: Types.ObjectId,
  at = new Date(),
) {
  const account = await AccountModel.findOne({ _id: accountId, userId }).lean();
  if (!account) return null;

  const [reported, totals] = await Promise.all([
    TransactionModel.findOne({
      userId,
      accountId,
      date: { $lte: at },
      balanceAfter: { $exists: true, $ne: null },
      source: 'statement',
    })
      .select('_id date balanceAfter')
      .sort({ date: -1, _id: -1 })
      .lean<SnapshotRow>(),
    transactionTotals(userId, accountId, account.openingBalanceDate, at),
  ]);
  const opening = new Decimal(account.openingBalance.toString());
  const calculated = opening
    .plus(totals.credits.toString())
    .minus(totals.debits.toString());
  const afterReported = reported
    ? await transactionTotals(userId, accountId, undefined, at, reported)
    : null;
  const bankReported = reported ? new Decimal(reported.balanceAfter.toString()) : null;
  const balance = bankReported && afterReported
    ? bankReported.plus(afterReported.credits.toString()).minus(afterReported.debits.toString())
    : calculated;
  const coverage = await TransactionModel.aggregate<{ firstDate?: Date; lastDate?: Date }>([
    { $match: { userId, accountId, date: { $lte: at }, status: { $ne: 'failed' } } },
    { $group: { _id: null, firstDate: { $min: '$date' }, lastDate: { $max: '$date' } } },
  ]);

  return {
    accountId: accountId.toString(),
    currency: account.currency,
    balance: balance.toString(),
    calculatedBalance: calculated.toString(),
    bankReportedBalance: bankReported?.toString() ?? null,
    provenance: bankReported ? 'bank_reported_plus_subsequent_ledger' : 'calculated_from_opening_balance',
    coverage: {
      from: (coverage[0]?.firstDate ?? account.openingBalanceDate).toISOString(),
      to: (coverage[0]?.lastDate ?? at).toISOString(),
      openingBalanceDate: account.openingBalanceDate.toISOString(),
      latestBankReportedAt: reported?.date.toISOString() ?? null,
    },
    totals: {
      openingBalance: account.openingBalance.toString(),
      postedCredits: totals.credits.toString(),
      postedDebits: totals.debits.toString(),
    },
  };
}

export async function sumLedgerChanges(
  userId: Types.ObjectId,
  accountId: Types.ObjectId,
  from?: Date,
  to = new Date(),
): Promise<string> {
  const totals = await transactionTotals(userId, accountId, from, to);
  return new Decimal(totals.credits.toString()).minus(totals.debits.toString()).toString();
}
