import { apiUrl } from '@/config/api';
import { useAuthStore } from '@/store/authStore';

export type ManagedAccountType = 'savings' | 'current' | 'cash' | 'credit_card' | 'wallet';
export type ManagedAccountStatus = 'active' | 'inactive' | 'closed';

export type ManagedAccount = {
  id: string;
  bankName: string | null;
  displayName: string;
  accountType: ManagedAccountType;
  currentBalance: string;
  currency: string;
};

export type ManagedAccountDetails = ManagedAccount & {
  maskedNumber: string | null;
  openingBalance: string;
  openingBalanceDate: string;
  status: ManagedAccountStatus;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CreateManagedAccountInput = {
  bankName: string;
  displayName: string;
  accountType: ManagedAccountType;
  currency?: string;
  openingBalance: string;
};

export class AccountServiceError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'AccountServiceError';
    this.statusCode = statusCode;
  }
}

type AccountResponse<T> = {
  success: true;
  data: T;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function request<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
  } = {},
): Promise<AccountResponse<T>> {
  const token = useAuthStore.getState().token;
  if (!token) {
    throw new AccountServiceError('Sign in to manage your accounts.');
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new AccountServiceError('Could not reach the server. Check your connection and try again.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AccountServiceError('The server returned an unreadable response.', response.status);
  }

  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === 'string'
      ? payload.error
      : `Request failed (${response.status}).`;
    throw new AccountServiceError(message, response.status);
  }

  if (!isRecord(payload) || payload.success !== true || !('data' in payload)) {
    throw new AccountServiceError('The server returned an invalid account response.', response.status);
  }

  return payload as AccountResponse<T>;
}

export const AccountService = {
  async getAccounts(): Promise<ManagedAccount[]> {
    const response = await request<ManagedAccount[]>('/api/v1/accounts');
    return response.data;
  },

  async getAccount(id: string): Promise<ManagedAccountDetails> {
    const response = await request<ManagedAccountDetails>(
      `/api/v1/accounts/${encodeURIComponent(id)}`,
    );
    return response.data;
  },

  async createAccount(input: CreateManagedAccountInput): Promise<ManagedAccount> {
    const response = await request<ManagedAccount>('/api/v1/accounts', {
      method: 'POST',
      body: input,
    });
    return response.data;
  },

  async updateAccount(
    id: string,
    input: { displayName?: string; status?: ManagedAccountStatus },
  ): Promise<ManagedAccount> {
    const response = await request<ManagedAccount>(
      `/api/v1/accounts/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: input },
    );
    return response.data;
  },

  async archiveAccount(id: string): Promise<{ id: string; status: ManagedAccountStatus }> {
    const response = await request<{ id: string; status: ManagedAccountStatus }>(
      `/api/v1/accounts/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    return response.data;
  },
};
