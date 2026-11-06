import { Router } from 'express';
import { verifyToken } from '../middleware/verifyToken';
import {
  confirmDetectedRecurringPattern,
  getDetectedRecurringPatterns,
} from '../controllers/recurring-transactions-controller';

export const recurringV1Router = Router();
recurringV1Router.use(verifyToken);
recurringV1Router.get('/detected', getDetectedRecurringPatterns);
recurringV1Router.post('/confirm', confirmDetectedRecurringPattern);
