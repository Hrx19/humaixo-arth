import * as SecureStore from 'expo-secure-store';
import { apiUrl } from '@/config/api';
import type { GroundedAiAnswer } from '@/services/phase6-service';

const OWNER_SESSION_KEY = 'humaixo.ai.owner-session';

export type PermissionAuditEntry = {
  id: string;
  action: string;
  tier: 1 | 2 | 3;
  decision: 'allowed' | 'approval_required' | 'denied';
  resourceType: string;
  result: string;
  createdAt: string;
};

export type MutationStatus = {
  mutationId: string;
  branchName: string;
  changedPaths: string[];
  checks: {
    linter: { status: 'not_run' | 'passed' | 'failed'; logs: string };
    typecheck: { status: 'not_run' | 'passed' | 'failed'; logs: string };
    overall: 'not_run' | 'passed' | 'failed';
    logs: string[];
  };
  approval: { state: 'pending' | 'approved' | 'rejected' };
  deploymentState: string;
  createdAt: string;
};

export type FinancialAnomaly = {
  id: string;
  type: 'large_transaction' | 'spending_spike' | 'possible_duplicate';
  message: string;
  transaction_ids: string[];
  amount: string | null;
  detected_at: string;
  reviewed: boolean;
};

type RequestOptions = {
  token: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  ownerToken?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${options.token}`,
        ...(options.ownerToken ? { 'X-Owner-Session-Token': options.ownerToken } : {}),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new Error('Could not reach Humaixo Arth. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The server returned an unreadable response.');
  }
  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status}).`,
    );
  }
  return payload as T;
}

async function ownerSession(): Promise<string> {
  const token = await SecureStore.getItemAsync(OWNER_SESSION_KEY);
  if (!token) throw new Error('Verify your Master Code to start an owner session.');
  return token;
}

export const AiApiService = {
  async masterCodeStatus(token: string): Promise<{ enrolled: boolean }> {
    const result = await request<{ success: true; data: { enrolled: boolean } }>(
      '/api/v1/ai/master/status',
      { token },
    );
    return result.data;
  },

  async verifyMasterCode(token: string, code: string): Promise<{ expiresAt: string; scopes: string[] }> {
    const result = await request<{
      success: true;
      data: { ownerToken: string; expiresAt: string; scopes: string[] };
    }>('/api/v1/ai/master/verify', { token, method: 'POST', body: { code } });
    await SecureStore.setItemAsync(OWNER_SESSION_KEY, result.data.ownerToken);
    return { expiresAt: result.data.expiresAt, scopes: result.data.scopes };
  },

  async enrollMasterCode(token: string, code: string): Promise<{ expiresAt: string }> {
    const result = await request<{ success: true; data: { ownerToken: string; expiresAt: string } }>(
      '/api/v1/ai/master/enroll',
      { token, method: 'POST', body: { code } },
    );
    await SecureStore.setItemAsync(OWNER_SESSION_KEY, result.data.ownerToken);
    return { expiresAt: result.data.expiresAt };
  },

  async clearOwnerSession(token: string): Promise<void> {
    const ownerToken = await SecureStore.getItemAsync(OWNER_SESSION_KEY);
    if (!ownerToken) return;
    try {
      await request<void>('/api/v1/ai/master/revoke', {
        token,
        method: 'POST',
        body: {},
        ownerToken,
      });
    } finally {
      await SecureStore.deleteItemAsync(OWNER_SESSION_KEY);
    }
  },

  async hasOwnerSession(): Promise<boolean> {
    return Boolean(await SecureStore.getItemAsync(OWNER_SESSION_KEY));
  },

  submitChatQuery(token: string, question: string): Promise<GroundedAiAnswer> {
    return request('/api/v1/ai/query', { token, method: 'POST', body: { question } });
  },

  async listAnomalies(token: string): Promise<FinancialAnomaly[]> {
    const result = await request<{ success: true; data: FinancialAnomaly[] }>(
      '/api/v1/anomalies',
      { token },
    );
    return result.data;
  },

  async createProposal(
    token: string,
    summary: string,
  ): Promise<{ id: string; state: 'pending' }> {
    const result = await request<{
      success: true;
      data: { id: string; state: 'pending' };
    }>('/api/v1/ai/actions/proposals', {
      token,
      method: 'POST',
      body: {
        action: 'settings_change',
        resourceType: 'user-settings',
        summary,
        payload: { request: summary },
      },
    });
    return result.data;
  },

  async approveProposal(token: string, proposalId: string, decision: 'approved' | 'rejected' = 'approved'): Promise<void> {
    await request(`/api/v1/ai/actions/proposals/${encodeURIComponent(proposalId)}/approve`, {
      token,
      method: 'POST',
      body: { decision },
    });
  },

  async executeEmergencyAction(
    token: string,
    action: 'cache-flush' | 'restart-service',
  ): Promise<{ state: string; providers?: number; clearedEntries?: number }> {
    const ownerToken = await ownerSession();
    const result = await request<{
      success: true;
      data: { state: string; providers?: number; clearedEntries?: number };
    }>(`/api/v1/ai/emergency/${action}`, {
      token,
      ownerToken,
      method: 'POST',
      body: {},
    });
    return result.data;
  },

  async authorizeAction(token: string, action: string): Promise<unknown> {
    const ownerToken = await SecureStore.getItemAsync(OWNER_SESSION_KEY);
    return request('/api/v1/ai/actions/authorize', {
      token,
      method: 'POST',
      body: { action },
      ...(ownerToken ? { ownerToken } : {}),
    });
  },

  async listAudit(token: string): Promise<PermissionAuditEntry[]> {
    const result = await request<{ success: true; data: PermissionAuditEntry[] }>(
      '/api/v1/ai/actions/audit?limit=50',
      { token },
    );
    return result.data;
  },

  async listMutations(token: string): Promise<MutationStatus[]> {
    const result = await request<{ success: true; data: MutationStatus[] }>(
      '/api/v1/ai/mutations',
      { token },
    );
    return result.data;
  },

  async createMutation(
    token: string,
    baseCommit: string,
    patch: string,
  ): Promise<{ id: string; deploymentState: string }> {
    const ownerToken = await ownerSession();
    const result = await request<{
      success: true;
      data: { id: string; deploymentState: string };
    }>('/api/v1/ai/mutations', {
      token,
      ownerToken,
      method: 'POST',
      body: { patch, baseCommit },
    });
    return result.data;
  },
};
