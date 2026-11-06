import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import { Types } from 'mongoose';
import {
  RecurringTransactionModel,
  type RecurrenceInterval,
} from '../../models/RecurringTransaction';
import { TransactionModel } from '../../models/Transaction';

const HISTORY_MONTHS = 48;
const MIN_OCCURRENCES = 3;
const AMOUNT_TOLERANCE = new Decimal('0.05');
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });

const INTERVALS: Array<{ name: RecurrenceInterval; days: number }> = [
  { name: 'weekly', days: 7 },
  { name: 'biweekly', days: 14 },
  { name: 'monthly', days: 30 },
  { name: 'quarterly', days: 91 },
  { name: 'yearly', days: 365 },
];

type TransactionOccurrence = {
  id: Types.ObjectId;
  accountId: Types.ObjectId;
  amount: Decimal;
  date: Date;
  direction: 'credit' | 'debit';
  counterparty: string;
  description: string;
};

type DetectedPattern = {
  patternKey: string;
  accountId: string;
  counterparty: string;
  description: string;
  direction: 'credit' | 'debit';
  amount: string;
  minAmount: string;
  maxAmount: string;
  interval: RecurrenceInterval;
  confidence: number;
  occurrenceCount: number;
  firstOccurrence: string;
  lastOccurrence: string;
  nextExpectedDate: string;
  sourceTransactionIds: string[];
};

type TransactionCursorRow = {
  _id: Types.ObjectId;
  accountId: Types.ObjectId;
  amount: Types.Decimal128;
  date: Date;
  type: 'credit' | 'debit';
  merchant: string;
  counterparty?: string;
  counterpartyKey?: string;
  description?: string;
  isInternalTransfer?: boolean;
};

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-IN')
    .replace(/\b(?:neft|imps|rtgs|upi|payment|paid|received|debit|credit|txn|transaction)\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function occurrenceParty(row: TransactionCursorRow): { label: string; key: string } {
  const counterparty = row.counterparty?.trim() ?? '';
  const explicitKey = row.counterpartyKey?.trim() ?? '';
  const description = row.description?.trim() ?? '';
  const merchant = row.merchant.trim();
  const label = counterparty || description || merchant;
  const normalized = normalizeText(explicitKey || counterparty || description || merchant);
  return { label: label || 'Unknown counterparty', key: normalized };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function findInterval(gapsInDays: number[]): { name: RecurrenceInterval; days: number; regularity: number } | null {
  const medianGap = median(gapsInDays);
  const expected = INTERVALS
    .map((interval) => ({
      ...interval,
      deviation: Math.abs(medianGap - interval.days) / interval.days,
    }))
    .sort((left, right) => left.deviation - right.deviation)[0];
  if (!expected || expected.deviation > 0.2) return null;

  const meanDeviation = gapsInDays.reduce(
    (total, gap) => total + Math.abs(gap - medianGap) / Math.max(medianGap, 1),
    0,
  ) / gapsInDays.length;
  return {
    name: expected.name,
    days: expected.days,
    regularity: Math.max(0, 1 - meanDeviation),
  };
}

function makePatternKey(
  userId: Types.ObjectId,
  accountId: Types.ObjectId,
  direction: TransactionOccurrence['direction'],
  partyKey: string,
  interval: RecurrenceInterval,
): string {
  return createHash('sha256')
    .update([userId.toString(), accountId.toString(), direction, partyKey, interval].join('|'))
    .digest('hex');
}

function addInterval(date: Date, interval: RecurrenceInterval, fallbackDays: number): Date {
  if (interval === 'weekly' || interval === 'biweekly') {
    return new Date(date.getTime() + fallbackDays * DAY_IN_MILLISECONDS);
  }

  const monthIncrement = interval === 'monthly' ? 1 : interval === 'quarterly' ? 3 : 12;
  const targetMonth = date.getUTCMonth() + monthIncrement;
  const result = new Date(date);
  result.setUTCDate(1);
  result.setUTCMonth(targetMonth);
  const lastDayOfTargetMonth = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(date.getUTCDate(), lastDayOfTargetMonth));
  return result;
}

function clusterByAmount(occurrences: TransactionOccurrence[]): TransactionOccurrence[][] {
  const sorted = [...occurrences].sort((left, right) => left.amount.comparedTo(right.amount));
  const clusters: TransactionOccurrence[][] = [];

  for (const occurrence of sorted) {
    const cluster = clusters[clusters.length - 1];
    if (!cluster) {
      clusters.push([occurrence]);
      continue;
    }

    const anchor = cluster[0].amount;
    const upperBound = anchor.mul(new Decimal(1).plus(AMOUNT_TOLERANCE));
    if (occurrence.amount.lte(upperBound)) cluster.push(occurrence);
    else clusters.push([occurrence]);
  }
  return clusters;
}

function decimalMedian(values: Decimal[]): Decimal {
  const sorted = [...values].sort((left, right) => left.comparedTo(right));
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return sorted[middle - 1].plus(sorted[middle]).div(2);
}

function buildPattern(
  userId: Types.ObjectId,
  partyKey: string,
  occurrences: TransactionOccurrence[],
): DetectedPattern | null {
  if (occurrences.length < MIN_OCCURRENCES) return null;
  const chronological = [...occurrences].sort((left, right) => left.date.getTime() - right.date.getTime());
  const gapsInDays = chronological.slice(1).map((current, index) =>
    (current.date.getTime() - chronological[index].date.getTime()) / DAY_IN_MILLISECONDS,
  );
  const recurrence = findInterval(gapsInDays);
  if (!recurrence) return null;

  const amounts = chronological.map((occurrence) => occurrence.amount);
  const minAmount = amounts.reduce((minimum, amount) => Decimal.min(minimum, amount));
  const maxAmount = amounts.reduce((maximum, amount) => Decimal.max(maximum, amount));
  const medianAmount = decimalMedian(amounts);
  const spread = maxAmount.minus(minAmount).div(medianAmount);
  if (spread.gt(AMOUNT_TOLERANCE)) return null;

  const countScore = Math.min(1, (chronological.length - 2) / 5);
  const amountScore = Math.max(0, 1 - spread.div(AMOUNT_TOLERANCE).toNumber());
  const confidence = Math.max(
    0,
    Math.min(0.99, 0.55 + countScore * 0.2 + recurrence.regularity * 0.2 + amountScore * 0.05),
  );
  const lastOccurrence = chronological[chronological.length - 1];
  const expectedDate = addInterval(lastOccurrence.date, recurrence.name, recurrence.days);

  return {
    patternKey: makePatternKey(
      userId,
      lastOccurrence.accountId,
      lastOccurrence.direction,
      partyKey,
      recurrence.name,
    ),
    accountId: lastOccurrence.accountId.toString(),
    counterparty: lastOccurrence.counterparty,
    description: lastOccurrence.description,
    direction: lastOccurrence.direction,
    amount: medianAmount.toString(),
    minAmount: minAmount.toString(),
    maxAmount: maxAmount.toString(),
    interval: recurrence.name,
    confidence: Number(confidence.toFixed(3)),
    occurrenceCount: chronological.length,
    firstOccurrence: chronological[0].date.toISOString(),
    lastOccurrence: lastOccurrence.date.toISOString(),
    nextExpectedDate: expectedDate.toISOString(),
    sourceTransactionIds: chronological.map((occurrence) => occurrence.id.toString()),
  };
}

export async function detectRecurringPatterns(userId: Types.ObjectId): Promise<DetectedPattern[]> {
  const from = new Date();
  from.setMonth(from.getMonth() - HISTORY_MONTHS);

  const groups = new Map<string, { partyKey: string; occurrences: TransactionOccurrence[] }>();
  const cursor = TransactionModel.find({
    userId,
    date: { $gte: from },
    accountId: { $type: 'objectId' },
    amount: { $type: 'decimal' },
    type: { $in: ['credit', 'debit'] },
    isInternalTransfer: { $ne: true },
    isLoanRepayment: { $ne: true },
  })
    .select('_id accountId amount date type merchant counterparty counterpartyKey description isInternalTransfer')
    .sort({ date: 1, _id: 1 })
    .lean<TransactionCursorRow[]>()
    .cursor();

  for await (const row of cursor) {
    if (!(row.amount instanceof Types.Decimal128) || !row.accountId || !row.date) continue;
    const party = occurrenceParty(row);
    if (!party.key) continue;
    const groupKey = [row.accountId.toString(), row.type, party.key].join('|');
    let group = groups.get(groupKey);
    if (!group) {
      group = { partyKey: party.key, occurrences: [] };
      groups.set(groupKey, group);
    }
    group.occurrences.push({
      id: row._id,
      accountId: row.accountId,
      amount: new Decimal(row.amount.toString()),
      date: row.date,
      direction: row.type,
      counterparty: row.counterparty?.trim() || row.merchant,
      description: row.description?.trim() || row.merchant,
    });
  }

  const detected: DetectedPattern[] = [];
  for (const group of groups.values()) {
    const amountClusters = clusterByAmount(group.occurrences);
    for (const cluster of amountClusters) {
      const pattern = buildPattern(userId, group.partyKey, cluster);
      if (pattern) detected.push(pattern);
    }
  }

  const confirmedKeys = detected.length
    ? new Set((await RecurringTransactionModel.find({
      userId,
      patternKey: { $in: detected.map((pattern) => pattern.patternKey) },
    }).select('patternKey').lean()).map((pattern) => pattern.patternKey))
    : new Set<string>();

  return detected
    .filter((pattern) => !confirmedKeys.has(pattern.patternKey))
    .sort((left, right) => right.confidence - left.confidence || left.nextExpectedDate.localeCompare(right.nextExpectedDate));
}

export async function confirmRecurringPattern(userId: Types.ObjectId, patternKey: string) {
  const pattern = (await detectRecurringPatterns(userId))
    .find((candidate) => candidate.patternKey === patternKey);
  if (!pattern) return null;

  const setOnInsert = {
    userId,
    ...pattern,
    accountId: new Types.ObjectId(pattern.accountId),
    amount: Types.Decimal128.fromString(pattern.amount),
    minAmount: Types.Decimal128.fromString(pattern.minAmount),
    maxAmount: Types.Decimal128.fromString(pattern.maxAmount),
    firstOccurrence: new Date(pattern.firstOccurrence),
    lastOccurrence: new Date(pattern.lastOccurrence),
    nextExpectedDate: new Date(pattern.nextExpectedDate),
    sourceTransactionIds: pattern.sourceTransactionIds.map((id) => new Types.ObjectId(id)),
    status: 'confirmed' as const,
    confirmedAt: new Date(),
  };
  const recurring = await RecurringTransactionModel.findOneAndUpdate(
    { userId, patternKey },
    { $setOnInsert: setOnInsert },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return {
    id: recurring._id.toString(),
    patternKey: recurring.patternKey,
    accountId: recurring.accountId.toString(),
    counterparty: recurring.counterparty,
    description: recurring.description,
    direction: recurring.direction,
    amount: recurring.amount.toString(),
    minAmount: recurring.minAmount.toString(),
    maxAmount: recurring.maxAmount.toString(),
    interval: recurring.interval,
    confidence: recurring.confidence,
    occurrenceCount: recurring.occurrenceCount,
    firstOccurrence: recurring.firstOccurrence.toISOString(),
    lastOccurrence: recurring.lastOccurrence.toISOString(),
    nextExpectedDate: recurring.nextExpectedDate.toISOString(),
    status: recurring.status,
    confirmedAt: recurring.confirmedAt.toISOString(),
  };
}
