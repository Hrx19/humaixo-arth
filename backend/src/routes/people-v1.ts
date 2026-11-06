import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { PersonModel } from '../../models/Person';
import { TransactionModel } from '../../models/Transaction';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();

export const peopleV1Router = Router();
peopleV1Router.use(verifyToken);

function getUserId(request: { auth?: { userId: string } }): Types.ObjectId | null {
  const userId = request.auth?.userId;
  return userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
}

peopleV1Router.get('/', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const page = pageSchema.safeParse(request.query);
  if (!page.success) return response.status(400).json({ success: false, error: 'Invalid people pagination.' });
  try {
    const [people, total] = await Promise.all([
      PersonModel.find({ userId }).sort({ displayName: 1, _id: 1 })
        .skip((page.data.page - 1) * page.data.limit).limit(page.data.limit).lean(),
      PersonModel.countDocuments({ userId }),
    ]);
    const ids = people.map((person) => person._id);
    const totals = ids.length ? await TransactionModel.aggregate<{
      _id: Types.ObjectId; sent: Types.Decimal128; received: Types.Decimal128; count: number; lastDate: Date | null;
    }>([
      { $match: { userId, personId: { $in: ids }, status: { $ne: 'failed' } } },
      {
        $group: {
          _id: '$personId',
          sent: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, { $convert: { input: '$amount', to: 'decimal' } }, Types.Decimal128.fromString('0')] } },
          received: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $convert: { input: '$amount', to: 'decimal' } }, Types.Decimal128.fromString('0')] } },
          count: { $sum: 1 },
          lastDate: { $max: '$date' },
        },
      },
    ]) : [];
    const totalsById = new Map(totals.map((entry) => [entry._id.toString(), entry]));
    return response.status(200).json({
      success: true,
      data: people.map((person) => {
        const totalForPerson = totalsById.get(person._id.toString());
        return {
          id: person._id.toString(),
          name: person.displayName,
          sent: totalForPerson?.sent.toString() ?? '0',
          received: totalForPerson?.received.toString() ?? '0',
          transactionCount: totalForPerson?.count ?? 0,
          lastTransactionAt: totalForPerson?.lastDate?.toISOString() ?? null,
        };
      }),
      pagination: { page: page.data.page, limit: page.data.limit, total, totalPages: Math.ceil(total / page.data.limit) },
    });
  } catch (error) {
    logger.error('People directory request failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not load people.' });
  }
});

peopleV1Router.get('/:id/transactions', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  const personId = Types.ObjectId.isValid(request.params.id) ? new Types.ObjectId(request.params.id) : null;
  if (!personId) return response.status(400).json({ success: false, error: 'Person ID is invalid.' });
  const page = pageSchema.safeParse(request.query);
  if (!page.success) return response.status(400).json({ success: false, error: 'Invalid transaction pagination.' });
  try {
    const person = await PersonModel.findOne({ _id: personId, userId }).lean();
    if (!person) return response.status(404).json({ success: false, error: 'Person was not found.' });
    const filter = { userId, personId };
    const [transactions, total] = await Promise.all([
      TransactionModel.find(filter).select('-rawSMS -rawSourceData').sort({ date: -1, _id: -1 })
        .skip((page.data.page - 1) * page.data.limit).limit(page.data.limit).lean(),
      TransactionModel.countDocuments(filter),
    ]);
    return response.status(200).json({
      success: true,
      person: { id: person._id.toString(), name: person.displayName },
      data: transactions.map((transaction) => ({
        id: transaction._id.toString(),
        accountId: transaction.accountId?.toString() ?? null,
        amount: transaction.amount.toString(),
        type: transaction.type,
        category: transaction.category,
        merchant: transaction.merchant,
        date: transaction.date?.toISOString() ?? null,
        description: transaction.description ?? null,
        source: transaction.source ?? 'manual',
      })),
      pagination: { page: page.data.page, limit: page.data.limit, total, totalPages: Math.ceil(total / page.data.limit) },
    });
  } catch (error) {
    logger.error('Person transaction history request failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not load person transaction history.' });
  }
});

peopleV1Router.get('/:id', async (request, response) => {
  const userId = getUserId(request);
  if (!userId) return response.status(401).json({ success: false, error: 'Authentication is required.' });
  if (!Types.ObjectId.isValid(request.params.id)) return response.status(400).json({ success: false, error: 'Person ID is invalid.' });
  try {
    const personId = new Types.ObjectId(request.params.id);
    const [person, summary] = await Promise.all([
      PersonModel.findOne({ _id: personId, userId }).lean(),
      TransactionModel.aggregate<{
        sent: Types.Decimal128; received: Types.Decimal128; count: number; lastDate: Date | null;
      }>([
        { $match: { userId, personId, status: { $ne: 'failed' } } },
        {
          $group: {
            _id: null,
            sent: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, { $convert: { input: '$amount', to: 'decimal' } }, Types.Decimal128.fromString('0')] } },
            received: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $convert: { input: '$amount', to: 'decimal' } }, Types.Decimal128.fromString('0')] } },
            count: { $sum: 1 },
            lastDate: { $max: '$date' },
          },
        },
      ]),
    ]);
    if (!person) return response.status(404).json({ success: false, error: 'Person was not found.' });
    return response.status(200).json({
      success: true,
      data: {
        id: person._id.toString(),
        name: person.displayName,
        sent: summary[0]?.sent.toString() ?? '0',
        received: summary[0]?.received.toString() ?? '0',
        transactionCount: summary[0]?.count ?? 0,
        lastTransactionAt: summary[0]?.lastDate?.toISOString() ?? null,
      },
    });
  } catch (error) {
    logger.error('Person detail request failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not load person details.' });
  }
});
