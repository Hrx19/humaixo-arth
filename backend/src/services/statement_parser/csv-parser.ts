import type {
  FieldProvenance,
  IParser,
  NormalizedStatementRow,
  ParsedStatementRow,
  RawStatementRow,
  StatementDirection,
} from './types';
import { normalizeStatementAmount, normalizeStatementDate } from './normalizer';
import Decimal from 'decimal.js';

type CsvRecord = { values: string[]; rawText: string };
type Column = { index: number; header: string } | undefined;

const HEADER_ALIASES = {
  date: ['date', 'transactiondate', 'transactiondatetime', 'txndate', 'postingdate', 'valuedate'],
  amount: ['amount', 'transactionamount', 'txnamount'],
  debit: ['debit', 'debitamount', 'withdrawal', 'withdrawalamount', 'withdrawn'],
  credit: ['credit', 'creditamount', 'deposit', 'depositamount', 'paidin'],
  direction: ['type', 'transactiontype', 'drcr', 'direction', 'debitcredit'],
  description: ['description', 'narration', 'particulars', 'transactiondetails', 'details', 'remarks'],
  counterparty: ['counterparty', 'recipient', 'payee', 'beneficiary', 'receiver'],
  referenceNumber: ['reference', 'referencenumber', 'referenceno', 'refno', 'utr', 'rrn', 'transactionid'],
} as const;

const PARSER_VERSION = 'csv-v2';

function splitCsv(input: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let values: string[] = [];
  let field = '';
  let quoted = false;
  let recordStart = 0;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      values.push(field);
      const end = index;
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      records.push({ values, rawText: input.slice(recordStart, end) });
      values = [];
      field = '';
      recordStart = index + 1;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  values.push(field);
  if (input.length > recordStart) {
    records.push({ values, rawText: input.slice(recordStart) });
  }
  return records;
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findColumn(headers: string[], aliases: readonly string[]): Column {
  const index = headers.findIndex((header) =>
    aliases.some((alias) => alias === normalizeHeader(header)),
  );
  return index < 0 ? undefined : { index, header: headers[index] };
}

function cell(record: CsvRecord, column: Column): string | null {
  if (!column) return null;
  const value = (record.values[column.index] ?? '').trim();
  return value || null;
}

function provenance(column: Column, confidence: number): FieldProvenance | null {
  return column ? { sourceColumn: column.header, parserVersion: PARSER_VERSION, confidence } : null;
}

function parseDirection(value: string | null): StatementDirection | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized && /^(debit|dr|withdrawal|withdraw|paid out|outgoing)$/.test(normalized)) return 'debit';
  if (normalized && /^(credit|cr|deposit|received|paid in|incoming)$/.test(normalized)) return 'credit';
  return null;
}

function extractCounterparty(description: string | null): string | null {
  if (!description) return null;
  const upiId = description.match(/\b([A-Z0-9._-]{2,}@[A-Z0-9.-]{2,})\b/i);
  if (upiId) return upiId[1].slice(0, 120);
  const transferName = description.match(/\b(?:UPI|IMPS|NEFT|RTGS)\/([^/]{2,80})\//i);
  return transferName?.[1]?.trim().slice(0, 120) || null;
}

function parseRecord(record: CsvRecord, rowNumber: number, columns: {
  date: Column;
  amount: Column;
  debit: Column;
  credit: Column;
  direction: Column;
  description: Column;
  counterparty: Column;
  referenceNumber: Column;
}, expectedColumnCount: number): ParsedStatementRow {
  const issues: string[] = [];
  const rawDate = cell(record, columns.date);
  const dateResult = rawDate
    ? normalizeStatementDate(rawDate)
    : { date: null, time: null, confidence: 0, issue: 'Date is missing.' };
  if (dateResult.issue) issues.push(dateResult.issue);
  if (record.values.length !== expectedColumnCount) {
    issues.push(`Row has ${record.values.length} cells; the header has ${expectedColumnCount} columns.`);
  }

  const rawDescription = cell(record, columns.description);
  if (!rawDescription) issues.push('Description is missing.');

  const debitRaw = cell(record, columns.debit);
  const creditRaw = cell(record, columns.credit);
  const amountRaw = cell(record, columns.amount);
  const debitValue = debitRaw === null ? null : normalizeStatementAmount(debitRaw);
  const creditValue = creditRaw === null ? null : normalizeStatementAmount(creditRaw);
  const amountValue = amountRaw === null ? null : normalizeStatementAmount(amountRaw);
  let amount: string | null = null;
  let direction = parseDirection(cell(record, columns.direction));

  if (columns.debit || columns.credit) {
    if ((debitRaw && debitValue === null) || (creditRaw && creditValue === null)) {
      issues.push('Debit or credit amount is not a valid number.');
    } else if (debitValue !== null && !new Decimal(debitValue).isZero() && creditValue !== null && !new Decimal(creditValue).isZero()) {
      issues.push('Row contains both debit and credit amounts.');
    } else if (debitValue !== null && !new Decimal(debitValue).isZero()) {
      amount = new Decimal(debitValue).abs().toString();
      direction = 'debit';
    } else if (creditValue !== null && !new Decimal(creditValue).isZero()) {
      amount = new Decimal(creditValue).abs().toString();
      direction = 'credit';
    } else {
      issues.push('Debit/credit amount is missing or zero.');
    }
  } else if (amountValue !== null) {
    if (new Decimal(amountValue).isNegative() && !direction) direction = 'debit';
    if (new Decimal(amountValue).isPositive() && !direction) issues.push('Amount direction is missing.');
    amount = new Decimal(amountValue).abs().toString();
  } else {
    issues.push('Amount is missing or invalid.');
  }
  if (amount !== null && new Decimal(amount).isZero()) {
    amount = null;
    issues.push('Amount must be greater than zero.');
  }
  if (!direction && !issues.some((issue) => issue.includes('direction') || issue.includes('Debit/credit'))) {
    issues.push('Transaction direction is missing or invalid.');
  }

  const rawCounterparty = cell(record, columns.counterparty) ?? extractCounterparty(rawDescription);
  const rawReference = cell(record, columns.referenceNumber);
  const normalized: NormalizedStatementRow = {
    rowNumber,
    date: dateResult.date,
    time: dateResult.time,
    amount,
    direction,
    description: rawDescription?.slice(0, 500) ?? null,
    counterparty: rawCounterparty?.slice(0, 120) ?? null,
    referenceNumber: rawReference?.slice(0, 120) ?? null,
    provenance: {
      date: rawDate ? provenance(columns.date, dateResult.confidence) : null,
      time: rawDate && dateResult.time ? provenance(columns.date, dateResult.confidence) : null,
      amount: amount !== null ? provenance(columns.debit ?? columns.credit ?? columns.amount, 1) : null,
      direction: direction
        ? provenance(columns.debit ?? columns.credit ?? columns.direction ?? (amountValue !== null ? columns.amount : undefined), 1)
        : null,
      description: rawDescription ? provenance(columns.description, 1) : null,
      counterparty: rawCounterparty
        ? columns.counterparty
          ? provenance(columns.counterparty, 1)
          : provenance(columns.description, 0.75)
        : null,
      referenceNumber: rawReference ? provenance(columns.referenceNumber, 1) : null,
    },
    issues,
  };
  const raw: RawStatementRow = { rowNumber, rawText: record.rawText };
  return { raw, normalized };
}

export class CSVParser implements IParser {
  readonly format = 'csv' as const;
  readonly version = PARSER_VERSION;

  parse(input: Buffer | string): ParsedStatementRow[] {
    const contents = typeof input === 'string'
      ? input
      : new TextDecoder('utf-8', { fatal: true }).decode(input);
    const records = splitCsv(contents);
    if (records.length < 2) throw new Error('CSV must contain a header and at least one data row.');
    if (records.length > 10_001) throw new Error('CSV exceeds the 10,000 row limit.');
    const headers = records[0].values;
    const columns = {
      date: findColumn(headers, HEADER_ALIASES.date),
      amount: findColumn(headers, HEADER_ALIASES.amount),
      debit: findColumn(headers, HEADER_ALIASES.debit),
      credit: findColumn(headers, HEADER_ALIASES.credit),
      direction: findColumn(headers, HEADER_ALIASES.direction),
      description: findColumn(headers, HEADER_ALIASES.description),
      counterparty: findColumn(headers, HEADER_ALIASES.counterparty),
      referenceNumber: findColumn(headers, HEADER_ALIASES.referenceNumber),
    };

    if (!columns.date || !columns.description) {
      throw new Error('CSV requires Date and Description/Narration columns.');
    }
    if ((!columns.debit && !columns.credit) && (!columns.amount || !columns.direction)) {
      throw new Error('CSV requires Debit/Credit columns or Amount and Type columns.');
    }

    return records.slice(1).map((record, index) =>
      parseRecord(record, index + 2, columns, headers.length),
    );
  }
}
