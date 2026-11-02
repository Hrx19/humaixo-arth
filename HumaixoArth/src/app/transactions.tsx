import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { EmptyState, PrimaryButton, SectionHeader, SurfaceCard, TransactionRow } from '@/components/finance-ui';
import { FinanceTheme, formatDate } from '@/constants/finance-theme';
import { FinanceService } from '@/services/finance-service';
import { useFinanceStore } from '@/store/finance-store';
import type { FinanceTransaction, TransactionType } from '@/types/finance';

type ActivityFilter = 'all' | TransactionType;
const EMPTY_TRANSACTIONS: FinanceTransaction[] = [];

export default function TransactionsScreen(): React.JSX.Element {
  const router = useRouter();
  const { status, token } = useAuth();
  const accounts = useFinanceStore((state) => state.accounts);
  const isGuest = status !== 'authenticated' || !token;
  const [transactionSnapshot, setTransactionSnapshot] = useState<{
    token: string | null;
    transactions: FinanceTransaction[];
  }>({ token: null, transactions: [] });
  const transactions = transactionSnapshot.token === token ? transactionSnapshot.transactions : EMPTY_TRANSACTIONS;
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteTransaction = async (transaction: FinanceTransaction): Promise<void> => {
    if (!token) return;
    try {
      await FinanceService.deleteTransaction(token, transaction.id);
      setTransactionSnapshot((current) => ({
        ...current,
        transactions: current.transactions.filter((item) => item.id !== transaction.id),
      }));
      await useFinanceStore.getState().refreshDashboard(token);
    } catch (deleteError) {
      Alert.alert(
        'Could not delete transaction',
        deleteError instanceof Error ? deleteError.message : 'Please try again.',
      );
    }
  };

  const confirmDelete = (transaction: FinanceTransaction): void => {
    const message = `Delete ${transaction.merchant} (${formatDate(transaction.date)})?`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) {
        void deleteTransaction(transaction);
      }
      return;
    }

    Alert.alert('Delete transaction?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteTransaction(transaction) },
    ]);
  };

  useEffect(() => {
    if (isGuest || !token) return;

    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      void FinanceService.getTransactions(token, {
        page: 1,
        limit: 100,
        type: filter === 'all' ? undefined : filter,
        category: category === 'All' ? undefined : category,
        search: search.trim() || undefined,
      })
        .then((result) => {
          if (!active) return;
          setTransactionSnapshot({ token, transactions: result });
          setCurrentPage(1);
          setHasMore(result.length === 100);
        })
        .catch((requestError: unknown) => {
          if (active) setError(requestError instanceof Error ? requestError.message : 'Could not load transactions.');
        })
        .finally(() => { if (active) setLoading(false); });
    }, search.trim() ? 280 : 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [category, filter, isGuest, search, token]);

  const loadMore = async (): Promise<void> => {
    if (!token || loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const result = await FinanceService.getTransactions(token, {
        page: nextPage,
        limit: 100,
        type: filter === 'all' ? undefined : filter,
        category: category === 'All' ? undefined : category,
        search: search.trim() || undefined,
      });
      setTransactionSnapshot((current) => ({
        ...current,
        transactions: [...current.transactions, ...result],
      }));
      setCurrentPage(nextPage);
      setHasMore(result.length === 100);
    } catch (requestError) {
      Alert.alert(
        'Could not load more transactions',
        requestError instanceof Error ? requestError.message : 'Please try again.',
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const categories = useMemo(() => {
    const names = new Set(transactions.map((transaction) => transaction.category));
    return ['All', ...Array.from(names).sort((left, right) => left.localeCompare(right))];
  }, [transactions]);

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, FinanceTransaction[]>();
    for (const transaction of transactions) {
      const label = formatDate(transaction.date);
      const group = groups.get(label) ?? [];
      group.push(transaction);
      groups.set(label, group);
    }
    return Array.from(groups.entries());
  }, [transactions]);

  return (
    <FinanceScreen
      title="Transactions"
      subtitle="Every inflow and outflow, with the account and balance context attached."
      activeTab="transactions"
      rightAction={(
        <TouchableOpacity onPress={() => router.push('/add-transaction')} style={styles.addButton} accessibilityRole="button">
          <Text style={styles.addButtonText}>＋ Add</Text>
        </TouchableOpacity>
      )}
    >
      {isGuest ? (
        <EmptyState
          title="Your statement timeline lives here"
          description="Sign in to view transaction dates, payees, references, and account balances."
          action={<PrimaryButton label="Login to view activity" onPress={() => router.push('/login')} />}
        />
      ) : (
        <>
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>LATEST TRANSACTIONS</Text>
            <Text style={styles.summaryValue}>{transactions.length}</Text>
            <Text style={styles.summaryHint}>Showing the latest matching records</Text>
          </SurfaceCard>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search payee, category or reference"
            placeholderTextColor={FinanceTheme.colors.subtle}
            style={styles.searchInput}
            accessibilityLabel="Search transactions"
          />

          <View style={styles.filterRow}>
            {(['all', 'debit', 'credit'] as const).map((option) => (
              <FilterChip
                key={option}
                label={option === 'all' ? 'All activity' : option === 'debit' ? 'Money out' : 'Money in'}
                active={filter === option}
                onPress={() => setFilter(option)}
              />
            ))}
          </View>

          {categories.length > 1 ? (
            <View style={styles.categoryStrip}>
              {categories.map((name) => (
                <FilterChip key={name} label={name} active={category === name} onPress={() => setCategory(name)} />
              ))}
            </View>
          ) : null}

          <SectionHeader title="Ledger" actionLabel="＋ Add transaction" onAction={() => router.push('/add-transaction')} />
          {loading ? (
            <ActivityIndicator color={FinanceTheme.colors.primarySoft} style={styles.loader} />
          ) : error ? (
            <SurfaceCard><Text style={styles.errorText}>{error}</Text></SurfaceCard>
          ) : transactions.length === 0 ? (
            <EmptyState
              title="No matching transactions"
              description="Try another search or import a statement to populate your ledger."
              action={<PrimaryButton label="Import statement" onPress={() => router.push('/statement-import')} />}
            />
          ) : (
            groupedTransactions.map(([dateLabel, entries]) => (
              <View key={dateLabel} style={styles.dateGroup}>
                <View style={styles.dateHeading}>
                  <Text style={styles.dateLabel}>{dateLabel}</Text>
                  <Text style={styles.dayTotal}>{entries.length} item{entries.length === 1 ? '' : 's'}</Text>
                </View>
                <SurfaceCard style={styles.transactionCard}>
                  {entries.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      accountName={accounts.find((account) => account.id === transaction.accountId)?.name}
                      expanded={expandedId === transaction.id}
                      onPress={() => setExpandedId((current) => current === transaction.id ? null : transaction.id)}
                      onDelete={() => confirmDelete(transaction)}
                    />
                  ))}
                </SurfaceCard>
              </View>
            ))
          )}
          {hasMore && !loading && !error ? (
            <TouchableOpacity
              onPress={() => void loadMore()}
              disabled={loadingMore}
              style={styles.loadMoreButton}
              accessibilityRole="button"
            >
              {loadingMore
                ? <ActivityIndicator color={FinanceTheme.colors.primarySoft} />
                : <Text style={styles.loadMoreText}>Load more transactions</Text>}
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </FinanceScreen>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  addButton: { paddingHorizontal: 11, minHeight: 35, borderRadius: 11, backgroundColor: 'rgba(128,92,255,0.2)', borderWidth: 1, borderColor: 'rgba(128,92,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: FinanceTheme.colors.primarySoft, fontWeight: '800', fontSize: 10 },
  summaryCard: { padding: 15 },
  summaryLabel: { color: FinanceTheme.colors.subtle, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  summaryValue: { color: FinanceTheme.colors.text, fontSize: 25, fontWeight: '900', marginTop: 4 },
  summaryHint: { color: FinanceTheme.colors.muted, fontSize: 10, marginTop: 2 },
  searchInput: { height: 46, borderRadius: 13, borderWidth: 1, borderColor: FinanceTheme.colors.border, backgroundColor: FinanceTheme.colors.surface, paddingHorizontal: 13, color: FinanceTheme.colors.text, fontSize: 11 },
  filterRow: { flexDirection: 'row', gap: 7 },
  categoryStrip: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  filterChip: { backgroundColor: FinanceTheme.colors.surface, borderColor: FinanceTheme.colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  filterChipActive: { backgroundColor: FinanceTheme.colors.primary, borderColor: FinanceTheme.colors.primary },
  filterChipText: { color: FinanceTheme.colors.muted, fontSize: 9, fontWeight: '700' },
  filterChipTextActive: { color: '#ffffff' },
  loader: { paddingVertical: 28 },
  dateGroup: { gap: 8 },
  dateHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  dateLabel: { color: FinanceTheme.colors.muted, fontSize: 10, fontWeight: '800' },
  dayTotal: { color: FinanceTheme.colors.subtle, fontSize: 9 },
  transactionCard: { paddingHorizontal: 13, paddingVertical: 2 },
  errorText: { color: FinanceTheme.colors.red, fontSize: 11 },
  loadMoreButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: FinanceTheme.colors.border, backgroundColor: FinanceTheme.colors.surface },
  loadMoreText: { color: FinanceTheme.colors.primarySoft, fontSize: 14, fontWeight: '700' },
});
