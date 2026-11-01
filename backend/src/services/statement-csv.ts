import { createHash } from 'node:crypto';
import type { TransactionType } from '../../models/Transaction';

export type StatementCandidate = {
  amount: number;
  type: TransactionType;
  date: Date;
  merchant: string;
  category: string;
  counterparty?: string;
  counterpartyKey?: string;
  counterpartyType?: 'person' | 'merchant' | 'other';
  paymentMethod?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  referenceNumber?: string;
  description: string;
  dedupeKey: string;
};

export type StatementRowIssue = {
  row: number;
  message: string;
};

export type StatementParseResult = {
  totalRows: number;
  rows: StatementCandidate[];
  issues: StatementRowIssue[];
  periodStart?: Date;
  periodEnd?: Date;
};

type ColumnMap = {
  date: number;
  description: number;
  debit?: number;
  credit?: number;
  amount?: number;
  direction?: number;
  balance?: number;
  counterparty?: number;
  reference?: number;
  category?: number;
};

const HEADER_ALIASES = {
  date: ['date', 'txndate', 'transactiondate', 'transactiondatetime', 'postingdate'],
  description: ['description', 'narration', 'particulars', 'transactiondetails', 'details', 'remarks'],
  debit: ['debit', 'debitamount', 'withdrawal', 'withdrawalamount', 'withdrawn', 'paidout'],
  credit: ['credit', 'creditamount', 'deposit', 'depositamount', 'paidin', 'received'],
  amount: ['amount', 'transactionamount', 'txnamount'],
  direction: ['type', 'transactiontype', 'drcr', 'direction', 'debitcredit'],
  balance: ['balance', 'closingbalance', 'availablebalance', 'runningbalance'],
  counterparty: ['counterparty', 'recipient', 'payee', 'beneficiary', 'receiver'],
  reference: ['reference', 'referencenumber', 'referenceno', 'refno', 'utr', 'rrn', 'transactionid', 'chequeno'],
  category: ['category', 'subcategory'],
} as const;

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += character;
  }

  if (inQuotes) throw new Error('The CSV contains an unfinished quoted value.');
  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findColumn(headers: string[], aliases: readonly string[]): number | undefined {
  const normalized = headers.map(normalizeHeader);
  const index = normalized.findIndex((header) => aliases.includes(header as never));
  return index >= 0 ? index : undefined;
}

function getColumnMap(headers: string[]): ColumnMap {
  const date = findColumn(headers, HEADER_ALIASES.date);
  const description = findColumn(headers, HEADER_ALIASES.description);
  const debit = findColumn(headers, HEADER_ALIASES.debit);
  const credit = findColumn(headers, HEADER_ALIASES.credit);
  const amount = findColumn(headers, HEADER_ALIASES.amount);
  const direction = findColumn(headers, HEADER_ALIASES.direction);

  if (date === undefined || description === undefined) {
    throw new Error('CSV needs Date and Description/Narration columns.');
  }
  if (debit === undefined && credit === undefined && (amount === undefined || direction === undefined)) {
    throw new Error('CSV needs Debit/Credit columns or an Amount column with a Type column.');
  }

  return {
    date,
    description,
    debit,
    credit,
    amount,
    direction,
    balance: findColumn(headers, HEADER_ALIASES.balance),
    counterparty: findColumn(headers, HEADER_ALIASES.counterparty),
    reference: findColumn(headers, HEADER_ALIASES.reference),
    category: findColumn(headers, HEADER_ALIASES.category),
  };
}

function readCell(row: string[], index?: number): string {
  return index === undefined ? '' : (row[index] ?? '').trim();
}

function parseDate(value: string): Date {
  const indianDate = value.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (indianDate) {
    const [, dayText, monthText, yearText, hourText = '0', minuteText = '0', secondText = '0'] = indianDate;
    const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
    const date = new Date(
      year,
      Number(monthText) - 1,
      Number(dayText),
      Number(hourText),
      Number(minuteText),
      Number(secondText),
    );
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== Number(monthText) - 1 ||
      date.getDate() !== Number(dayText)
    ) {
      throw new Error('Date is not valid.');
    }
    return date;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Date is not valid.');
  return parsed;
}

function parseMoney(value: string): number | undefined {
  const cleaned = value
    .replace(/[₹$€£]/g, '')
    .replace(/\b(?:INR|Rs\.?|DR|CR)\b/gi, '')
    .replace(/,/g, '')
    .trim();
  if (!cleaned) return undefined;

  const parenthesized = cleaned.startsWith('(') && cleaned.endsWith(')');
  const normalized = cleaned.replace(/[()\s]/g, '');
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) throw new Error('Amount is not numeric.');
  return parenthesized ? -Math.abs(amount) : amount;
}

function parseDirection(value: string): TransactionType | undefined {
  const normalized = value.trim().toLowerCase();
  if (/^(debit|dr|withdrawal|withdraw|paid out|outgoing)$/.test(normalized)) return 'debit';
  if (/^(credit|cr|deposit|received|paid in|incoming)$/.test(normalized)) return 'credit';
  return undefined;
}

function normalizeCounterparty(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-IN')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function guessCounterparty(description: string, explicitValue: string): string | undefined {
  if (explicitValue.trim()) return explicitValue.trim().slice(0, 120);

  const phraseMatch = description.match(
    /(?:sent to|paid to|transfer to|received from|from)\s+([\p{L}\p{N}][\p{L}\p{N} .'-]{1,70})/iu,
  );
  if (phraseMatch?.[1]) return phraseMatch[1].replace(/[.,;:]+$/, '').trim().slice(0, 120);

  if (!/(?:\bUPI\b|\bIMPS\b|\bNEFT\b|\bRTGS\b|\bP2P\b)/i.test(description)) {
    return undefined;
  }

  const ignoredTokens = new Set([
    'upi', 'imps', 'neft', 'rtgs', 'p2p', 'p2a', 'p2m', 'dr', 'cr', 'payment',
    'transfer', 'mobile', 'bank', 'ref', 'debit', 'credit', 'paid', 'received',
  ]);
  const segments = description.split(/[\/-]/g).map((segment) => segment.trim());
  const candidate = segments.find((segment) => {
    const key = normalizeCounterparty(segment);
    return (
      key.length >= 3 &&
      /\p{L}/u.test(key) &&
      !/^\d+$/.test(key) &&
      !ignoredTokens.has(key)
    );
  });

  return candidate?.slice(0, 120);
}

function guessCategory(description: string, explicitCategory: string, isPersonTransfer: boolean): string {
  if (explicitCategory.trim()) return explicitCategory.trim().slice(0, 60);
  if (isPersonTransfer) return 'Transfer';

  const text = description.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/swiggy|zomato|restaurant|cafe|food|dominos|pizza|blinkit|zepto|bigbasket/, 'Food'],
    [/amazon|flipkart|myntra|shopping|retail/, 'Shopping'],
    [/uber|ola|rapido|irctc|flight|airline|metro|fuel|petrol|indian oil/, 'Travel'],
    [/electricity|water bill|broadband|recharge|utility|gas bill/, 'Bills'],
    [/netflix|spotify|prime video|subscription|adobe/, 'Subscriptions'],
    [/hospital|pharmacy|medical|clinic|health/, 'Healthcare'],
    [/salary|payroll|interest credit|dividend/, 'Income'],
    [/refund|reversal|cashback/, 'Refund'],
    [/rent|landlord/, 'Rent'],
  ];

  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? 'Uncategorised';
}

function inferPaymentMethod(description: string): string | undefined {
  const match = description.match(/\b(UPI|IMPS|NEFT|RTGS|POS|ATM|NACH|ECS|CARD)\b/i);
  return match?.[1]?.toUpperCase();
}

function parseRow(
  row: string[],
  columns: ColumnMap,
  accountId: string,
): StatementCandidate {
  const date = parseDate(readCell(row, columns.date));
  const description = readCell(row, columns.description).slice(0, 500);
  if (!description) throw new Error('Description is missing.');

  const debitValue = parseMoney(readCell(row, columns.debit));
  const creditValue = parseMoney(readCell(row, columns.credit));
  let type: TransactionType;
  let amount: number;

  if (columns.debit !== undefined || columns.credit !== undefined) {
    const debitAmount = Math.abs(debitValue ?? 0);
    const creditAmount = Math.abs(creditValue ?? 0);
    if (debitAmount > 0 && creditAmount > 0) {
      throw new Error('Row has both a debit and credit amount.');
    }
    if (debitAmount === 0 && creditAmount === 0) {
      throw new Error('Debit/Credit amount is missing or zero.');
    }
    type = debitAmount > 0 ? 'debit' : 'credit';
    amount = debitAmount > 0 ? debitAmount : creditAmount;
  } else {
    const rawAmount = parseMoney(readCell(row, columns.amount));
    if (rawAmount === undefined || rawAmount === 0) throw new Error('Amount is missing or zero.');
    const direction = parseDirection(readCell(row, columns.direction));
    if (!direction && rawAmount > 0) throw new Error('Transaction type must be Debit or Credit.');
    type = direction ?? (rawAmount < 0 ? 'debit' : 'credit');
    amount = Math.abs(rawAmount);
  }

  const balanceAfterValue = parseMoney(readCell(row, columns.balance));
  const balanceAfter = balanceAfterValue;
  const signedAmount = type === 'credit' ? amount : -amount;
  const balanceBefore = balanceAfter === undefined ? undefined : balanceAfter - signedAmount;
  const explicitCounterparty = readCell(row, columns.counterparty);
  const counterparty = guessCounterparty(description, explicitCounterparty);
  const isTransfer = /\b(UPI|IMPS|NEFT|RTGS|P2P|TRANSFER|SENT TO|RECEIVED FROM)\b/i.test(
    description,
  );
  const counterpartyKey = counterparty ? normalizeCounterparty(counterparty) : undefined;
  const referenceNumber = readCell(row, columns.reference).slice(0, 120) || undefined;
  const category = guessCategory(
    description,
    readCell(row, columns.category),
    isTransfer,
  );
  const merchant = (counterparty ?? description).slice(0, 120);
  const counterpartyType = counterparty
    ? isTransfer
      ? 'person'
      : 'merchant'
    : undefined;
  const paymentMethod = inferPaymentMethod(description);
  const stableIdentity = [
    accountId,
    date.toISOString(),
    type,
    amount.toFixed(2),
    counterpartyKey ?? normalizeCounterparty(description),
    referenceNumber ?? '',
    balanceAfter?.toFixed(2) ?? '',
  ].join('|');
  const dedupeKey = createHash('sha256').update(stableIdentity).digest('hex');

  return {
    date,
    amount,
    type,
    description,
    merchant,
    category,
    counterparty,
    counterpartyKey,
    counterpartyType,
    paymentMethod,
    balanceBefore,
    balanceAfter,
    referenceNumber,
    dedupeKey,
  };
}

export function hashStatement(accountId: string, csvContent: string): string {
  return createHash('sha256')
    .update(accountId)
    .update('\n')
    .update(csvContent.replace(/^\uFEFF/, '').trim())
    .digest('hex');
}

export function parseStatementCsv(csvContent: string, accountId: string): StatementParseResult {
  const rawRows = splitCsv(csvContent);
  if (rawRows.length < 2) throw new Error('CSV must contain a header and at least one transaction row.');
  if (rawRows.length > 10_001) throw new Error('CSV exceeds the 10,000 transaction limit.');

  const columns = getColumnMap(rawRows[0]);
  const rows: StatementCandidate[] = [];
  const issues: StatementRowIssue[] = [];
  const seenKeys = new Set<string>();

  for (let index = 1; index < rawRows.length; index += 1) {
    try {
      const candidate = parseRow(rawRows[index], columns, accountId);
      if (seenKeys.has(candidate.dedupeKey)) {
        issues.push({ row: index + 1, message: 'Duplicate transaction within this statement.' });
        continue;
      }
      seenKeys.add(candidate.dedupeKey);
      rows.push(candidate);
    } catch (error) {
      issues.push({
        row: index + 1,
        message: error instanceof Error ? error.message : 'Row could not be parsed.',
      });
    }
  }

  const dates = rows.map((row) => row.date.getTime()).sort((left, right) => left - right);
  return {
    totalRows: rawRows.length - 1,
    rows,
    issues,
    periodStart: dates.length > 0 ? new Date(dates[0]) : undefined,
    periodEnd: dates.length > 0 ? new Date(dates[dates.length - 1]) : undefined,
  };
}
