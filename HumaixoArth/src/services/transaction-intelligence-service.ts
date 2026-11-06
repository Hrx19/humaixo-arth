import { apiUrl } from '@/config/api';

export type TransactionSort = 'newest' | 'oldest' | 'highest_amount';
export type TransactionDirection = 'credit' | 'debit';

export type TransactionListItem = {
  id: string;
  accountId: string | null;
  amount: string;
  type: TransactionDirection;
  category: string;
  merchant: string;
  counterparty: string | null;
  paymentMethod: string | null;
  date: string | null;
  referenceNumber: string | null;
  note: string | null;
  source: 'manual' | 'sms' | 'statement';
  confidence: number;
  description: string | null;
  transactionTime: string | null;
  isInternalTransfer: boolean;
  isLoanRepayment: boolean;
};

export type TransactionPage = {
  data: TransactionListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
  };
};

export type TransactionDetail = TransactionListItem & {
  accountName: string | null;
  time: string | null;
  balanceBefore: string | null;
  balanceAfter: string | null;
  sourceRowNumber: number | null;
  rawSourceData: { rowNumber: number; rawText: string } | null;
  provenance: Record<string, { sourceColumn: string | null; parserVersion: string; confidence: number } | null> | null;
  userCorrections: unknown;
  userEdits: { field: string; previousValue: unknown; value: unknown; editedAt: string }[];
  statement: { id: string; fileName: string; previewUrl: string } | null;
};

export type DashboardSummary = {
  totalAssets: string;
  totalIncome: string;
  totalExpenses: string;
  netCashFlow: string;
  period: { from: string; to: string };
};

export type TransactionFilters = {
  page: number;
  limit: number;
  sort: TransactionSort;
  from?: string;
  to?: string;
  minAmount?: string;
  maxAmount?: string;
  type?: TransactionDirection;
  accountId?: string;
  category?: string;
  search?: string;
};

export class TransactionIntelligenceError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'TransactionIntelligenceError';
    this.statusCode = statusCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new TransactionIntelligenceError('Could not reach the server. Check your connection and try again.');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TransactionIntelligenceError('The server returned an unreadable response.', response.status);
  }
  if (!response.ok) {
    throw new TransactionIntelligenceError(
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status}).`,
      response.status,
    );
  }
  return payload as T;
}

function queryString(values: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && String(value).trim()) search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

function unwrap<T>(result: { success: true; data: T }): T {
  return result.data;
}

export function formatDecimalINR(input: string): string {
  const value = input.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match) return `₹${value}`;
  const [, sign, integer, fraction = '', exponentText = '0'] = match;
  const digits = integer + fraction;
  const decimalPosition = integer.length + Number(exponentText);
  const expandedInteger = decimalPosition <= 0
    ? '0'
    : decimalPosition >= digits.length
      ? digits + '0'.repeat(decimalPosition - digits.length)
      : digits.slice(0, decimalPosition);
  const expandedFraction = decimalPosition >= digits.length
    ? ''
    : decimalPosition <= 0
      ? `${'0'.repeat(-decimalPosition)}${digits}`
      : digits.slice(decimalPosition);
  const normalizedInteger = expandedInteger.replace(/^0+(?=\d)/, '');
  const grouped = normalizedInteger.length <= 3
    ? normalizedInteger
    : `${normalizedInteger.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${normalizedInteger.slice(-3)}`;
  const fractionText = expandedFraction.replace(/0+$/, '');
  return `₹${sign === '-' ? '-' : ''}${grouped}${fractionText ? `.${fractionText}` : ''}`;
}

export const TransactionIntelligenceService = {
  async list(token: string, filters: Omit<TransactionFilters, 'search'>): Promise<TransactionPage> {
    const response = await request<TransactionPage>(
      token,
      `/api/v1/transactions${queryString(filters)}`,
    );
    return response;
  },

  async search(token: string, q: string, page: number, limit: number): Promise<TransactionPage> {
    return request<TransactionPage>(
      token,
      `/api/v1/transactions/search${queryString({ q, page, limit })}`,
    );
  },

  async getDetail(token: string, id: string): Promise<TransactionDetail> {
    const response = await request<{ success: true; data: TransactionDetail }>(
      token,
      `/api/v1/transactions/${encodeURIComponent(id)}`,
    );
    return unwrap(response);
  },

  async update(token: string, id: string, input: { category?: string; note?: string | null }): Promise<TransactionDetail> {
    const response = await request<{ success: true; data: TransactionDetail }>(
      token,
      `/api/v1/transactions/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
    return unwrap(response);
  },

  async dashboardSummary(token: string, from?: string, to?: string): Promise<DashboardSummary> {
    const response = await request<{ success: true; data: DashboardSummary }>(
      token,
      `/api/v1/analytics/dashboard-summary${queryString({ from, to })}`,
    );
    return unwrap(response);
  },
};
