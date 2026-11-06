import { apiUrl } from '@/config/api';

export type BudgetPeriod = 'monthly' | 'weekly';
export type BudgetProgressStatus = 'on_track' | 'warning' | 'exceeded';

export type BudgetProgress = {
  id: string;
  categoryId: string;
  categoryName: string | null;
  period: BudgetPeriod;
  periodStart: string;
  periodEnd: string;
  budgetAmount: string;
  spentAmount: string;
  remainingAmount: string;
  percentageUsed: string;
  status: BudgetProgressStatus;
};

export type BudgetCategory = {
  id: string;
  name: string;
  kind: 'income' | 'expense' | 'transfer';
};

export type CreateBudgetInput = {
  categoryId: string;
  amount: string;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
};

export type TransferSuggestion = {
  debit: {
    id: string;
    accountId: string;
    accountName: string | null;
    amount: string;
    date: string;
    description: string;
    referenceNumber: string | null;
  };
  credit: {
    id: string;
    accountId: string;
    accountName: string | null;
    amount: string;
    date: string;
    description: string;
    referenceNumber: string | null;
  };
  confidence: number;
  matchReason: 'matching_reference' | 'matching_transfer_keyword';
  hoursApart: number;
};

export type DetectedRecurringPattern = {
  patternKey: string;
  accountId: string;
  counterparty: string;
  description: string;
  direction: 'credit' | 'debit';
  amount: string;
  minAmount: string;
  maxAmount: string;
  interval: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  confidence: number;
  occurrenceCount: number;
  firstOccurrence: string;
  lastOccurrence: string;
  nextExpectedDate: string;
  sourceTransactionIds: string[];
};

export type ConfirmRecurringInput = {
  patternKey: string;
  amount?: string;
  nextExpectedDate?: string;
};

export type Loan = {
  id: string;
  personId: string;
  personName: string | null;
  direction: 'lent' | 'borrowed';
  principal: string;
  repaidAmount: string;
  outstandingPrincipal: string;
  interestRate: number | null;
  startDate: string;
  status: 'active' | 'closed';
  repayments: {
    transactionId: string;
    amount: string;
    date: string;
    note: string | null;
  }[];
};

export type LoanPerson = {
  id: string;
  name: string;
};

type Envelope<T> = { success: true; data: T };

export class MoneyToolsServiceError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'MoneyToolsServiceError';
    this.statusCode = statusCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function request<T>(
  token: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new MoneyToolsServiceError('Could not reach Humaixo Arth. Check your connection and try again.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MoneyToolsServiceError('The server returned an unreadable response.', response.status);
  }
  if (!response.ok) {
    throw new MoneyToolsServiceError(
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status}).`,
      response.status,
    );
  }
  return payload as T;
}

function unwrap<T>(result: Envelope<T>): T {
  return result.data;
}

export const MoneyToolsService = {
  async getSuggestedTransfers(token: string): Promise<TransferSuggestion[]> {
    const result = await request<{
      success: true;
      data: TransferSuggestion[];
    }>(token, '/api/v1/transfers/suggest', 'POST', { page: 1, limit: 50 });
    return result.data;
  },

  confirmTransfer(
    token: string,
    transferData: { debitTransactionId: string; creditTransactionId: string },
  ): Promise<{ transferGroupId: string; transactionIds: string[]; alreadyConfirmed: boolean }> {
    return request<Envelope<{
      transferGroupId: string;
      transactionIds: string[];
      alreadyConfirmed: boolean;
    }>>(token, '/api/v1/transfers/confirm', 'POST', transferData).then(unwrap);
  },

  async getBudgets(token: string): Promise<BudgetProgress[]> {
    return unwrap(await request<Envelope<BudgetProgress[]>>(token, '/api/v1/budgets/progress'));
  },

  async createBudget(token: string, data: CreateBudgetInput): Promise<{ id: string }> {
    return unwrap(await request<Envelope<{ id: string }>>(token, '/api/v1/budgets', 'POST', data));
  },

  async getBudgetCategories(token: string): Promise<BudgetCategory[]> {
    return unwrap(await request<Envelope<BudgetCategory[]>>(token, '/api/v1/categories'));
  },

  async getDetectedRecurring(token: string): Promise<DetectedRecurringPattern[]> {
    return unwrap(await request<Envelope<DetectedRecurringPattern[]>>(token, '/api/v1/recurring/detected'));
  },

  confirmRecurring(token: string, data: ConfirmRecurringInput): Promise<unknown> {
    return request<Envelope<unknown>>(token, '/api/v1/recurring/confirm', 'POST', data).then(unwrap);
  },

  dismissRecurring(token: string, patternKey: string): Promise<unknown> {
    return request<Envelope<unknown>>(token, '/api/v1/recurring/dismiss', 'POST', { patternKey }).then(unwrap);
  },

  async getLoans(token: string): Promise<Loan[]> {
    return unwrap(await request<Envelope<Loan[]>>(token, '/api/v1/loans'));
  },

  createLoan(
    token: string,
    data: { personId: string; direction: Loan['direction']; principal: string; startDate: string },
  ): Promise<{ id: string }> {
    return request<Envelope<{ id: string }>>(token, '/api/v1/loans', 'POST', data).then(unwrap);
  },

  recordLoanRepayment(
    token: string,
    data: { loanId: string; transactionId: string; note?: string },
  ): Promise<{
    loanId: string;
    transactionId: string;
    repaymentAmount: string;
    outstandingPrincipal: string;
    status: 'active' | 'closed';
  }> {
    const { loanId, ...body } = data;
    return request<Envelope<{
      loanId: string;
      transactionId: string;
      repaymentAmount: string;
      outstandingPrincipal: string;
      status: 'active' | 'closed';
    }>>(token, `/api/v1/loans/${encodeURIComponent(loanId)}/repayments`, 'POST', body).then(unwrap);
  },

  async getLoanPeople(token: string): Promise<LoanPerson[]> {
    const result = await request<{
      success: true;
      data: LoanPerson[];
    }>(token, '/api/v1/people?page=1&limit=100');
    return result.data;
  },
};
