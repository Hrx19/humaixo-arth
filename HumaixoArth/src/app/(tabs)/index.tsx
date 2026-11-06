import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FinanceScreen } from '@/components/finance-screen';
import { useAuth } from '@/auth/auth-context';
import { useFinanceColors } from '@/constants/finance-theme';
import {
  formatDecimalINR,
  TransactionIntelligenceService,
  type TransactionListItem,
} from '@/services/transaction-intelligence-service';

type PeriodDays = 7 | 30 | 90;

function periodStart(days: PeriodDays): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString();
}

export default function HomeScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { token, status } = useAuth();
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);
  const period = useMemo(() => ({
    from: periodStart(periodDays),
    to: new Date().toISOString(),
  }), [periodDays]);
  const summaryQuery = useQuery({
    queryKey: ['transaction-intelligence', 'dashboard', token, period],
    queryFn: () => TransactionIntelligenceService.dashboardSummary(token!, period.from, period.to),
    enabled: Boolean(token && status === 'authenticated'),
  });
  const recentQuery = useQuery({
    queryKey: ['transaction-intelligence', 'recent', token],
    queryFn: () => TransactionIntelligenceService.list(token!, { page: 1, limit: 8, sort: 'newest' }),
    enabled: Boolean(token && status === 'authenticated'),
  });
  const summary = summaryQuery.data;
  const recent = recentQuery.data?.data ?? [];
  const hasTransactions = (recentQuery.data?.pagination.total ?? 0) > 0;

  if (status === 'loading') {
    return <FinanceScreen title="Overview" activeTab="home"><ActivityIndicator color={colors.primarySoft} /></FinanceScreen>;
  }
  if (!token) {
    return (
      <FinanceScreen title="Overview" subtitle="Sign in to securely view your financial overview." activeTab="home">
        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Your finances, in one place</Text>
          <Text style={[styles.body, { color: colors.muted }]}>Sign in to see your account balances, cash flow, and transaction history.</Text>
          <PrimaryAction label="Sign in" onPress={() => router.push('/login')} colors={colors} />
        </View>
      </FinanceScreen>
    );
  }

  return (
    <FinanceScreen title="Overview" subtitle="A clear view of your accounts and cash flow." activeTab="home">
      <View style={styles.periodRow}>
        {([7, 30, 90] as const).map((days) => (
          <TouchableOpacity
            key={days}
            accessibilityRole="button"
            accessibilityState={{ selected: periodDays === days }}
            onPress={() => setPeriodDays(days)}
            style={[
              styles.periodChip,
              {
                backgroundColor: periodDays === days ? `${colors.primary}22` : colors.surface,
                borderColor: periodDays === days ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[styles.periodText, { color: periodDays === days ? colors.primarySoft : colors.muted }]}>{days === 7 ? '7 days' : days === 30 ? '30 days' : '90 days'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {summaryQuery.isError ? <ErrorCard message={summaryQuery.error.message} onRetry={() => void summaryQuery.refetch()} colors={colors} /> : null}
      <View style={styles.metricGrid}>
        <MetricCard title="Total available balance" value={summary?.totalAssets} loading={summaryQuery.isLoading} colors={colors} />
        <MetricCard title={`Total income · ${periodDays} days`} value={summary?.totalIncome} loading={summaryQuery.isLoading} positive colors={colors} />
        <MetricCard title={`Total expenses · ${periodDays} days`} value={summary?.totalExpenses} loading={summaryQuery.isLoading} negative colors={colors} />
        <MetricCard title={`Net cash flow · ${periodDays} days`} value={summary?.netCashFlow} loading={summaryQuery.isLoading} colors={colors} />
      </View>
      <View style={styles.sectionHeading}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent transactions</Text>
        <TouchableOpacity onPress={() => router.push('/transactions')} accessibilityRole="link">
          <Text style={[styles.link, { color: colors.primarySoft }]}>See all</Text>
        </TouchableOpacity>
      </View>
      {recentQuery.isLoading ? (
        <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.primarySoft} />
          <Text style={[styles.body, { color: colors.muted }]}>Loading recent activity…</Text>
        </View>
      ) : recentQuery.isError ? (
        <ErrorCard message={recentQuery.error.message} onRetry={() => void recentQuery.refetch()} colors={colors} />
      ) : hasTransactions ? (
        <View style={styles.recentList}>
          {recent.map((transaction) => (
            <RecentTransaction
              key={transaction.id}
              transaction={transaction}
              onPress={() => router.push(`/(tabs)/transactions/${transaction.id}`)}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No transactions yet</Text>
          <Text style={[styles.body, { color: colors.muted }]}>Import a bank statement to get started. Your data will appear here after you review and confirm the import.</Text>
          <PrimaryAction label="Import a statement" onPress={() => router.push('/statement-import')} colors={colors} />
        </View>
      )}
      {hasTransactions ? (
        <PrimaryAction label="Import a statement" onPress={() => router.push('/statement-import')} colors={colors} />
      ) : null}
    </FinanceScreen>
  );
}

function MetricCard({
  title,
  value,
  loading,
  positive = false,
  negative = false,
  colors,
}: {
  title: string;
  value?: string;
  loading: boolean;
  positive?: boolean;
  negative?: boolean;
  colors: ReturnType<typeof useFinanceColors>;
}): React.JSX.Element {
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.metricTitle, { color: colors.muted }]}>{title}</Text>
      {loading ? (
        <View style={[styles.skeleton, { backgroundColor: colors.surfaceRaised }]} />
      ) : (
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.metricValue, { color: positive ? colors.green : negative ? colors.red : colors.text }]}>
          {value === undefined ? '—' : formatDecimalINR(value)}
        </Text>
      )}
    </View>
  );
}

function RecentTransaction({
  transaction,
  onPress,
}: {
  transaction: TransactionListItem;
  onPress: () => void;
}): React.JSX.Element {
  const colors = useFinanceColors();
  const credit = transaction.type === 'credit';
  return (
    <TouchableOpacity onPress={onPress} style={[styles.recentCard, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button">
      <View style={styles.recentCopy}>
        <Text numberOfLines={1} style={[styles.recentName, { color: colors.text }]}>{transaction.counterparty || transaction.merchant || 'Unknown counterparty'}</Text>
        <Text numberOfLines={1} style={[styles.recentMeta, { color: colors.muted }]}>
          {transaction.date ? new Date(transaction.date).toLocaleDateString('en-IN') : 'Date unavailable'} · {transaction.source === 'statement' ? 'Imported from statement' : transaction.source === 'sms' ? 'From SMS' : 'User entered'}
        </Text>
        {transaction.isInternalTransfer ? (
          <Text style={[styles.transferTag, { color: colors.primarySoft }]}>Internal transfer</Text>
        ) : null}
      </View>
      <Text style={[styles.recentAmount, { color: credit ? colors.green : colors.red }]}>{credit ? '+' : '−'}{formatDecimalINR(transaction.amount)}</Text>
    </TouchableOpacity>
  );
}

function PrimaryAction({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useFinanceColors>;
}): React.JSX.Element {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.action, { backgroundColor: colors.primary }]} accessibilityRole="button">
      <Text style={styles.actionText}>{label}</Text>
    </TouchableOpacity>
  );
}

function ErrorCard({
  message,
  onRetry,
  colors,
}: {
  message: string;
  onRetry: () => void;
  colors: ReturnType<typeof useFinanceColors>;
}): React.JSX.Element {
  return (
    <View style={[styles.errorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.body, { color: colors.red }]}>{message}</Text>
      <TouchableOpacity onPress={onRetry}><Text style={[styles.link, { color: colors.primarySoft }]}>Try again</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  periodRow: { flexDirection: 'row', gap: 8 },
  periodChip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 99, borderWidth: 1 },
  periodText: { fontSize: 11, fontWeight: '800' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flex: 1, minWidth: 210, minHeight: 104, justifyContent: 'space-between', borderWidth: 1, borderRadius: 17, padding: 15 },
  metricTitle: { fontSize: 11, fontWeight: '700', lineHeight: 16 },
  metricValue: { fontSize: 23, fontWeight: '900', letterSpacing: -0.5 },
  skeleton: { height: 26, width: '65%', borderRadius: 7 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  sectionTitle: { fontSize: 17, fontWeight: '900' },
  link: { fontSize: 12, fontWeight: '800' },
  recentList: { gap: 8 },
  recentCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 11 },
  recentCopy: { flex: 1, gap: 5 },
  recentName: { fontSize: 13, fontWeight: '800' },
  recentMeta: { fontSize: 10 },
  transferTag: { fontSize: 9, fontWeight: '800', marginTop: 3 },
  recentAmount: { fontSize: 13, fontWeight: '900' },
  emptyCard: { padding: 20, borderRadius: 17, borderWidth: 1, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '900' },
  body: { fontSize: 13, lineHeight: 20 },
  action: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, marginTop: 3 },
  actionText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  loadingCard: { minHeight: 95, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  errorCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
});
