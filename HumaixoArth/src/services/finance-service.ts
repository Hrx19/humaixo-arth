import { apiUrl } from '@/config/api';
import type {
  BalanceHistoryPoint,
  BudgetSummary,
  CreateAccountInput,
  CreateTransactionInput,
  FinanceAccount,
  FinanceAnalytics,
  FinanceTransaction,
  MerchantSummary,
  PersonDetails,
  PersonSummary,
  StatementImportHistoryItem,
  StatementImportResult,
  StatementPreview,
} from '@/types/finance';

export class FinanceServiceError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'FinanceServiceError';
    this.statusCode = statusCode;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function requestJson<T>(
  path: string,
  token: string,
  options: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new FinanceServiceError(
      'Humaixo Arth could not reach the server. Check the API address and connection.',
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new FinanceServiceError('The server returned an unreadable response.', response.status);
  }

  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === 'string'
      ? payload.error
      : `Request failed (${response.status}).`;
    throw new FinanceServiceError(message, response.status);
  }

  return payload as T;
}

function withQuery(path: string, values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && String(value).trim()) query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export const FinanceService = {
  getAccounts(token: string): Promise<FinanceAccount[]> {
    return requestJson('/api/accounts', token);
  },

  createAccount(token: string, input: CreateAccountInput): Promise<{ success: true; data: FinanceAccount }> {
    return requestJson('/api/accounts', token, { method: 'POST', body: input });
  },

  archiveAccount(token: string, accountId: string): Promise<{ success: true; message: string }> {
    return requestJson(`/api/accounts/${encodeURIComponent(accountId)}/archive`, token, { method: 'PATCH' });
  },

  getTransactions(
    token: string,
    filters: {
      page?: number;
      limit?: number;
      type?: 'credit' | 'debit';
      category?: string;
      accountId?: string;
      counterpartyKey?: string;
      from?: string;
      to?: string;
      search?: string;
    } = {},
  ): Promise<FinanceTransaction[]> {
    return requestJson(withQuery('/api/transactions', filters), token);
  },

  createTransaction(token: string, input: CreateTransactionInput): Promise<{ success: true; data: FinanceTransaction }> {
    return requestJson('/api/transactions', token, { method: 'POST', body: input });
  },

  deleteTransaction(token: string, transactionId: string): Promise<{ success: true; message: string }> {
    return requestJson(`/api/transactions/${encodeURIComponent(transactionId)}`, token, { method: 'DELETE' });
  },

  async parsePdfStatement(
    token: string,
    accountId: string,
    file: Blob,
    fileName: string,
  ): Promise<{ success: true; data: { importedCount: number; duplicateCount: number; account: string } }> {
    const formData = new FormData();
    formData.append('accountId', accountId);
    formData.append('file', file, fileName);

    let response: Response;
    try {
      response = await fetch(apiUrl('/api/parse-statement'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
    } catch {
      throw new FinanceServiceError(
        'Humaixo Arth could not reach the server. Check the API address and connection.',
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FinanceServiceError('The server returned an unreadable response.', response.status);
    }

    if (!response.ok) {
      const message = isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status}).`;
      throw new FinanceServiceError(message, response.status);
    }

    return payload as {
      success: true;
      data: { importedCount: number; duplicateCount: number; account: string };
    };
  },

  parseSms(
    token: string,
    sms: string,
    accountId?: string,
  ): Promise<{ success: true; data: FinanceTransaction }> {
    return requestJson('/api/parse-sms', token, {
      method: 'POST',
      body: { sms, ...(accountId ? { accountId } : {}) },
    });
  },

  getAnalytics(token: string, months = 12): Promise<FinanceAnalytics> {
    return requestJson(withQuery('/api/transactions/analytics', { months }), token);
  },

  async getBudget(token: string): Promise<BudgetSummary> {
    const response = await requestJson<{ success: true; data: BudgetSummary }>('/api/budget', token);
    return response.data;
  },

  async setBudget(token: string, amount: string): Promise<BudgetSummary> {
    const response = await requestJson<{ success: true; data: BudgetSummary }>('/api/budget', token, {
      method: 'PUT',
      body: { amount },
    });
    return response.data;
  },

  getPeople(token: string): Promise<PersonSummary[]> {
    return requestJson('/api/transactions/people', token);
  },

  getPersonDetails(token: string, key: string): Promise<PersonDetails> {
    return requestJson(`/api/transactions/people/${encodeURIComponent(key)}`, token);
  },

  getMerchants(token: string): Promise<MerchantSummary[]> {
    return requestJson('/api/transactions/merchants', token);
  },

  getBalanceHistory(token: string, months = 12, accountId?: string): Promise<{ series: BalanceHistoryPoint[] }> {
    return requestJson(
      withQuery('/api/transactions/balance-history', { months, accountId }),
      token,
    );
  },

  getBalanceAt(token: string, at: string, accountId?: string) {
    return requestJson<{
      at: string;
      balance: string;
      byAccount: { id: string; name: string; institution: string; balance: string; currency: string }[];
    }>(withQuery('/api/transactions/balance-at', { at, accountId }), token);
  },

  previewStatement(
    token: string,
    input: { accountId: string; fileName: string; csvContent: string },
  ): Promise<StatementPreview> {
    return requestJson('/api/statements/preview', token, { method: 'POST', body: input });
  },

  importStatement(
    token: string,
    input: { accountId: string; fileName: string; csvContent: string },
  ): Promise<StatementImportResult> {
    return requestJson('/api/statements/import', token, { method: 'POST', body: input });
  },

  getStatementHistory(token: string): Promise<StatementImportHistoryItem[]> {
    return requestJson('/api/statements', token);
  },
};
