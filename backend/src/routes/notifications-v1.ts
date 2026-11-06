import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';
import { detectUserAnomalies } from '../services/anomaly-detector';
import { getBudgetProgress } from '../services/budget-management';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notifications';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const notificationsV1Router = Router();
notificationsV1Router.use(verifyToken);

notificationsV1Router.get('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId || !Types.ObjectId.isValid(userId)) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }
  const parsed = querySchema.safeParse(request.query);
  if (!parsed.success) {
    return response.status(400).json({ success: false, error: 'Notification limit must be between 1 and 100.' });
  }
  try {
    const userObjectId = new Types.ObjectId(userId);
    await Promise.all([
      detectUserAnomalies(userObjectId),
      getBudgetProgress(userObjectId),
    ]);
    const data = await listNotifications(userObjectId, parsed.data.limit);
    return response.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Notification list failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load notifications.' });
  }
});

notificationsV1Router.patch('/:id/read', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId || !Types.ObjectId.isValid(userId)) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }
  if (!Types.ObjectId.isValid(request.params.id)) {
    return response.status(400).json({ success: false, error: 'Notification ID is invalid.' });
  }
  try {
    const data = await markNotificationRead(
      new Types.ObjectId(userId),
      new Types.ObjectId(request.params.id),
    );
    return data
      ? response.status(200).json({ success: true, data })
      : response.status(404).json({ success: false, error: 'Notification was not found.' });
  } catch (error) {
    logger.error('Notification read update failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not update notification.' });
  }
});

notificationsV1Router.post('/read-all', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId || !Types.ObjectId.isValid(userId)) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }
  try {
    const updatedCount = await markAllNotificationsRead(new Types.ObjectId(userId));
    return response.status(200).json({ success: true, data: { updatedCount } });
  } catch (error) {
    logger.error('Mark all notifications read failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not mark notifications as read.' });
  }
});
