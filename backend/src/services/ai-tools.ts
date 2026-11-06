import Decimal from 'decimal.js';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel } from '../../models/Account';
import { CategoryModel } from '../../models/Category';
import { PersonModel } from '../../models/Person';
import { TransactionModel } from '../../models/Transaction';
import { getAccountBalanceAt } from './account-balances';
import { normalizePersonKey } from './financial-directory';

const isoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Enter a real calendar date.');

const totalSpentArguments = z.object({
  category: z.string().trim().min(1).max(80),
  start_date: isoDateSchema,
  end_date: isoDateSchema,
}).strict().refine((value) => value.start_date <= value.end_date, {
  path: ['end_date'],
  message: 'End date must be on or after start date.',
});
const personTransactionsArguments = z.object({
  person_name: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(50),
}).strict();
const accountBalanceArguments = z.object({
  account_id: z.string().regex(/^[a-f\d]{24}$/i),
  date: isoDateSchema,
}).strict();

export type AiToolCall =
  | { name: 'get_total_spent'; arguments: z.infer<typeof totalSpentArguments> }
  | { name: 'get_transactions_by_person'; arguments: z.infer<typeof personTransactionsArguments> }
  | { name: 'get_account_balance'; arguments: z.infer<typeof accountBalanceArguments> };

export type GroundedAnswer = {
  direct_answer: string;
  period: string;
  amount: string;
  transaction_count: number;
  calculation_explanation: string;
  supporting_transaction_ids: string[];
};

type SumResult = { _id: Types.ObjectId | null; total: Types.Decimal128; count: number };
type SpendFacet = {
  summary: SumResult[];
  evidence: Array<{ _id: Types.ObjectId }>;
};
type DatePeriod = { start: Date; endExclusive: Date };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function localDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function periodForInclusiveDates(start: string, end: string): DatePeriod {
  const endExclusive = new Date(`${end}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return {
    start: new Date(`${start}T00:00:00.000Z`),
    endExclusive,
  };
}

function toGroundedAnswer(input: GroundedAnswer): GroundedAnswer {
  return {
    ...input,
    supporting_transaction_ids: input.supporting_transaction_ids.slice(0, 100),
  };
}

function unavailableAnswer(period: string, explanation: string): GroundedAnswer {
  return {
    direct_answer: explanation,
    period,
    amount: 'not available',
    transaction_count: 0,
    calculation_explanation: explanation,
    supporting_transaction_ids: [],
  };
}

export async function getTotalSpent(
  userId: Types.ObjectId,
  input: z.infer<typeof totalSpentArguments>,
): Promise<GroundedAnswer> {
  const parsed = totalSpentArguments.parse(input);
  const category = await CategoryModel.findOne({
    userId,
    kind: 'expense',
    name: { $regex: `^${escapeRegex(parsed.category)}$`, $options: 'i' },
  }).select('_id name').lean();
  const period = `${parsed.start_date} to ${parsed.end_date}`;
  if (!category) {
    return unavailableAnswer(period, `No expense category matching "${parsed.category}" exists in your records.`);
  }

  const dates = periodForInclusiveDates(parsed.start_date, parsed.end_date);
  const categoryRegex = { $regex: `^${escapeRegex(category.name)}$`, $options: 'i' };
  const filter = {
    userId,
    type: 'debit' as const,
    date: { $gte: dates.start, $lt: dates.endExclusive },
    isInternalTransfer: { $ne: true },
    isLoanRepayment: { $ne: true },
    $or: [{ categoryId: category._id }, { category: categoryRegex }],
  };
  const [facet] = await TransactionModel.aggregate<SpendFacet>([
    { $match: filter },
    { $facet: {
      summary: [{
        $group: {
          _id: '$accountId',
          total: { $sum: { $convert: { input: '$amount', to: 'decimal' } } },
          count: { $sum: 1 },
        },
      }],
      evidence: [
        { $sort: { date: -1, _id: -1 } },
        { $limit: 100 },
        { $project: { _id: 1 } },
      ],
    } },
  ]);
  const accountIds = (facet?.summary ?? []).flatMap((row) => row._id ? [row._id] : []);
  const uniqueAccountIds = [...new Map(accountIds.map((id) => [id.toString(), id])).values()];
  const accounts = uniqueAccountIds.length
    ? await AccountModel.find({ userId, _id: { $in: uniqueAccountIds } }).select('_id currency').lean()
    : [];
  const currencyByAccount = new Map(accounts.map((account) => [account._id.toString(), account.currency]));
  const totalsByCurrency = new Map<string, Decimal>();
  const transactionCount = (facet?.summary ?? []).reduce((count, row) => count + row.count, 0);
  let hasUnassignedCurrency = false;
  for (const row of facet?.summary ?? []) {
    const currency = row._id ? currencyByAccount.get(row._id.toString()) : undefined;
    if (!currency) {
      hasUnassignedCurrency = true;
      continue;
    }
    totalsByCurrency.set(
      currency,
      (totalsByCurrency.get(currency) ?? new Decimal(0)).plus(row.total.toString()),
    );
  }
  const currencySubtotals = [...totalsByCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, value]) => `${value.toString()} ${currency}`);
  const amount = transactionCount === 0
    ? '0'
    : hasUnassignedCurrency
      ? 'not safely aggregatable'
      : currencySubtotals.join('; ');
  const directAnswer = transactionCount === 0
    ? `You spent 0 in ${category.name} from ${parsed.start_date} to ${parsed.end_date}.`
    : hasUnassignedCurrency
      ? `Found ${transactionCount} ${category.name} expense transaction(s), but could not safely total them because at least one matching transaction has no resolvable account currency.`
      : `You spent ${currencySubtotals.join('; ')} in ${category.name} from ${parsed.start_date} to ${parsed.end_date}.`;
  const evidence = facet?.evidence ?? [];
  const explanation =
    `Summed ${transactionCount} recorded debit transaction(s) categorized as ${category.name} ` +
    `from ${parsed.start_date} through ${parsed.end_date}, grouped by the currency stored on each owned account; ` +
    `no currency conversion was applied. Internal transfers and loan repayments were excluded.` +
    (hasUnassignedCurrency ? ' Transactions without a resolvable account currency were not included in the subtotals.' : '') +
    (transactionCount > 100 ? ' The evidence list contains the 100 most recent matching transaction IDs.' : '');
  return toGroundedAnswer({
    direct_answer: directAnswer,
    period,
    amount,
    transaction_count: transactionCount,
    calculation_explanation: explanation,
    supporting_transaction_ids: evidence.map((transaction) => transaction._id.toString()),
  });
}

export async function getTransactionsByPerson(
  userId: Types.ObjectId,
  input: z.infer<typeof personTransactionsArguments>,
): Promise<GroundedAnswer> {
  const parsed = personTransactionsArguments.parse(input);
  const personKey = normalizePersonKey(parsed.person_name);
  const counterpartyKey = parsed.person_name
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-IN')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const person = await PersonModel.findOne({ userId, normalizedKey: personKey })
    .select('_id displayName normalizedKey')
    .lean();
  const exactName = { $regex: `^${escapeRegex(parsed.person_name.trim())}$`, $options: 'i' };
  const filter = {
    userId,
    $or: [
      ...(person ? [{ personId: person._id }] : []),
      { counterpartyKey },
      { counterparty: exactName },
      { merchant: exactName },
    ],
  };
  const transactions = await TransactionModel.find(filter)
    .select('_id amount date')
    .sort({ date: -1, _id: -1 })
    .limit(parsed.limit)
    .lean<Array<{ _id: Types.ObjectId; amount: Types.Decimal128; date?: Date }>>();
  if (!transactions.length) {
    return unavailableAnswer(
      `Most recent ${parsed.limit} matching transaction(s)`,
      `No transactions for "${parsed.person_name}" were found in your records.`,
    );
  }

  const oldest = transactions[transactions.length - 1];
  const newest = transactions[0];
  if (!oldest.date || !newest.date) {
    throw new Error('A matching transaction is missing its required date.');
  }
  const period = `${localDate(oldest.date)} to ${localDate(newest.date)}`;
  return toGroundedAnswer({
    direct_answer: `Found ${transactions.length} transaction(s) for ${person?.displayName ?? parsed.person_name}.`,
    period,
    amount: 'not aggregated',
    transaction_count: transactions.length,
    calculation_explanation:
      `Returned the ${transactions.length} most recent transaction(s) matching the exact owned person/counterparty ` +
      `name "${person?.displayName ?? parsed.person_name}". Amounts are not combined because transactions may use different currencies. The tool limit was ${parsed.limit}.`,
    supporting_transaction_ids: transactions.map((transaction) => transaction._id.toString()),
  });
}

export async function getAccountBalance(
  userId: Types.ObjectId,
  input: z.infer<typeof accountBalanceArguments>,
): Promise<GroundedAnswer> {
  const parsed = accountBalanceArguments.parse(input);
  const accountId = new Types.ObjectId(parsed.account_id);
  const account = await AccountModel.findOne({ _id: accountId, userId }).lean();
  if (!account) {
    return unavailableAnswer(parsed.date, 'No account with that ID was found for this user.');
  }
  const asOf = new Date(`${parsed.date}T23:59:59.999Z`);
  if (account.openingBalanceDate > asOf) {
    return unavailableAnswer(
      parsed.date,
      `The account opening date is after ${parsed.date}; no balance is available for that date.`,
    );
  }
  const balance = await getAccountBalanceAt(userId, account, asOf);
  const explanation =
    `Balance is reconstructed from the owned account's opening balance and its recorded transactions ` +
    `through ${parsed.date}. No account number or statement source data was used.`;
  return {
    direct_answer: `${account.name} balance on ${parsed.date} was ${balance} ${account.currency}.`,
    period: parsed.date,
    amount: balance,
    transaction_count: 0,
    calculation_explanation: explanation,
    supporting_transaction_ids: [],
  };
}

export async function resolveAccountId(
  userId: Types.ObjectId,
  accountIdOrName: string,
): Promise<string | null> {
  if (/^[a-f\d]{24}$/i.test(accountIdOrName)) {
    const account = await AccountModel.findOne({ _id: accountIdOrName, userId }).select('_id').lean();
    return account?._id.toString() ?? null;
  }
  const account = await AccountModel.findOne({
    userId,
    name: { $regex: `^${escapeRegex(accountIdOrName.trim())}$`, $options: 'i' },
  }).select('_id').lean();
  return account?._id.toString() ?? null;
}

export async function executeAiToolCall(
  userId: Types.ObjectId,
  call: AiToolCall,
): Promise<GroundedAnswer> {
  switch (call.name) {
    case 'get_total_spent':
      return getTotalSpent(userId, call.arguments);
    case 'get_transactions_by_person':
      return getTransactionsByPerson(userId, call.arguments);
    case 'get_account_balance':
      return getAccountBalance(userId, call.arguments);
  }
}

export const aiToolSchemas = {
  get_total_spent: totalSpentArguments,
  get_transactions_by_person: personTransactionsArguments,
  get_account_balance: accountBalanceArguments,
};
