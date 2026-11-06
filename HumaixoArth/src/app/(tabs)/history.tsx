import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { EmptyState, SectionHeader, SurfaceCard, TransactionRow } from '@/components/finance-ui';
import { FinanceTheme, formatDate, formatINR } from '@/constants/finance-theme';
import { FinanceService } from '@/services/finance-service';
import { useFinanceStore } from '@/store/finance-store';
import type { BalanceHistoryPoint, FinanceTransaction } from '@/types/finance';
import { LineChart } from 'react-native-chart-kit';
import { BalanceTrendFallback } from '@/components/web-chart-fallbacks';

const GUEST_HISTORY: BalanceHistoryPoint[] = [
  { date: '2026-01-31T23:59:59.999Z', balance: '245000' },
  { date: '2026-02-28T23:59:59.999Z', balance: '260000' },
  { date: '2026-03-31T23:59:59.999Z', balance: '290000' },
  { date: '2026-04-30T23:59:59.999Z', balance: '310000' },
  { date: '2026-05-31T23:59:59.999Z', balance: '335000' },
  { date: '2026-06-30T23:59:59.999Z', balance: '350000' },
  { date: '2026-07-31T23:59:59.999Z', balance: '375000' },
  { date: '2026-08-31T23:59:59.999Z', balance: '395000' },
  { date: '2026-09-30T23:59:59.999Z', balance: '420000' },
  { date: '2026-10-31T23:59:59.999Z', balance: '452380' },
];

export default function HistoryScreen(): React.JSX.Element {
  const { width: screenWidth } = useWindowDimensions();
  const isDesktopViewport = Platform.OS === 'web' && screenWidth >= 1024;
  const chartWidth = isDesktopViewport
    ? Math.min(720, Math.max(240, screenWidth - 320))
    : Math.min(680, Math.max(240, screenWidth - (screenWidth < 480 ? 76 : 96)));
  const { status, token } = useAuth();
  const isGuest = status !== 'authenticated' || !token;
  const accounts = useFinanceStore((state) => state.accounts);
  const [months, setMonths] = useState(12);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [historySnapshot, setHistorySnapshot] = useState<{ token: string | null; series: BalanceHistoryPoint[] }>({ token: null, series: [] });
  const [selectedIndex, setSelectedIndex] = useState(GUEST_HISTORY.length - 1);
  const [activitySnapshot, setActivitySnapshot] = useState<{
    key: string;
    transactions: FinanceTransaction[];
    balances: { id: string; name: string; institution: string; balance: string; currency: string }[];
  }>({ key: '', transactions: [], balances: [] });
  const [historyError, setHistoryError] = useState<{ key: string; message: string } | null>(null);
  const [activityError, setActivityError] = useState<{ key: string; message: string } | null>(null);
  const [historyLoadedKey, setHistoryLoadedKey] = useState<string | null>(null);
  const historyRequestKey = `${token ?? 'guest'}:${months}:${selectedAccountId ?? 'all'}`;
  const history = historySnapshot.token === token ? historySnapshot.series : [];
  const loading = !isGuest && historyLoadedKey !== historyRequestKey && historyError?.key !== historyRequestKey;
  const error = historyError?.key === historyRequestKey
    ? historyError.message
    : activityError?.key === `${token ?? ''}:${selectedIndex}:${selectedAccountId ?? 'all'}`
      ? activityError.message
      : null;

  useEffect(() => {
    if (isGuest || !token) return;

    let active = true;
    FinanceService.getBalanceHistory(token, months, selectedAccountId)
      .then((result) => {
        if (!active) return;
        setHistorySnapshot({ token, series: result.series });
        setHistoryLoadedKey(historyRequestKey);
        setSelectedIndex(Math.max(0, result.series.length - 1));
      })
      .catch((requestError: unknown) => {
        if (active) setHistoryError({
          key: historyRequestKey,
          message: requestError instanceof Error ? requestError.message : 'Could not load balance history.',
        });
      });

    return () => { active = false; };
  }, [historyRequestKey, isGuest, months, selectedAccountId, token]);

  const visibleHistory = isGuest ? GUEST_HISTORY : history;
  const visibleSelectedIndex = Math.min(selectedIndex, Math.max(0, visibleHistory.length - 1));
  const selectedPoint = visibleHistory[visibleSelectedIndex];
  const selectedPointDate = selectedPoint?.date;
  const activityRequestKey = `${token ?? ''}:${selectedIndex}:${selectedAccountId ?? 'all'}`;
  const activityMatchesRequest = activitySnapshot.key === activityRequestKey;
  const transactions = activityMatchesRequest ? activitySnapshot.transactions : [];
  const accountBalances = activityMatchesRequest ? activitySnapshot.balances : [];

  useEffect(() => {
    if (isGuest || !token || !selectedPointDate) return;

    let active = true;
    const selectedDate = new Date(selectedPointDate);
    const from = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).toISOString();

    Promise.all([
      FinanceService.getBalanceAt(token, selectedPointDate, selectedAccountId),
      FinanceService.getTransactions(token, {
        limit: 100,
        accountId: selectedAccountId,
        from,
        to: selectedPointDate,
      }),
    ])
      .then(([balance, monthlyTransactions]) => {
        if (!active) return;
        setActivitySnapshot({
          key: activityRequestKey,
          transactions: monthlyTransactions,
          balances: balance.byAccount,
        });
      })
      .catch((requestError: unknown) => {
        if (active) setActivityError({
          key: activityRequestKey,
          message: requestError instanceof Error ? requestError.message : 'Could not load this period.',
        });
      });

    return () => { active = false; };
  }, [activityRequestKey, isGuest, selectedAccountId, selectedPointDate, token]);

  const selectedMonthLabel = selectedPoint
    ? new Date(selectedPoint.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : 'Balance history';

  const chartLabels = useMemo(() => {
    const stride = Math.max(1, Math.ceil(visibleHistory.length / 6));
    return visibleHistory.map((point, index) => {
      if (index % stride !== 0 && index !== visibleHistory.length - 1) return '';
      return new Date(point.date).toLocaleDateString('en-IN', { month: 'short' });
    });
  }, [visibleHistory]);

  return (
    <FinanceScreen
      title="Time Travel"
      subtitle="See what your tracked balances looked like in earlier months."
      activeTab="history"
    >
      {isGuest ? <View style={styles.previewBanner}><Text style={styles.previewText}>DEMO TIMELINE · Sign in to inspect your balance history</Text></View> : null}

      {!isGuest && accounts.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountFilters}>
          <MonthChip label="All accounts" active={!selectedAccountId} onPress={() => setSelectedAccountId(undefined)} />
          {accounts.map((account) => (
            <MonthChip key={account.id} label={account.name} active={selectedAccountId === account.id} onPress={() => setSelectedAccountId(account.id)} />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.periodRow}>
        {[6, 12, 24].map((period) => (
          <MonthChip key={period} label={`${period}M`} active={months === period} onPress={() => setMonths(period)} />
        ))}
      </View>

      {loading ? <ActivityIndicator color={FinanceTheme.colors.primarySoft} style={styles.loader} /> : null}
      {error ? <SurfaceCard><Text style={styles.errorText}>{error}</Text></SurfaceCard> : null}

      {visibleHistory.length > 0 ? (
        <SurfaceCard style={styles.historyCard}>
          <Text style={styles.historyDate}>{selectedMonthLabel}</Text>
          <Text style={styles.historyBalance}>{formatINR(selectedPoint?.balance ?? '0')}</Text>
          <Text style={styles.historyCaption}>{isGuest ? 'Sample net worth' : 'Tracked closing balance'}</Text>
          {visibleHistory.length > 1 ? (
            Platform.OS === 'web' ? (
              <BalanceTrendFallback data={visibleHistory.map((point) => ({
                label: new Date(point.date).toLocaleDateString('en-IN', { month: 'short' }),
                value: new Decimal(point.balance).toNumber(),
              }))} />
            ) : (
              <LineChart
                data={{ labels: chartLabels, datasets: [{ data: visibleHistory.map((point) => new Decimal(point.balance).toNumber()) }] }}
                width={chartWidth}
                height={190}
                chartConfig={{
                  backgroundColor: FinanceTheme.colors.surface,
                  backgroundGradientFrom: FinanceTheme.colors.surface,
                  backgroundGradientTo: FinanceTheme.colors.surface,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(181,164,255,${opacity})`,
                  labelColor: (opacity = 1) => `rgba(161,161,179,${opacity})`,
                  propsForDots: { r: '3', strokeWidth: '1', stroke: FinanceTheme.colors.primarySoft },
                  propsForBackgroundLines: { stroke: 'rgba(255,255,255,0.06)' },
                }}
                bezier
                withInnerLines
                withOuterLines={false}
                withVerticalLabels
                withHorizontalLabels={false}
                style={styles.chart}
              />
            )
          ) : <Text style={styles.noHistory}>Add more statement periods to build a trend.</Text>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineStrip}>
              {visibleHistory.map((point, index) => (
              <TouchableOpacity
                key={point.date}
                onPress={() => setSelectedIndex(index)}
                style={[styles.timelineItem, selectedIndex === index && styles.timelineItemActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedIndex === index }}
              >
                <View style={[styles.timelineDot, selectedIndex === index && styles.timelineDotActive]} />
                <Text style={[styles.timelineMonth, selectedIndex === index && styles.timelineMonthActive]}>
                  {new Date(point.date).toLocaleDateString('en-IN', { month: 'short' })}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SurfaceCard>
      ) : !loading && !isGuest ? (
        <EmptyState title="No balance history yet" description="Add an account and import a statement to start your personal financial timeline." />
      ) : null}

      {!isGuest && selectedPoint ? (
        <View>
          <SectionHeader title={`Balance at ${formatDate(selectedPoint.date)}`} />
          <SurfaceCard style={styles.accountBalanceCard}>
            {accountBalances.length === 0 ? (
              <Text style={styles.emptyBalance}>No tracked account balance for this date.</Text>
            ) : accountBalances.map((account) => (
              <View key={account.id} style={styles.accountBalanceRow}>
                <View style={styles.accountBalanceInfo}>
                  <Text style={styles.accountBalanceName}>{account.name}</Text>
                  <Text style={styles.accountBalanceInstitution}>{account.institution}</Text>
                </View>
                <Text style={styles.accountBalanceValue}>{formatINR(account.balance)}</Text>
              </View>
            ))}
          </SurfaceCard>
        </View>
      ) : null}

      {!isGuest ? (
        <View>
          <SectionHeader title={`Activity in ${selectedMonthLabel}`} />
          <SurfaceCard style={styles.activityCard}>
            {transactions.length === 0 ? (
              <Text style={styles.noHistory}>No transaction records in this period.</Text>
            ) : transactions.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} expanded />
            ))}
          </SurfaceCard>
        </View>
      ) : null}
    </FinanceScreen>
  );
}

function MonthChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.monthChip, active && styles.monthChipActive]}>
      <Text style={[styles.monthChipText, active && styles.monthChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  previewBanner: { backgroundColor: 'rgba(245,184,75,0.1)', borderColor: 'rgba(245,184,75,0.25)', borderWidth: 1, borderRadius: 12, padding: 10 },
  previewText: { color: FinanceTheme.colors.amber, fontSize: 9, textAlign: 'center', fontWeight: '800' },
  accountFilters: { gap: 7 },
  periodRow: { flexDirection: 'row', gap: 7, justifyContent: 'flex-end' },
  monthChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: FinanceTheme.colors.surface, borderWidth: 1, borderColor: FinanceTheme.colors.border },
  monthChipActive: { backgroundColor: FinanceTheme.colors.primary, borderColor: FinanceTheme.colors.primary },
  monthChipText: { color: FinanceTheme.colors.muted, fontSize: 9, fontWeight: '700' },
  monthChipTextActive: { color: '#ffffff' },
  loader: { paddingVertical: 24 },
  errorText: { color: FinanceTheme.colors.red, fontSize: 11 },
  historyCard: { alignItems: 'center', paddingHorizontal: 9, paddingTop: 18 },
  historyDate: { color: FinanceTheme.colors.muted, fontSize: 10, fontWeight: '700' },
  historyBalance: { color: FinanceTheme.colors.text, fontSize: 28, fontWeight: '900', marginTop: 5 },
  historyCaption: { color: FinanceTheme.colors.subtle, fontSize: 9, marginTop: 3 },
  chart: { marginTop: 12, borderRadius: 12, alignSelf: 'center' },
  noHistory: { color: FinanceTheme.colors.subtle, textAlign: 'center', fontSize: 10, padding: 18, lineHeight: 16 },
  timelineStrip: { flexDirection: 'row', paddingHorizontal: 6, paddingBottom: 4, gap: 2 },
  timelineItem: { minWidth: 38, alignItems: 'center', gap: 5, paddingVertical: 6, borderRadius: 9 },
  timelineItemActive: { backgroundColor: 'rgba(11,130,126,0.15)' },
  timelineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: FinanceTheme.colors.border },
  timelineDotActive: { width: 8, height: 8, borderRadius: 4, backgroundColor: FinanceTheme.colors.primarySoft },
  timelineMonth: { color: FinanceTheme.colors.subtle, fontSize: 8, fontWeight: '700' },
  timelineMonthActive: { color: FinanceTheme.colors.primarySoft },
  accountBalanceCard: { paddingHorizontal: 14 },
  accountBalanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: FinanceTheme.colors.border },
  accountBalanceInfo: { flex: 1 },
  accountBalanceName: { color: FinanceTheme.colors.text, fontSize: 11, fontWeight: '700' },
  accountBalanceInstitution: { color: FinanceTheme.colors.subtle, fontSize: 9, marginTop: 3 },
  accountBalanceValue: { color: FinanceTheme.colors.text, fontSize: 12, fontWeight: '800' },
  emptyBalance: { color: FinanceTheme.colors.muted, fontSize: 10, paddingVertical: 12 },
  activityCard: { paddingHorizontal: 12, paddingVertical: 3 },
});
