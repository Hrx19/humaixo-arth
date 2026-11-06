import DecimalJS from 'decimal.js';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FinanceScreen } from '@/components/finance-screen';
import {
  ToolBadge,
  ToolButton,
  ToolCard,
  ToolEmptyState,
  ToolError,
  ToolField,
  ToolLoading,
  ToolSectionTitle,
} from '@/components/money-tools-ui';
import { formatINR, formatShortDate, useFinanceColors } from '@/constants/finance-theme';
import { useAuth } from '@/auth/auth-context';
import {
  MoneyToolsService,
  type Loan,
  type LoanPerson,
} from '@/services/money-tools-service';
import { TransactionIntelligenceService } from '@/services/transaction-intelligence-service';

function isValidAmount(value: string): boolean {
  return /^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/.test(value) && new DecimalJS(value).isPositive();
}

function totalOutstanding(loans: Loan[], direction: Loan['direction']): string {
  return loans
    .filter((loan) => loan.direction === direction)
    .reduce((total, loan) => total.plus(loan.outstandingPrincipal), new DecimalJS(0))
    .toString();
}

export default function LoansScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { token, status } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [direction, setDirection] = useState<Loan['direction']>('lent');
  const [personId, setPersonId] = useState('');
  const [principal, setPrincipal] = useState('');
  const [repaymentLoan, setRepaymentLoan] = useState<Loan | null>(null);
  const [transactionId, setTransactionId] = useState('');
  const [repaymentNote, setRepaymentNote] = useState('');
  const [actionError, setActionError] = useState('');

  const loansQuery = useQuery({
    queryKey: ['money-tools', 'loans', token],
    queryFn: () => MoneyToolsService.getLoans(token!),
    enabled: Boolean(token && status === 'authenticated'),
  });
  const peopleQuery = useQuery({
    queryKey: ['money-tools', 'loan-people', token],
    queryFn: () => MoneyToolsService.getLoanPeople(token!),
    enabled: Boolean(token && status === 'authenticated' && formOpen),
  });
  const expectedTransactionType = repaymentLoan?.direction === 'lent' ? 'credit' : 'debit';
  const repaymentTransactionsQuery = useQuery({
    queryKey: ['money-tools', 'repayment-transactions', token, expectedTransactionType],
    queryFn: () => TransactionIntelligenceService.list(token!, {
      page: 1,
      limit: 100,
      sort: 'newest',
      type: expectedTransactionType,
    }),
    enabled: Boolean(token && repaymentLoan),
  });

  const refreshLoans = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['money-tools', 'loans', token] }),
      queryClient.invalidateQueries({ queryKey: ['transaction-intelligence'] }),
    ]);
  };
  const createMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Sign in to record a loan.');
      if (!personId) throw new Error('Choose a person.');
      if (!isValidAmount(principal)) throw new Error('Enter a positive amount with up to two decimal places.');
      return MoneyToolsService.createLoan(token, {
        personId,
        direction,
        principal,
        startDate: new Date().toISOString(),
      });
    },
    onSuccess: async () => {
      setFormOpen(false);
      setPrincipal('');
      setPersonId('');
      setActionError('');
      await refreshLoans();
    },
    onError: (error: Error) => setActionError(error.message),
  });
  const repaymentMutation = useMutation({
    mutationFn: () => {
      if (!token || !repaymentLoan) throw new Error('Select a loan before recording a repayment.');
      if (!transactionId) throw new Error('Choose the transaction that represents this repayment.');
      return MoneyToolsService.recordLoanRepayment(token, {
        loanId: repaymentLoan.id,
        transactionId,
        ...(repaymentNote.trim() ? { note: repaymentNote.trim() } : {}),
      });
    },
    onSuccess: async () => {
      setRepaymentLoan(null);
      setTransactionId('');
      setRepaymentNote('');
      setActionError('');
      await refreshLoans();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  if (status === 'loading') {
    return <FinanceScreen title="Loans & lending" activeTab="tools"><ToolLoading /></FinanceScreen>;
  }
  if (!token) {
    return (
      <FinanceScreen title="Loans & lending" subtitle="Keep personal lending and borrowing in one clear view." activeTab="tools">
        <ToolEmptyState title="Sign in to manage loans" description="Your loan balances and repayment history are linked to your private account." action={<ToolButton label="Sign in" onPress={() => router.push('/login')} />} />
      </FinanceScreen>
    );
  }

  const loans = loansQuery.data ?? [];
  const people: LoanPerson[] = peopleQuery.data ?? [];
  const transactions = (repaymentTransactionsQuery.data?.data ?? []).filter((transaction) => (
    !transaction.isInternalTransfer
    && !transaction.isLoanRepayment
    && new DecimalJS(transaction.amount).lte(repaymentLoan?.outstandingPrincipal ?? '0')
  ));
  const lentTotal = totalOutstanding(loans, 'lent');
  const borrowedTotal = totalOutstanding(loans, 'borrowed');

  return (
    <FinanceScreen title="Loans & lending" subtitle="Track what you’ve lent and what you owe, with transaction-linked repayments." activeTab="tools">
      {loansQuery.isLoading ? <ToolLoading /> : null}
      {loansQuery.isError ? <ToolError message={loansQuery.error.message} onRetry={() => void loansQuery.refetch()} /> : null}
      {actionError ? <ToolError message={actionError} onRetry={() => setActionError('')} actionLabel="Dismiss" /> : null}
      {loansQuery.isSuccess ? (
        <View style={styles.summaryRow}>
          <BalanceSummary title="Money lent" value={lentTotal} caption="Outstanding to you" tone="green" />
          <BalanceSummary title="Money borrowed" value={borrowedTotal} caption="Outstanding from you" tone="amber" />
        </View>
      ) : null}
      <ToolButton label={formOpen ? 'Close loan form' : '+ Record a loan'} onPress={() => setFormOpen((open) => !open)} />
      {formOpen ? (
        <ToolCard style={styles.formCard}>
          <ToolSectionTitle>Record a loan</ToolSectionTitle>
          {peopleQuery.isLoading ? <ToolLoading /> : null}
          {peopleQuery.isError ? <ToolError message={peopleQuery.error.message} onRetry={() => void peopleQuery.refetch()} /> : null}
          {!peopleQuery.isLoading && !peopleQuery.isError && people.length === 0 ? (
            <ToolEmptyState title="Add a person first" description="Loans are associated with someone in your People list." action={<ToolButton label="Open People" onPress={() => router.push('/people')} secondary />} />
          ) : null}
          {people.length > 0 ? (
            <>
              <Text style={[styles.formLabel, { color: colors.muted }]}>DIRECTION</Text>
              <View style={styles.choiceRow}>
                {(['lent', 'borrowed'] as const).map((value) => (
                  <ChoiceChip key={value} label={value === 'lent' ? 'I lent' : 'I borrowed'} selected={direction === value} onPress={() => setDirection(value)} />
                ))}
              </View>
              <Text style={[styles.formLabel, { color: colors.muted }]}>PERSON</Text>
              <View style={styles.choiceRow}>
                {people.map((person) => (
                  <ChoiceChip key={person.id} label={person.name} selected={personId === person.id} onPress={() => setPersonId(person.id)} />
                ))}
              </View>
              <ToolField
                label="PRINCIPAL · INR"
                value={principal}
                onChangeText={(value) => {
                  if (value === '' || /^(?:0|[1-9]\d{0,14})(?:\.\d{0,2})?$/.test(value)) setPrincipal(value);
                }}
                placeholder="e.g. 10000"
                keyboardType="decimal-pad"
                maxLength={18}
                accessibilityLabel="Loan principal in rupees"
              />
              <ToolButton label="Save loan" onPress={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!personId || !principal} />
            </>
          ) : null}
        </ToolCard>
      ) : null}
      {!loansQuery.isLoading && !loansQuery.isError && loans.length === 0 && !formOpen ? (
        <ToolEmptyState title="No loans recorded yet" description="Add money you’ve lent or borrowed to keep the outstanding amount easy to track." action={<ToolButton label="Record your first loan" onPress={() => setFormOpen(true)} />} />
      ) : null}

      {loans.length > 0 ? (
        <>
          <ToolSectionTitle>Money lent · Assets</ToolSectionTitle>
          {loans.filter((loan) => loan.direction === 'lent').length === 0
            ? <Text style={[styles.sectionEmpty, { color: colors.muted }]}>No money lent is recorded.</Text>
            : loans.filter((loan) => loan.direction === 'lent').map((loan) => (
              <LoanCard key={loan.id} loan={loan} onRepay={() => {
                setActionError('');
                setTransactionId('');
                setRepaymentLoan(loan);
              }} />
            ))}
          <ToolSectionTitle>Money borrowed · Liabilities</ToolSectionTitle>
          {loans.filter((loan) => loan.direction === 'borrowed').length === 0
            ? <Text style={[styles.sectionEmpty, { color: colors.muted }]}>No money borrowed is recorded.</Text>
            : loans.filter((loan) => loan.direction === 'borrowed').map((loan) => (
              <LoanCard key={loan.id} loan={loan} onRepay={() => {
                setActionError('');
                setTransactionId('');
                setRepaymentLoan(loan);
              }} />
            ))}
        </>
      ) : null}

      {repaymentLoan ? (
        <ToolCard style={styles.repaymentCard}>
          <View style={styles.repaymentHeading}>
            <ToolSectionTitle>Record repayment</ToolSectionTitle>
            <TouchableOpacity onPress={() => setRepaymentLoan(null)} accessibilityRole="button">
              <Text style={[styles.closeText, { color: colors.primarySoft }]}>Close</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.repaymentDescription, { color: colors.muted }]}>
            Select an unclassified {expectedTransactionType} transaction for {repaymentLoan.personName ?? 'this person'}. The recorded amount is taken from that transaction.
          </Text>
          {repaymentTransactionsQuery.isLoading ? <ToolLoading /> : null}
          {repaymentTransactionsQuery.isError ? <ToolError message={repaymentTransactionsQuery.error.message} onRetry={() => void repaymentTransactionsQuery.refetch()} /> : null}
          {!repaymentTransactionsQuery.isLoading && !repaymentTransactionsQuery.isError && transactions.length === 0 ? (
            <Text style={[styles.sectionEmpty, { color: colors.muted }]}>No eligible transactions up to {formatINR(repaymentLoan.outstandingPrincipal)} were found. Add or import a matching transaction first.</Text>
          ) : null}
          {transactions.map((transaction) => {
            const selected = transaction.id === transactionId;
            return (
              <TouchableOpacity
                key={transaction.id}
                onPress={() => setTransactionId(transaction.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[
                  styles.transactionChoice,
                  { backgroundColor: selected ? `${colors.primary}18` : colors.surfaceRaised, borderColor: selected ? colors.primary : colors.border },
                ]}
              >
                <View style={styles.transactionCopy}>
                  <Text style={[styles.transactionTitle, { color: colors.text }]} numberOfLines={1}>{transaction.counterparty || transaction.merchant}</Text>
                  <Text style={[styles.transactionMeta, { color: colors.muted }]}>{formatShortDate(transaction.date)} · {transaction.category}</Text>
                </View>
                <Text style={[styles.transactionAmount, { color: colors.text }]}>{formatINR(transaction.amount)}</Text>
              </TouchableOpacity>
            );
          })}
          <ToolField
            label="NOTE · OPTIONAL"
            value={repaymentNote}
            onChangeText={setRepaymentNote}
            placeholder="Add a note"
            maxLength={500}
            accessibilityLabel="Optional repayment note"
          />
          <ToolButton label="Record this repayment" onPress={() => repaymentMutation.mutate()} loading={repaymentMutation.isPending} disabled={!transactionId} />
        </ToolCard>
      ) : null}
    </FinanceScreen>
  );
}

function BalanceSummary({
  title,
  value,
  caption,
  tone,
}: {
  title: string;
  value: string;
  caption: string;
  tone: 'green' | 'amber';
}): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <ToolCard style={styles.summaryCard}>
      <Text style={[styles.summaryTitle, { color: colors.muted }]}>{title}</Text>
      <Text style={[styles.summaryValue, { color: tone === 'green' ? colors.green : colors.amber }]} numberOfLines={1} adjustsFontSizeToFit>{formatINR(value)}</Text>
      <Text style={[styles.summaryCaption, { color: colors.subtle }]}>{caption}</Text>
    </ToolCard>
  );
}

function LoanCard({ loan, onRepay }: { loan: Loan; onRepay: () => void }): React.JSX.Element {
  const colors = useFinanceColors();
  const isClosed = loan.status === 'closed' || new DecimalJS(loan.outstandingPrincipal).isZero();
  return (
    <ToolCard style={styles.loanCard}>
      <View style={styles.loanHeading}>
        <View style={styles.loanCopy}>
          <Text style={[styles.personName, { color: colors.text }]} numberOfLines={1}>{loan.personName ?? 'Unknown person'}</Text>
          <Text style={[styles.loanMeta, { color: colors.muted }]}>Started {formatShortDate(loan.startDate)}{loan.interestRate ? ` · ${loan.interestRate}% interest` : ''}</Text>
        </View>
        <ToolBadge label={isClosed ? 'Settled' : 'Active'} tone={isClosed ? 'muted' : loan.direction === 'lent' ? 'green' : 'amber'} />
      </View>
      <View style={styles.loanAmounts}>
        <AmountLabel label="Principal" value={loan.principal} />
        <AmountLabel label="Remaining" value={loan.outstandingPrincipal} emphasized />
      </View>
      {!isClosed ? <ToolButton label="Record repayment" onPress={onRepay} secondary /> : null}
    </ToolCard>
  );
}

function AmountLabel({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <View style={styles.amountLabel}>
      <Text style={[styles.amountCaption, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.amountValue, { color: emphasized ? colors.text : colors.muted }]}>{formatINR(value)}</Text>
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.choiceChip, { backgroundColor: selected ? `${colors.primary}18` : colors.surfaceRaised, borderColor: selected ? colors.primary : colors.border }]}
    >
      <Text style={[styles.choiceText, { color: selected ? colors.primarySoft : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, minWidth: 0, padding: 13, gap: 7 },
  summaryTitle: { fontSize: 11, fontWeight: '700' },
  summaryValue: { fontSize: 18, fontWeight: '900' },
  summaryCaption: { fontSize: 10 },
  formCard: { gap: 12 },
  formLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: { maxWidth: '100%', borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 9 },
  choiceText: { fontSize: 12, fontWeight: '700' },
  sectionEmpty: { fontSize: 12, lineHeight: 18 },
  loanCard: { gap: 13 },
  loanHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 9 },
  loanCopy: { flex: 1, minWidth: 0, gap: 4 },
  personName: { fontSize: 15, fontWeight: '800' },
  loanMeta: { fontSize: 11 },
  loanAmounts: { flexDirection: 'row', gap: 16 },
  amountLabel: { flex: 1, gap: 5 },
  amountCaption: { fontSize: 10, fontWeight: '700' },
  amountValue: { fontSize: 14, fontWeight: '800' },
  repaymentCard: { gap: 12, borderColor: '#6844df' },
  repaymentHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  closeText: { fontSize: 12, fontWeight: '800' },
  repaymentDescription: { fontSize: 12, lineHeight: 18 },
  transactionChoice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 12, padding: 11 },
  transactionCopy: { flex: 1, minWidth: 0, gap: 4 },
  transactionTitle: { fontSize: 12, fontWeight: '800' },
  transactionMeta: { fontSize: 10 },
  transactionAmount: { fontSize: 12, fontWeight: '800' },
});
