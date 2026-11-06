import { Types } from 'mongoose';
import type { PipelineStage } from 'mongoose';
import { AccountModel } from '../../models/Account';
import { TransactionModel } from '../../models/Transaction';

export type TransactionSort = 'newest' | 'oldest' | 'highest_amount';
export type TransactionFilters = {
  userId: Types.ObjectId;
  from?: Date;
  to?: Date;
  minAmount?: string;
  maxAmount?: string;
  type?: 'credit' | 'debit';
  accountId?: Types.ObjectId;
  category?: string;
  search?: string;
  includeAmountInSearch?: boolean;
  page: number;
  limit: number;
  sort: TransactionSort;
};

const amountAsDecimal = {
  $convert: { input: '$amount', to: 'decimal', onError: Types.Decimal128.fromString('0'), onNull: Types.Decimal128.fromString('0') },
};

export function escapeSearchTerm(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatch(filters: Omit<TransactionFilters, 'page' | 'limit' | 'sort'>): Record<string, unknown> {
  const match: Record<string, unknown> = { userId: filters.userId };
  if (filters.type) match.type = filters.type;
  if (filters.accountId) match.accountId = filters.accountId;
  if (filters.category) match.category = filters.category;
  if (filters.from || filters.to) {
    match.date = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }
  if (filters.search) {
    const expression = new RegExp(escapeSearchTerm(filters.search), 'i');
    const textSearch: Array<Record<string, unknown>> = [
      { description: expression },
      { merchant: expression },
      { counterparty: expression },
      { referenceNumber: expression },
    ];
    if (filters.includeAmountInSearch) {
      textSearch.push({
        $expr: {
          $regexMatch: {
            input: { $toString: amountAsDecimal },
            regex: escapeSearchTerm(filters.search),
            options: 'i',
          },
        },
      });
    }
    match.$or = textSearch;
  }
  const decimalComparisons: Record<string, Types.Decimal128> = {};
  if (filters.minAmount) decimalComparisons.$gte = Types.Decimal128.fromString(filters.minAmount);
  if (filters.maxAmount) decimalComparisons.$lte = Types.Decimal128.fromString(filters.maxAmount);
  if (Object.keys(decimalComparisons).length) {
    match.$expr = { $and: [{ $gte: [amountAsDecimal, Types.Decimal128.fromString('0')] }, ...Object.entries(decimalComparisons).map(([operator, value]) => ({ [operator]: [amountAsDecimal, value] }))] };
  }
  return match;
}

function sortFor(sort: TransactionSort): Record<string, 1 | -1> {
  if (sort === 'oldest') return { date: 1, _id: 1 };
  if (sort === 'highest_amount') return { amountDecimal: -1, date: -1, _id: -1 };
  return { date: -1, _id: -1 };
}

export async function listTransactions(filters: TransactionFilters) {
  const match = buildMatch(filters);
  const [results] = await TransactionModel.aggregate<{
    rows: Array<Record<string, unknown>>;
    totalCount: Array<{ value: number }>;
  }>([
    { $match: match },
    { $addFields: { amountDecimal: amountAsDecimal } },
    {
      $facet: {
        rows: [
          { $sort: sortFor(filters.sort) },
          { $skip: (filters.page - 1) * filters.limit },
          { $limit: filters.limit },
          {
            $project: {
              _id: 1,
              accountId: 1,
              amount: { $toString: '$amountDecimal' },
              type: 1,
              category: 1,
              merchant: 1,
              counterparty: { $ifNull: ['$counterparty', null] },
              paymentMethod: { $ifNull: ['$paymentMethod', null] },
              date: 1,
              referenceNumber: { $ifNull: ['$referenceNumber', null] },
              note: { $ifNull: ['$note', null] },
              source: { $ifNull: ['$source', 'manual'] },
              confidence: { $ifNull: ['$confidence', 1] },
              description: { $ifNull: ['$description', null] },
              transactionTime: { $ifNull: ['$transactionTime', null] },
              isInternalTransfer: { $eq: ['$isInternalTransfer', true] },
              isLoanRepayment: { $eq: ['$isLoanRepayment', true] },
            },
          },
        ],
        totalCount: [{ $count: 'value' }],
      },
    },
  ]);
  const total = results?.totalCount[0]?.value ?? 0;
  return {
    data: results?.rows ?? [],
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
      hasNextPage: filters.page * filters.limit < total,
    },
  };
}

export async function searchTransactions(
  userId: Types.ObjectId,
  query: string,
  page: number,
  limit: number,
) {
  return listTransactions({
    userId,
    page,
    limit,
    sort: 'newest',
    search: query,
    includeAmountInSearch: true,
  });
}

export async function getDashboardSummary(userId: Types.ObjectId, from: Date, to: Date) {
  const transactionTotalsPipeline: PipelineStage[] = [
    {
      $match: {
        userId,
        date: { $gte: from, $lte: to },
        isInternalTransfer: { $ne: true },
        isLoanRepayment: { $ne: true },
      },
    },
    {
      $group: {
        _id: null,
        totalIncome: {
          $sum: { $cond: [{ $eq: ['$type', 'credit'] }, amountAsDecimal, Types.Decimal128.fromString('0')] },
        },
        totalExpenses: {
          $sum: { $cond: [{ $eq: ['$type', 'debit'] }, amountAsDecimal, Types.Decimal128.fromString('0')] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalIncome: { $toString: '$totalIncome' },
        totalExpenses: { $toString: '$totalExpenses' },
        netCashFlow: { $toString: { $subtract: ['$totalIncome', '$totalExpenses'] } },
      },
    },
  ];

  const assetsPipeline: PipelineStage[] = [
    { $match: { userId, isArchived: false, type: { $ne: 'credit_card' } } },
    {
      $lookup: {
        from: TransactionModel.collection.name,
        let: { accountId: '$_id', openingDate: '$openingBalanceDate' },
        pipeline: [
          {
            $match: {
              userId,
              $expr: {
                $and: [
                  { $eq: ['$accountId', '$$accountId'] },
                  { $gte: ['$date', '$$openingDate'] },
                  { $lte: ['$date', to] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              change: {
                $sum: {
                  $cond: [
                    { $eq: ['$type', 'credit'] },
                    amountAsDecimal,
                    { $multiply: [amountAsDecimal, Types.Decimal128.fromString('-1')] },
                  ],
                },
              },
            },
          },
        ],
        as: 'ledger',
      },
    },
    {
      $project: {
        balance: {
          $add: [
            { $convert: { input: '$openingBalance', to: 'decimal', onError: Types.Decimal128.fromString('0'), onNull: Types.Decimal128.fromString('0') } },
            { $ifNull: [{ $arrayElemAt: ['$ledger.change', 0] }, Types.Decimal128.fromString('0')] },
          ],
        },
      },
    },
    { $group: { _id: null, totalAssets: { $sum: '$balance' } } },
    { $project: { _id: 0, totalAssets: { $toString: '$totalAssets' } } },
  ];

  const [cashFlow, assets] = await Promise.all([
    TransactionModel.aggregate(transactionTotalsPipeline),
    AccountModel.aggregate(assetsPipeline),
  ]);
  const empty = Types.Decimal128.fromString('0').toString();
  return {
    totalAssets: (assets[0] as { totalAssets?: string } | undefined)?.totalAssets ?? empty,
    totalIncome: (cashFlow[0] as { totalIncome?: string } | undefined)?.totalIncome ?? empty,
    totalExpenses: (cashFlow[0] as { totalExpenses?: string } | undefined)?.totalExpenses ?? empty,
    netCashFlow: (cashFlow[0] as { netCashFlow?: string } | undefined)?.netCashFlow ?? empty,
    period: { from: from.toISOString(), to: to.toISOString() },
  };
}
