export type AccountType =
  | 'bank'
  | 'savings'
  | 'current'
  | 'credit_card'
  | 'wallet'
  | 'cash'
  | 'investment';

export type TransactionType = 'credit' | 'debit';
export type TransactionSource = 'manual' | 'sms' | 'statement';

export type FinanceAccount = {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  accountSuffix: string;
  currency: string;
  openingBalance: number;
  openingBalanceDate: string;
  balance: number;
  color: string;
  createdAt: string;
};

export type FinanceTransaction = {
  id: string;
  accountId: string | null;
  merchant: string;
  amount: number;
  type: TransactionType;
  category: string;
  counterparty: string | null;
  counterpartyKey: string | null;
  counterpartyType: 'person' | 'merchant' | 'other' | null;
  paymentMethod: string | null;
  date: string;
  balanceBefore: number | null;
  balanceAfter: number | null;
  referenceNumber: string | null;
  note: string | null;
  source: TransactionSource;
  confidence: number;
  description: string | null;
};

export type IncomeExpense = {
  income: number;
  expense: number;
};

export type MonthlyTotal = IncomeExpense & {
  year: number;
  month: number;
};

export type CategoryTotal = {
  category: string;
  amount: number;
  count: number;
};

export type FinanceAnalytics = {
  byCategory: CategoryTotal[];
  monthlyTotals: MonthlyTotal[];
  totals: IncomeExpense & { net: number };
  today: IncomeExpense;
  thisWeek: IncomeExpense;
  thisMonth: MonthlyTotal;
  trackedBalance: number;
  accounts: Pick<FinanceAccount, 'id' | 'name' | 'institution' | 'type' | 'accountSuffix' | 'currency' | 'balance' | 'color'>[];
  period: { from: string; to: string };
};

export type PersonSummary = {
  key: string;
  name: string;
  sent: number;
  received: number;
  net: number;
  transactionCount: number;
  lastDate: string | null;
};

export type MerchantSummary = {
  name: string;
  spent: number;
  received: number;
  transactionCount: number;
  lastDate: string | null;
  categories: string[];
};

export type PersonDetails = {
  person: PersonSummary;
  transactions: FinanceTransaction[];
};

export type BalanceHistoryPoint = {
  date: string;
  balance: number;
};

export type StatementPreview = {
  fileName: string;
  account: { id: string; name: string; institution: string };
  totalRows: number;
  validRows: number;
  newRows: number;
  duplicateRows: number;
  rejectedRows: number;
  rowsWithBalance: number;
  personTransfers: number;
  period: { from: string | null; to: string | null };
  sample: {
    date: string;
    amount: number;
    type: TransactionType;
    merchant: string;
    counterparty: string | null;
    category: string;
    paymentMethod: string | null;
    balanceBefore: number | null;
    balanceAfter: number | null;
    referenceNumber: string | null;
  }[];
  issues: { row: number; message: string }[];
  alreadyImported: boolean;
};

export type StatementImportResult = {
  success: true;
  statementId: string;
  fileName: string;
  account: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  rejectedRows: number;
  period: { from: string | null; to: string | null };
};

export type StatementImportHistoryItem = {
  id: string;
  accountId: string;
  fileName: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  rejectedRows: number;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
};

export type CreateAccountInput = {
  name: string;
  institution: string;
  type: AccountType;
  accountSuffix?: string;
  currency?: string;
  openingBalance: number;
  openingBalanceDate: string;
  color?: string;
};

export type CreateTransactionInput = {
  accountId?: string;
  merchant: string;
  amount: number;
  type: TransactionType;
  category: string;
  counterparty?: string;
  counterpartyType?: 'person' | 'merchant' | 'other';
  paymentMethod?: string;
  date?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  referenceNumber?: string;
  note?: string;
  description?: string;
};
