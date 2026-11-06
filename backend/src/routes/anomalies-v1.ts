import { Router } from 'express';
import { Types } from 'mongoose';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';
import { detectUserAnomalies } from '../services/anomaly-detector';

export const anomaliesV1Router = Router();
anomaliesV1Router.use(verifyToken);

anomaliesV1Router.get('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId || !Types.ObjectId.isValid(userId)) {
    return response.status(401).json({ success: false, error: 'Authentication is required.' });
  }
  try {
    const data = await detectUserAnomalies(new Types.ObjectId(userId));
    return response.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Anomaly detection failed.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({ success: false, error: 'Could not analyze your transactions for anomalies.' });
  }
});
