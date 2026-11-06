import Decimal from 'decimal.js';
import mongoose, { Types } from 'mongoose';
import { AccountModel } from '../../models/Account';
import { TransactionModel } from '../../models/Transaction';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;
const TRANSFER_KEYWORDS = ['NEFT', 'IMPS', 'TRANSFER', 'UPI'] as const;
const EMPTY_REFERENCE = '';

type CandidateDocument = {
  _id: Types.ObjectId;
  accountId: Types.ObjectId;
  amount: Types.Decimal128;
  date: Date;
  type: 'debit' | 'credit';
  description?: string;
  merchant: string;
  referenceNumber?: string;
  transferGroupId?: Types.ObjectId;
  isInternalTransfer?: boolean;
};

type CandidatePair = {
  debit: CandidateDocument;
  credit: CandidateDocument;
  millisecondsApart: number;
  referenceMatched: boolean;
};

type TransferErrorCode = 'not_found' | 'invalid_pair' | 'already_linked';

export class InternalTransferError extends Error {
  constructor(
    message: string,
    readonly code: TransferErrorCode,
  ) {
    super(message);
    this.name = 'InternalTransferError';
  }
}

function keywordExpression(
  leftDescription: string,
  leftMerchant: string,
  rightDescription: string,
  rightMerchant: string,
): Record<string, unknown> {
  return {
    $or: TRANSFER_KEYWORDS.map((keyword) => ({
      $and: [
        {
          $or: [
            { $regexMatch: { input: { $ifNull: [leftDescription, ''] }, regex: keyword, options: 'i' } },
            { $regexMatch: { input: { $ifNull: [leftMerchant, ''] }, regex: keyword, options: 'i' } },
          ],
        },
        {
          $or: [
            { $regexMatch: { input: { $ifNull: [rightDescription, ''] }, regex: keyword, options: 'i' } },
            { $regexMatch: { input: { $ifNull: [rightMerchant, ''] }, regex: keyword, options: 'i' } },
          ],
        },
      ],
    })),
  };
}

function sameReferenceExpression(): Record<string, unknown> {
  const normalize = (field: string) => ({
    $toUpper: { $trim: { input: { $ifNull: [field, EMPTY_REFERENCE] } } },
  });
  return {
    $and: [
      { $ne: [normalize('$$debitReference'), EMPTY_REFERENCE] },
      { $eq: [normalize('$referenceNumber'), normalize('$$debitReference')] },
    ],
  };
}

function confidence(pair: CandidatePair): number {
  const elapsedDayFraction = pair.millisecondsApart / DAY_IN_MILLISECONDS;
  const score = pair.referenceMatched
    ? 0.95 - elapsedDayFraction * 0.05
    : 0.85 - elapsedDayFraction * 0.15;
  return Number(score.toFixed(3));
}

function compareDecimal128(left: Types.Decimal128, right: Types.Decimal128): boolean {
  return new Decimal(left.toString()).equals(new Decimal(right.toString()));
}

export async function detectInternalTransfers(
  userId: Types.ObjectId,
  options: { page?: number; limit?: number } = {},
) {
  const page = options.page ?? 1;
  const limit = options.limit ?? 100;
  const keywordRegex = TRANSFER_KEYWORDS.join('|');

  const [result] = await TransactionModel.aggregate<{
    rows: CandidatePair[];
    totalCount: Array<{ value: number }>;
  }>([
    {
      $match: {
        userId,
        type: 'debit',
        accountId: { $type: 'objectId' },
        amount: { $type: 'decimal' },
        transferGroupId: { $exists: false },
        $or: [
          { description: { $regex: keywordRegex, $options: 'i' } },
          { merchant: { $regex: keywordRegex, $options: 'i' } },
          { referenceNumber: { $type: 'string', $ne: '' } },
        ],
      },
    },
    {
      $lookup: {
        from: TransactionModel.collection.name,
        let: {
          debitId: '$_id',
          debitAccountId: '$accountId',
          debitAmount: '$amount',
          debitDate: '$date',
          debitReference: '$referenceNumber',
          debitDescription: '$description',
          debitMerchant: '$merchant',
        },
        pipeline: [
          {
            $match: {
              userId,
              type: 'credit',
              accountId: { $type: 'objectId' },
              amount: { $type: 'decimal' },
              transferGroupId: { $exists: false },
              $expr: {
                $and: [
                  { $ne: ['$_id', '$$debitId'] },
                  { $ne: ['$accountId', '$$debitAccountId'] },
                  { $eq: ['$amount', '$$debitAmount'] },
                  {
                    $lte: [
                      { $abs: { $subtract: ['$date', '$$debitDate'] } },
                      DAY_IN_MILLISECONDS,
                    ],
                  },
                  {
                    $or: [
                      sameReferenceExpression(),
                      keywordExpression(
                        '$$debitDescription',
                        '$$debitMerchant',
                        '$description',
                        '$merchant',
                      ),
                    ],
                  },
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              accountId: 1,
              amount: 1,
              date: 1,
              type: 1,
              description: 1,
              merchant: 1,
              referenceNumber: 1,
            },
          },
        ],
        as: 'credits',
      },
    },
    { $unwind: '$credits' },
    {
      $addFields: {
        millisecondsApart: { $abs: { $subtract: ['$date', '$credits.date'] } },
        referenceMatched: {
          $and: [
            { $ne: [{ $trim: { input: { $ifNull: ['$referenceNumber', ''] } } }, ''] },
            {
              $eq: [
                { $toUpper: { $trim: { input: { $ifNull: ['$referenceNumber', ''] } } } },
                { $toUpper: { $trim: { input: { $ifNull: ['$credits.referenceNumber', ''] } } } },
              ],
            },
          ],
        },
      },
    },
    { $sort: { millisecondsApart: 1, _id: 1, 'credits._id': 1 } },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              debit: {
                _id: '$_id',
                accountId: '$accountId',
                amount: '$amount',
                date: '$date',
                type: '$type',
                description: '$description',
                merchant: '$merchant',
                referenceNumber: '$referenceNumber',
              },
              credit: '$credits',
              millisecondsApart: 1,
              referenceMatched: 1,
            },
          },
        ],
        totalCount: [{ $count: 'value' }],
      },
    },
  ]);

  const pairs = result?.rows ?? [];
  const accountIds = [...new Set(pairs.flatMap(({ debit, credit }) => [
    debit.accountId.toString(),
    credit.accountId.toString(),
  ]))].map((id) => new Types.ObjectId(id));
  const accounts = accountIds.length
    ? await AccountModel.find({ userId, _id: { $in: accountIds } }).select('_id name').lean()
    : [];
  const accountNames = new Map(accounts.map((account) => [account._id.toString(), account.name]));

  return {
    data: pairs.map((pair) => ({
      debit: {
        id: pair.debit._id.toString(),
        accountId: pair.debit.accountId.toString(),
        accountName: accountNames.get(pair.debit.accountId.toString()) ?? null,
        amount: pair.debit.amount.toString(),
        date: pair.debit.date.toISOString(),
        description: pair.debit.description ?? pair.debit.merchant,
        referenceNumber: pair.debit.referenceNumber ?? null,
      },
      credit: {
        id: pair.credit._id.toString(),
        accountId: pair.credit.accountId.toString(),
        accountName: accountNames.get(pair.credit.accountId.toString()) ?? null,
        amount: pair.credit.amount.toString(),
        date: pair.credit.date.toISOString(),
        description: pair.credit.description ?? pair.credit.merchant,
        referenceNumber: pair.credit.referenceNumber ?? null,
      },
      confidence: confidence(pair),
      matchReason: pair.referenceMatched ? 'matching_reference' : 'matching_transfer_keyword',
      hoursApart: new Decimal(pair.millisecondsApart).div(60 * 60 * 1_000).toDecimalPlaces(2).toNumber(),
    })),
    pagination: {
      page,
      limit,
      total: result?.totalCount[0]?.value ?? 0,
      totalPages: Math.ceil((result?.totalCount[0]?.value ?? 0) / limit),
    },
  };
}

function hasMatchingTransferEvidence(debit: CandidateDocument, credit: CandidateDocument): boolean {
  const debitReference = debit.referenceNumber?.trim().toLocaleUpperCase('en-IN');
  const creditReference = credit.referenceNumber?.trim().toLocaleUpperCase('en-IN');
  if (debitReference && debitReference === creditReference) return true;

  const debitText = `${debit.description ?? ''} ${debit.merchant}`.toLocaleUpperCase('en-IN');
  const creditText = `${credit.description ?? ''} ${credit.merchant}`.toLocaleUpperCase('en-IN');
  return TRANSFER_KEYWORDS.some((keyword) => debitText.includes(keyword) && creditText.includes(keyword));
}

export async function confirmInternalTransfer(
  userId: Types.ObjectId,
  debitId: Types.ObjectId,
  creditId: Types.ObjectId,
) {
  const session = await mongoose.startSession();
  let result: { transferGroupId: string; transactionIds: string[]; alreadyConfirmed: boolean } | undefined;

  try {
    await session.withTransaction(async () => {
      const transactions = await TransactionModel.find({
        userId,
        _id: { $in: [debitId, creditId] },
      })
        .select('_id accountId amount type date description merchant referenceNumber transferGroupId isInternalTransfer')
        .session(session)
        .lean<CandidateDocument[]>();

      if (transactions.length !== 2) {
        throw new InternalTransferError('One or both transactions were not found.', 'not_found');
      }

      const debit = transactions.find((transaction) => transaction._id.equals(debitId));
      const credit = transactions.find((transaction) => transaction._id.equals(creditId));
      if (!debit || !credit) {
        throw new InternalTransferError('A debit and a credit transaction are required.', 'invalid_pair');
      }

      if (
        debit.type !== 'debit' ||
        credit.type !== 'credit' ||
        !debit.accountId ||
        !credit.accountId ||
        debit.accountId.equals(credit.accountId) ||
        !(debit.amount instanceof Types.Decimal128) ||
        !(credit.amount instanceof Types.Decimal128) ||
        !compareDecimal128(debit.amount, credit.amount) ||
        Math.abs(debit.date.getTime() - credit.date.getTime()) > DAY_IN_MILLISECONDS ||
        !hasMatchingTransferEvidence(debit, credit)
      ) {
        throw new InternalTransferError(
          'Transactions must be equal-amount debit and credit entries in different accounts, within 24 hours, with matching transfer evidence.',
          'invalid_pair',
        );
      }

      const accounts = await AccountModel.find({
        userId,
        _id: { $in: [debit.accountId, credit.accountId] },
      }).select('_id').session(session).lean();
      if (accounts.length !== 2) {
        throw new InternalTransferError('Both accounts must belong to the authenticated user.', 'invalid_pair');
      }

      const existingGroupId = debit.transferGroupId ?? credit.transferGroupId;
      if (existingGroupId) {
        if (
          debit.transferGroupId?.equals(existingGroupId) &&
          credit.transferGroupId?.equals(existingGroupId) &&
          debit.isInternalTransfer &&
          credit.isInternalTransfer
        ) {
          result = {
            transferGroupId: existingGroupId.toString(),
            transactionIds: [debitId.toString(), creditId.toString()],
            alreadyConfirmed: true,
          };
          return;
        }
        throw new InternalTransferError('At least one transaction is already linked to another transfer.', 'already_linked');
      }

      const transferGroupId = new Types.ObjectId();
      const edit = {
        field: 'internalTransfer',
        value: transferGroupId.toString(),
        editedAt: new Date(),
        source: 'user_confirmation',
      };
      const update = await TransactionModel.updateMany(
        {
          userId,
          _id: { $in: [debitId, creditId] },
          transferGroupId: { $exists: false },
        },
        {
          $set: { isInternalTransfer: true, transferGroupId },
          $push: { userEdits: edit },
        },
        { session },
      );
      if (update.modifiedCount !== 2) {
        throw new InternalTransferError('Transactions changed while confirming the transfer; reload suggestions and retry.', 'already_linked');
      }

      result = {
        transferGroupId: transferGroupId.toString(),
        transactionIds: [debitId.toString(), creditId.toString()],
        alreadyConfirmed: false,
      };
    });
  } finally {
    await session.endSession();
  }

  if (!result) throw new Error('Transfer confirmation completed without a result.');
  return result;
}
