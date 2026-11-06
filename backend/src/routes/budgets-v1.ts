import { Router } from 'express';
import {
  createUserBudget,
  deleteUserBudget,
  getUserBudget,
  getUserBudgetProgress,
  listUserBudgets,
  updateUserBudget,
} from '../controllers/budgets-controller';
import { verifyToken } from '../middleware/verifyToken';

export const budgetsV1Router = Router();
budgetsV1Router.use(verifyToken);
budgetsV1Router.get('/progress', getUserBudgetProgress);
budgetsV1Router.get('/', listUserBudgets);
budgetsV1Router.post('/', createUserBudget);
budgetsV1Router.get('/:id', getUserBudget);
budgetsV1Router.patch('/:id', updateUserBudget);
budgetsV1Router.delete('/:id', deleteUserBudget);
