import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FinanceScreen } from '@/components/finance-screen';
import { FinanceService } from '@/services/finance-service';
import {
  formatDecimalINR,
  TransactionIntelligenceService,
  type TransactionDirection,
  type TransactionFilters,
  type TransactionListItem,
  type TransactionSort,
} from '@/services/transaction-intelligence-service';
import { useAuth } from '@/auth/auth-context';
import { useFinanceColors } from '@/constants/finance-theme';

const PAGE_SIZE = 30;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dayBoundary(value: string, endOfDay: boolean): string | undefined {
  if (!value) return undefined;
  if (!DATE_PATTERN.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return undefined;
  return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
}

export default function TransactionsScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { token, status } = useAuth();
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState<TransactionDirection | ''>('');
  const [sort, setSort] = useState<TransactionSort>('newest');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const from = dayBoundary(fromText, false);
  const to = dayBoundary(toText, true);
  const invalidDateFilter = (fromText !== '' && !from) || (toText !== '' && !to);
  const filters = useMemo<Omit<TransactionFilters, 'page' | 'limit'>>(
    () => ({
      sort,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(accountId ? { accountId } : {}),
      ...(type ? { type } : {}),
    }),
    [accountId, from, sort, to, type],
  );
  const accountsQuery = useQuery({
    queryKey: ['transaction-intelligence', 'accounts', token],
    queryFn: () => FinanceService.getAccounts(token!),
    enabled: Boolean(token && status === 'authenticated'),
  });
  const query = useInfiniteQuery({
    queryKey: ['transaction-intelligence', 'list', token, filters, search],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => search
      ? TransactionIntelligenceService.search(token!, search, pageParam, PAGE_SIZE)
      : TransactionIntelligenceService.list(token!, { ...filters, page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.pagination.hasNextPage
      ? lastPage.pagination.page + 1
      : undefined,
    enabled: Boolean(token && status === 'authenticated' && !invalidDateFilter),
  });
  const rows = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  );

  const filterHeader = (
    <View style={styles.listHeader}>
      <TextInput
        value={searchText}
        onChangeText={setSearchText}
        maxLength={100}
        placeholder="Search descriptions, merchants, references, amounts"
        placeholderTextColor={colors.subtle}
        style={[styles.searchInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
        accessibilityLabel="Search transactions"
        returnKeyType="search"
        autoCapitalize="none"
      />
      <Text style={[styles.filterLabel, { color: colors.muted }]}>DATE RANGE · YYYY-MM-DD</Text>
      <View style={styles.dateFields}>
        <TextInput
          value={fromText}
          onChangeText={setFromText}
          placeholder="From"
          placeholderTextColor={colors.subtle}
          style={[styles.dateInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLabel="Filter from date, YYYY-MM-DD"
        />
        <TextInput
          value={toText}
          onChangeText={setToText}
          placeholder="To"
          placeholderTextColor={colors.subtle}
          style={[styles.dateInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLabel="Filter to date, YYYY-MM-DD"
        />
      </View>
      {invalidDateFilter ? <Text style={[styles.inlineError, { color: colors.red }]}>Enter dates as YYYY-MM-DD.</Text> : null}
      <Text style={[styles.filterLabel, { color: colors.muted }]}>ACCOUNT</Text>
      {accountsQuery.isError ? (
        <Text style={[styles.inlineError, { color: colors.red }]}>{accountsQuery.error.message}</Text>
      ) : (
        <View style={styles.chipRow}>
          <FilterChip label="All accounts" selected={!accountId} onPress={() => setAccountId('')} colors={colors} />
          {(accountsQuery.data ?? []).map((account) => (
            <FilterChip
              key={account.id}
              label={account.name}
              selected={accountId === account.id}
              onPress={() => setAccountId(accountId === account.id ? '' : account.id)}
              colors={colors}
            />
          ))}
        </View>
      )}
      <View style={styles.filterLine}>
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: colors.muted }]}>TYPE</Text>
          <View style={styles.chipRow}>
            <FilterChip label="All" selected={!type} onPress={() => setType('')} colors={colors} />
            <FilterChip label="Income" selected={type === 'credit'} onPress={() => setType(type === 'credit' ? '' : 'credit')} colors={colors} />
            <FilterChip label="Expense" selected={type === 'debit'} onPress={() => setType(type === 'debit' ? '' : 'debit')} colors={colors} />
          </View>
        </View>
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: colors.muted }]}>SORT</Text>
          <View style={styles.chipRow}>
            <FilterChip label="Newest" selected={sort === 'newest'} onPress={() => setSort('newest')} colors={colors} />
            <FilterChip label="Oldest" selected={sort === 'oldest'} onPress={() => setSort('oldest')} colors={colors} />
            <FilterChip label="Largest" selected={sort === 'highest_amount'} onPress={() => setSort('highest_amount')} colors={colors} />
          </View>
        </View>
      </View>
      <View style={styles.resultsHeading}>
        <Text style={[styles.resultsTitle, { color: colors.text }]}>Transactions</Text>
        {query.data?.pages[0] ? (
          <Text style={[styles.resultsCount, { color: colors.muted }]}>{query.data.pages[0].pagination.total} total</Text>
        ) : null}
      </View>
    </View>
  );

  if (status === 'loading') {
    return <FinanceScreen title="Activity" activeTab="transactions"><ActivityIndicator color={colors.primarySoft} /></FinanceScreen>;
  }
  if (!token) {
    return (
      <FinanceScreen title="Activity" subtitle="Sign in to search and review your private transaction history." activeTab="transactions">
        <TouchableOpacity onPress={() => router.push('/login')} style={[styles.emptyAction, { backgroundColor: colors.primary }]}>
          <Text style={styles.emptyActionText}>Sign in</Text>
        </TouchableOpacity>
      </FinanceScreen>
    );
  }

  return (
    <FinanceScreen title="Activity" subtitle="Your transaction history, searchable and filterable." activeTab="transactions" scrollable={false} contentStyle={styles.screenContent}>
      <FlatList
        style={styles.list}
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TransactionCard item={item} onPress={() => router.push(`/(tabs)/transactions/${item.id}`)} />}
        ListHeaderComponent={filterHeader}
        ListEmptyComponent={() => {
          if (query.isLoading) return <ActivityIndicator style={styles.centered} color={colors.primarySoft} />;
          if (query.isError) return <ErrorPanel message={query.error.message} onRetry={() => void query.refetch()} colors={colors} />;
          return <Text style={[styles.emptyText, { color: colors.muted }]}>No transactions match these filters. Imported and manually entered activity will appear here.</Text>;
        }}
        ListFooterComponent={() => query.isFetchingNextPage
          ? <ActivityIndicator style={styles.footerLoader} color={colors.primarySoft} />
          : <View />}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.45}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </FinanceScreen>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useFinanceColors>;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? `${colors.primary}22` : colors.surface, borderColor: selected ? colors.primary : colors.border },
      ]}
    >
      <Text numberOfLines={1} style={[styles.chipText, { color: selected ? colors.primarySoft : colors.muted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TransactionCard({
  item,
  onPress,
}: {
  item: TransactionListItem;
  onPress: () => void;
}): React.JSX.Element {
  const colors = useFinanceColors();
  const isCredit = item.type === 'credit';
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.merchant}, ${formatDecimalINR(item.amount)}, ${item.type}`}
      style={[styles.transactionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.typeMarker, { backgroundColor: isCredit ? colors.green : colors.red }]} />
      <View style={styles.transactionInfo}>
        <Text numberOfLines={1} style={[styles.merchant, { color: colors.text }]}>{item.counterparty || item.merchant || 'Unknown counterparty'}</Text>
        <Text numberOfLines={2} style={[styles.description, { color: colors.muted }]}>{item.description || item.merchant || 'No description supplied'}</Text>
        <Text style={[styles.transactionMeta, { color: colors.subtle }]}>{item.date ? new Date(item.date).toLocaleDateString('en-IN') : 'Date unavailable'} · {item.category} · {item.source === 'statement' ? 'Imported from statement' : item.source === 'sms' ? 'From SMS' : 'User entered'}</Text>
      </View>
      <Text style={[styles.amount, { color: isCredit ? colors.green : colors.red }]}>{isCredit ? '+' : '−'}{formatDecimalINR(item.amount)}</Text>
    </TouchableOpacity>
  );
}

function ErrorPanel({
  message,
  onRetry,
  colors,
}: {
  message: string;
  onRetry: () => void;
  colors: ReturnType<typeof useFinanceColors>;
}): React.JSX.Element {
  return (
    <View style={[styles.errorPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.errorText, { color: colors.red }]}>{message}</Text>
      <TouchableOpacity onPress={onRetry}><Text style={[styles.retryText, { color: colors.primarySoft }]}>Try again</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { flex: 1 },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingBottom: 28, gap: 10 },
  listHeader: { width: '100%', gap: 10, paddingBottom: 8 },
  searchInput: { minHeight: 46, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 14 },
  filterLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginTop: 3 },
  dateFields: { flexDirection: 'row', gap: 10 },
  dateInput: { flex: 1, minWidth: 0, minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 13 },
  inlineError: { fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { maxWidth: 190, minHeight: 32, justifyContent: 'center', borderWidth: 1, borderRadius: 99, paddingHorizontal: 11 },
  chipText: { fontSize: 11, fontWeight: '700' },
  filterLine: { gap: 10, flexDirection: 'row', flexWrap: 'wrap' },
  filterGroup: { flex: 1, minWidth: 220, gap: 7 },
  resultsHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 },
  resultsTitle: { fontSize: 16, fontWeight: '800' },
  resultsCount: { fontSize: 11 },
  transactionCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 13 },
  typeMarker: { width: 4, alignSelf: 'stretch', borderRadius: 4 },
  transactionInfo: { flex: 1, minWidth: 0, gap: 4 },
  merchant: { fontSize: 14, fontWeight: '800' },
  description: { fontSize: 12, lineHeight: 17 },
  transactionMeta: { fontSize: 10, lineHeight: 14 },
  amount: { fontSize: 13, fontWeight: '800', textAlign: 'right', flexShrink: 0 },
  emptyText: { fontSize: 13, lineHeight: 20, paddingVertical: 24, textAlign: 'center' },
  centered: { marginVertical: 30 },
  footerLoader: { marginVertical: 16 },
  errorPanel: { padding: 16, borderRadius: 14, borderWidth: 1, gap: 12, marginTop: 12 },
  errorText: { fontSize: 13, lineHeight: 19 },
  retryText: { fontSize: 13, fontWeight: '800' },
  emptyAction: { padding: 14, borderRadius: 14, alignItems: 'center' },
  emptyActionText: { color: '#ffffff', fontWeight: '800' },
});
