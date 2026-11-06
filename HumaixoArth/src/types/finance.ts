export type AccountType =
  | 'bank'
  | 'savings'
  | 'current'
  | 'credit_card'
  | 'wallet'
  | 'cash'
  | 'investment';

export type AccountSource = 'user_entered' | 'statement_reported';

export type TransactionType = 'credit' | 'debit';
export type TransactionSource = 'manual' | 'sms' | 'statement';

export type FinanceAccount = {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  accountSuffix: string;
  currency: string;
  openingBalance: string;
  openingBalanceDate: string;
  balance: string;
  color: string;
  source: AccountSource;
  createdAt: string;
};

export type FinanceTransaction = {
  id: string;
  accountId: string | null;
  merchant: string;
  amount: string;
  type: TransactionType;
  category: string;
  counterparty: string | null;
  counterpartyKey: string | null;
  counterpartyType: 'person' | 'merchant' | 'other' | null;
  paymentMethod: string | null;
  date: string;
  balanceBefore: string | null;
  balanceAfter: string | null;
  referenceNumber: string | null;
  note: string | null;
  source: TransactionSource;
  confidence: number;
  description: string | null;
};

export type IncomeExpense = {
  income: string;
  expense: string;
};

export type MonthlyTotal = IncomeExpense & {
  year: number;
  month: number;
};

export type BudgetSummary = {
  amount: string | null;
  month: number;
  year: number;
  spent: string;
  progress: string;
  status: 'safe' | 'warning' | 'exceeded' | 'not_set';
};

export type CategoryTotal = {
  category: string;
  amount: string;
  count: number;
};

export type FinanceAnalytics = {
  byCategory: CategoryTotal[];
  monthlyTotals: MonthlyTotal[];
  totals: IncomeExpense & { net: string };
  today: IncomeExpense;
  thisWeek: IncomeExpense;
  thisMonth: MonthlyTotal;
  budgetStatus: BudgetSummary['status'];
  budget: BudgetSummary;
  trackedBalance: string;
  accounts: Pick<FinanceAccount, 'id' | 'name' | 'institution' | 'type' | 'accountSuffix' | 'currency' | 'balance' | 'color'>[];
  period: { from: string; to: string };
};

export type PersonSummary = {
  key: string;
  name: string;
  sent: string;
  received: string;
  net: string;
  transactionCount: number;
  lastDate: string | null;
};

export type MerchantSummary = {
  name: string;
  spent: string;
  received: string;
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
  balance: string;
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
    amount: string;
    type: TransactionType;
    merchant: string;
    counterparty: string | null;
    category: string;
    paymentMethod: string | null;
    balanceBefore: string | null;
    balanceAfter: string | null;
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
  openingBalance: string;
  openingBalanceDate: string;
  color?: string;
};

export type CreateTransactionInput = {
  accountId?: string;
  merchant: string;
  amount: string;
  type: TransactionType;
  category: string;
  counterparty?: string;
  counterpartyType?: 'person' | 'merchant' | 'other';
  paymentMethod?: string;
  date?: string;
  balanceBefore?: string;
  balanceAfter?: string;
  referenceNumber?: string;
  note?: string;
  description?: string;
};
