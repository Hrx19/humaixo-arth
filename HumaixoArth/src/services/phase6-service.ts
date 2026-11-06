import { apiUrl } from '@/config/api';

export type GroundedAiAnswer = {
  direct_answer: string;
  period: string;
  amount: string;
  transaction_count: number;
  calculation_explanation: string;
  supporting_transaction_ids: string[];
};

export type AiPermissionStatus = {
  level: 1;
  label: string;
  capabilities: {
    readOwnFinancialRecords: boolean;
    reviewOwnAiActivity: boolean;
    modifyApplication: boolean;
    executeCommands: boolean;
    privilegedAccess: boolean;
  };
};

export type AiAuditEntry = {
  id: string;
  action: 'financial_query';
  outcome: 'answered' | 'unsupported' | 'account_not_found' | 'rejected' | 'failed';
  question_length: number;
  created_at: string;
};

export type UserNotification = {
  id: string;
  type: 'budget_threshold' | 'anomaly' | 'import_completed';
  message: string;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: string;
};

export class Phase6ServiceError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'Phase6ServiceError';
    this.statusCode = statusCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function request<T>(
  path: string,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
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
    throw new Phase6ServiceError('Could not reach Humaixo Arth. Check your connection and try again.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Phase6ServiceError('The server returned an unreadable response.', response.status);
  }
  if (!response.ok) {
    throw new Phase6ServiceError(
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status}).`,
      response.status,
    );
  }
  return payload as T;
}

export const Phase6Service = {
  ask(token: string, question: string): Promise<GroundedAiAnswer> {
    return request('/api/v1/ai/query', token, 'POST', { question });
  },

  permissionStatus(token: string): Promise<{ success: true; data: AiPermissionStatus }> {
    return request('/api/v1/ai/permission-status', token);
  },

  async listAiActivity(token: string, limit = 20): Promise<AiAuditEntry[]> {
    const result = await request<{ success: true; data: AiAuditEntry[] }>(
      `/api/v1/ai/audit?limit=${limit}`,
      token,
    );
    return result.data;
  },

  async listNotifications(token: string): Promise<UserNotification[]> {
    const result = await request<{ success: true; data: UserNotification[] }>(
      '/api/v1/notifications?limit=100',
      token,
    );
    return result.data;
  },

  async markNotificationRead(token: string, id: string): Promise<UserNotification> {
    const result = await request<{ success: true; data: UserNotification }>(
      `/api/v1/notifications/${encodeURIComponent(id)}/read`,
      token,
      'PATCH',
    );
    return result.data;
  },

  markAllNotificationsRead(token: string): Promise<{ success: true; data: { updatedCount: number } }> {
    return request('/api/v1/notifications/read-all', token, 'POST', {});
  },
};
