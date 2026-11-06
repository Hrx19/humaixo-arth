import Decimal from 'decimal.js';
import { Types } from 'mongoose';
import { CategoryBudgetModel, type BudgetPeriod } from '../../models/Budget';
import { CategoryModel } from '../../models/Category';
import { TransactionModel } from '../../models/Transaction';
import { recordNotification } from './notifications';

type BudgetMutation = {
  categoryId: Types.ObjectId;
  amount: string;
  period: BudgetPeriod;
  startDate: Date;
  endDate: Date;
};

function currentPeriod(period: BudgetPeriod, now: Date): { from: Date; to: Date } {
  if (period === 'weekly') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

export async function assertExpenseCategory(
  userId: Types.ObjectId,
  categoryId: Types.ObjectId,
): Promise<boolean> {
  return Boolean(await CategoryModel.exists({ _id: categoryId, userId, kind: 'expense' }));
}

export async function createBudget(userId: Types.ObjectId, input: BudgetMutation) {
  const budget = await CategoryBudgetModel.create({ ...input, userId });
  return serializeBudget(budget);
}

export async function listBudgets(userId: Types.ObjectId) {
  const budgets = await CategoryBudgetModel.find({ userId }).sort({ startDate: -1, _id: -1 }).lean();
  const categoryIds = [...new Set(budgets.map((budget) => budget.categoryId.toString()))]
    .map((id) => new Types.ObjectId(id));
  const categories = categoryIds.length
    ? await CategoryModel.find({ userId, _id: { $in: categoryIds } }).select('name kind').lean()
    : [];
  const categoryNames = new Map(categories.map((category) => [category._id.toString(), category.name]));
  return budgets.map((budget) => ({
    id: budget._id.toString(),
    categoryId: budget.categoryId.toString(),
    categoryName: categoryNames.get(budget.categoryId.toString()) ?? null,
    amount: budget.amount.toString(),
    period: budget.period,
    startDate: budget.startDate.toISOString(),
    endDate: budget.endDate.toISOString(),
  }));
}

export async function getBudget(userId: Types.ObjectId, budgetId: Types.ObjectId) {
  const budget = await CategoryBudgetModel.findOne({ _id: budgetId, userId }).lean();
  if (!budget) return null;
  const category = await CategoryModel.findOne({
    _id: budget.categoryId,
    userId,
  }).select('name').lean();
  return {
    id: budget._id.toString(),
    categoryId: budget.categoryId.toString(),
    categoryName: category?.name ?? null,
    amount: budget.amount.toString(),
    period: budget.period,
    startDate: budget.startDate.toISOString(),
    endDate: budget.endDate.toISOString(),
  };
}

export async function updateBudget(
  userId: Types.ObjectId,
  budgetId: Types.ObjectId,
  input: Partial<BudgetMutation>,
) {
  const budget = await CategoryBudgetModel.findOneAndUpdate(
    { _id: budgetId, userId },
    { $set: input },
    { new: true, runValidators: true },
  );
  return budget ? serializeBudget(budget) : null;
}

export async function deleteBudget(userId: Types.ObjectId, budgetId: Types.ObjectId): Promise<boolean> {
  const result = await CategoryBudgetModel.deleteOne({ _id: budgetId, userId });
  return result.deletedCount === 1;
}

function serializeBudget(budget: {
  _id: Types.ObjectId;
  categoryId: Types.ObjectId;
  amount: Types.Decimal128;
  period: BudgetPeriod;
  startDate: Date;
  endDate: Date;
}) {
  return {
    id: budget._id.toString(),
    categoryId: budget.categoryId.toString(),
    amount: budget.amount.toString(),
    period: budget.period,
    startDate: budget.startDate.toISOString(),
    endDate: budget.endDate.toISOString(),
  };
}

export async function getBudgetProgress(
  userId: Types.ObjectId,
  budgetId?: Types.ObjectId,
  now = new Date(),
) {
  const query: Record<string, unknown> = {
    userId,
    startDate: { $lte: now },
    endDate: { $gte: now },
  };
  if (budgetId) query._id = budgetId;

  const budgets = await CategoryBudgetModel.find(query).sort({ _id: 1 }).lean();
  const results = await Promise.all(budgets.map(async (budget) => {
    const category = await CategoryModel.findOne({
      _id: budget.categoryId,
      userId,
    }).select('name kind').lean();
    const current = currentPeriod(budget.period, now);
    const from = new Date(Math.max(current.from.getTime(), budget.startDate.getTime()));
    const budgetEndExclusive = new Date(budget.endDate);
    budgetEndExclusive.setDate(budgetEndExclusive.getDate() + 1);
    const to = new Date(Math.min(current.to.getTime(), budgetEndExclusive.getTime()));
    const [spentRow] = await TransactionModel.aggregate<{ amount: Types.Decimal128 }>([
      {
        $match: {
          userId,
          categoryId: budget.categoryId,
          type: 'debit',
          date: { $gte: from, $lt: to },
          isInternalTransfer: { $ne: true },
          isLoanRepayment: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          amount: { $sum: { $convert: { input: '$amount', to: 'decimal' } } },
        },
      },
    ]);

    const budgetAmount = new Decimal(budget.amount.toString());
    const spent = new Decimal(spentRow?.amount.toString() ?? '0');
    const remaining = budgetAmount.minus(spent);
    const percentageUsed = budgetAmount.isZero()
      ? new Decimal(0)
      : spent.div(budgetAmount).mul(100);
    return {
      id: budget._id.toString(),
      categoryId: budget.categoryId.toString(),
      categoryName: category?.name ?? null,
      period: budget.period,
      periodStart: from.toISOString(),
      periodEnd: new Date(to.getTime() - 1).toISOString(),
      budgetAmount: budgetAmount.toString(),
      spentAmount: spent.toString(),
      remainingAmount: remaining.toString(),
      percentageUsed: percentageUsed.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
      status: spent.gt(budgetAmount)
        ? 'exceeded'
        : percentageUsed.gt(80)
          ? 'warning'
          : 'on_track',
    };
  }));

  await Promise.all(results
    .filter((progress) => new Decimal(progress.percentageUsed).gt(80))
    .map((progress) => recordNotification({
      userId,
      type: 'budget_threshold',
      message:
        `${progress.categoryName ?? 'A budget'} is at ${progress.percentageUsed}% ` +
        `of its ${progress.budgetAmount} limit for this budget period.`,
      relatedEntityId: new Types.ObjectId(progress.id),
      dedupeKey: `budget:${progress.id}:${progress.periodStart}`,
    })));
  return results;
}
