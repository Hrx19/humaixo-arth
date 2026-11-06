import { apiUrl } from '@/config/api';

export type StatementDirection = 'credit' | 'debit';

export type StatementNormalizedRow = {
  rowNumber: number;
  date: string | null;
  time: string | null;
  amount: string | null;
  direction: StatementDirection | null;
  description: string | null;
  counterparty: string | null;
  referenceNumber: string | null;
  provenance: Record<string, { sourceColumn: string | null; parserVersion: string; confidence: number } | null>;
  issues: string[];
};

export type StatementRawRow = {
  rowNumber: number;
  rawText: string;
  values: string[];
};

export type StatementReview = {
  id: string;
  fileName: string;
  status: 'pending_review' | 'confirmed';
  account: { id: string; name: string; institution: string } | null;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  rejectedRows: number;
  period: { from: string | null; to: string | null };
  rows: { raw: StatementRawRow | null; normalized: StatementNormalizedRow }[];
  issues: { rowNumber: number; code: string; message: string; status: string }[];
  result: StatementConfirmation | null;
};

export type StatementCorrection = Partial<Omit<StatementNormalizedRow, 'rowNumber' | 'provenance' | 'issues'>> & {
  rowNumber: number;
};

export type StatementConfirmation = {
  statementId: string;
  fileName: string;
  account: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  rejectedRows: number;
  currentBalance: string;
};

export class StatementImportServiceError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'StatementImportServiceError';
    this.statusCode = statusCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new StatementImportServiceError('The server returned an unreadable response.', response.status);
  }
}

function getErrorMessage(payload: unknown, status: number): string {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : `Request failed (${status}).`;
}

export const StatementImportService = {
  async upload(token: string, accountId: string, fileName: string, contents: Blob): Promise<{ statementId: string; fileName: string; duplicateUpload?: boolean }> {
    const formData = new FormData();
    formData.append('accountId', accountId);
    formData.append('file', contents, fileName);
    let response: Response;
    try {
      response = await fetch(apiUrl('/api/v1/statements/upload'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
    } catch {
      throw new StatementImportServiceError('Could not reach the server. Check your connection and try again.');
    }
    const payload = await readJson(response);
    if (!response.ok) throw new StatementImportServiceError(getErrorMessage(payload, response.status), response.status);
    if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data) || typeof payload.data.statementId !== 'string') {
      throw new StatementImportServiceError('The server returned an invalid upload response.', response.status);
    }
    return payload.data as { statementId: string; fileName: string; duplicateUpload?: boolean };
  },

  async getPreview(token: string, statementId: string): Promise<StatementReview> {
    let response: Response;
    try {
      response = await fetch(apiUrl(`/api/v1/statements/${encodeURIComponent(statementId)}/preview`), {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new StatementImportServiceError('Could not reach the server. Check your connection and try again.');
    }
    const payload = await readJson(response);
    if (!response.ok) throw new StatementImportServiceError(getErrorMessage(payload, response.status), response.status);
    if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
      throw new StatementImportServiceError('The server returned an invalid statement preview.', response.status);
    }
    return payload.data as unknown as StatementReview;
  },

  async confirm(token: string, statementId: string, corrections: StatementCorrection[]): Promise<StatementConfirmation> {
    let response: Response;
    try {
      response = await fetch(apiUrl(`/api/v1/statements/${encodeURIComponent(statementId)}/confirm`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ corrections }),
      });
    } catch {
      throw new StatementImportServiceError('Could not reach the server. Check your connection and try again.');
    }
    const payload = await readJson(response);
    if (!response.ok) throw new StatementImportServiceError(getErrorMessage(payload, response.status), response.status);
    if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
      throw new StatementImportServiceError('The server returned an invalid confirmation response.', response.status);
    }
    return payload.data as unknown as StatementConfirmation;
  },
};
