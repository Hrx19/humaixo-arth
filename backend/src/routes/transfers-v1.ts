import { Router } from 'express';
import { verifyToken } from '../middleware/verifyToken';
import {
  confirmInternalTransferPair,
  suggestInternalTransfers,
} from '../controllers/internal-transfers-controller';

export const transfersV1Router = Router();
transfersV1Router.use(verifyToken);
transfersV1Router.post('/suggest', suggestInternalTransfers);
transfersV1Router.post('/confirm', confirmInternalTransferPair);
