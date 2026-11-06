export type StatementDirection = 'credit' | 'debit';
export type StatementFormat = 'csv' | 'pdf' | 'xlsx';

export interface FieldProvenance {
  sourceColumn: string | null;
  parserVersion: string;
  confidence: number;
}

export interface NormalizedStatementRow {
  rowNumber: number;
  date: string | null;
  time: string | null;
  amount: string | null;
  direction: StatementDirection | null;
  description: string | null;
  counterparty: string | null;
  referenceNumber: string | null;
  provenance: Record<string, FieldProvenance | null>;
  issues: string[];
}

export interface RawStatementRow {
  rowNumber: number;
  rawText: string;
}

export interface ParsedStatementRow {
  raw: RawStatementRow;
  normalized: NormalizedStatementRow;
}

export interface IParser {
  readonly format: StatementFormat;
  readonly version: string;
  parse(input: Buffer | string): ParsedStatementRow[];
}

export interface StatementRowIssue {
  rowNumber: number;
  code: string;
  message: string;
}
