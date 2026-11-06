import { Router } from 'express';
import {
  createLoanRepayment,
  createUserLoan,
  getUserLoanBalance,
  listUserLoans,
} from '../controllers/loans-controller';
import { verifyToken } from '../middleware/verifyToken';

export const loansV1Router = Router();
loansV1Router.use(verifyToken);
loansV1Router.get('/', listUserLoans);
loansV1Router.post('/', createUserLoan);
loansV1Router.post('/:id/repayments', createLoanRepayment);
loansV1Router.get('/:id/balance', getUserLoanBalance);
