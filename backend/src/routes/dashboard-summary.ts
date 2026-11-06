import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';
import { getDashboardSummary } from '../services/transaction-intelligence';

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict().refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  { path: ['to'], message: 'End date must be on or after start date.' },
);

export const dashboardSummaryRouter = Router();
dashboardSummaryRouter.use(verifyToken);

dashboardSummaryRouter.get('/dashboard-summary', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId || !Types.ObjectId.isValid(userId)) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }
  const query = querySchema.safeParse(request.query);
  if (!query.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid dashboard date range.',
      details: query.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  const to = query.data.to ?? new Date();
  const from = query.data.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1_000);
  try {
    const data = await getDashboardSummary(new Types.ObjectId(userId), from, to);
    return response.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Dashboard summary failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not load dashboard summary.' });
  }
});
