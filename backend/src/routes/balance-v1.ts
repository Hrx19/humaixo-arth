import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';
import { reconstructAccountBalance } from '../services/balance-engine';

const querySchema = z.object({ at: z.coerce.date().optional() }).strict();
export const balanceV1Router = Router();
balanceV1Router.use(verifyToken);

balanceV1Router.get('/:id/balance', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId || !Types.ObjectId.isValid(userId)) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }
  if (!Types.ObjectId.isValid(request.params.id)) {
    return response.status(400).json({ success: false, error: 'Account ID is invalid.' });
  }
  const query = querySchema.safeParse(request.query);
  if (!query.success) return response.status(400).json({ success: false, error: 'Balance date is invalid.' });
  try {
    const balance = await reconstructAccountBalance(
      new Types.ObjectId(userId),
      new Types.ObjectId(request.params.id),
      query.data.at ?? new Date(),
    );
    if (!balance) return response.status(404).json({ success: false, error: 'Account was not found.' });
    return response.status(200).json({ success: true, data: balance });
  } catch (error) {
    logger.error('Account balance reconstruction failed.', { message: error instanceof Error ? error.message : String(error) });
    return response.status(500).json({ success: false, error: 'Could not reconstruct account balance.' });
  }
});
