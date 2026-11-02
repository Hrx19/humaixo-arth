import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { EmptyState, SectionHeader, SurfaceCard, PrimaryButton } from '@/components/finance-ui';
import { FinanceTheme, formatINR } from '@/constants/finance-theme';
import { FinanceService } from '@/services/finance-service';
import { useFinanceStore } from '@/store/finance-store';
import type { BalanceHistoryPoint, FinanceAnalytics, MerchantSummary } from '@/types/finance';
import { BalanceTrendFallback, CashFlowFallback, CategoryBreakdownFallback } from '@/components/web-chart-fallbacks';

const CHART_COLORS = ['#8b6cff', '#22c997', '#f5b84b', '#58a6ff', '#ff6375', '#d879ff'];
const GUEST_CATEGORIES = [
  { name: 'Food', amount: 8500, color: '#8b6cff', legendFontColor: '#a1a1b3', legendFontSize: 11 },
  { name: 'Shopping', amount: 12000, color: '#22c997', legendFontColor: '#a1a1b3', legendFontSize: 11 },
  { name: 'Travel', amount: 4200, color: '#f5b84b', legendFontColor: '#a1a1b3', legendFontSize: 11 },
  { name: 'Bills', amount: 3800, color: '#58a6ff', legendFontColor: '#a1a1b3', legendFontSize: 11 },
];

export default function InsightsScreen(): React.JSX.Element {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktopViewport = Platform.OS === 'web' && screenWidth >= 1024;
  const chartWidth = isDesktopViewport
    ? Math.min(720, Math.max(240, screenWidth - 320))
    : Math.min(680, Math.max(240, screenWidth - (screenWidth < 480 ? 76 : 96)));
  const { status, token } = useAuth();
  const isGuest = status !== 'authenticated' || !token;
  const storedAnalytics = useFinanceStore((state) => state.analytics);
  const [range, setRange] = useState(12);
  const [analytics, setAnalytics] = useState<FinanceAnalytics | null>(storedAnalytics);
  const [history, setHistory] = useState<BalanceHistoryPoint[]>([]);
  const [merchants, setMerchants] = useState<MerchantSummary[]>([]);
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<{ key: string; message: string } | null>(null);
  const requestKey = `${token ?? 'guest'}:${range}`;
  const loading = !isGuest && loadedRequestKey !== requestKey && requestError?.key !== requestKey;
  const error = requestError?.key === requestKey ? requestError.message : null;

  useEffect(() => {
    if (isGuest || !token) return;
    let active = true;
    Promise.all([
      FinanceService.getAnalytics(token, range),
      FinanceService.getBalanceHistory(token, range),
      FinanceService.getMerchants(token),
    ])
      .then(([analyticsResult, historyResult, merchantResult]) => {
        if (!active) return;
        setAnalytics(analyticsResult);
        setHistory(historyResult.series);
        setMerchants(merchantResult);
        setLoadedRequestKey(requestKey);
        setRequestError(null);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setRequestError({
            key: requestKey,
            message: requestError instanceof Error ? requestError.message : 'Could not calculate insights.',
          });
        }
      });
    return () => { active = false; };
  }, [isGuest, range, requestKey, token]);

  const categoryData = useMemo(() => {
    if (isGuest) return GUEST_CATEGORIES;
    return (analytics?.byCategory ?? []).map((item, index) => ({
      name: item.category,
      amount: item.amount,
      color: CHART_COLORS[index % CHART_COLORS.length],
      legendFontColor: '#a1a1b3',
      legendFontSize: 10,
    }));
  }, [analytics?.byCategory, isGuest]);

  const monthlyData = analytics?.monthlyTotals.slice(-6) ?? [];
  const income = monthlyData.map((month) => month.income);
  const expense = monthlyData.map((month) => month.expense);
  const healthScore = calculateHealthScore(analytics);
  const topCategory = analytics?.byCategory[0];
  const recurringMerchants = merchants.filter((merchant) =>
    merchant.transactionCount >= 3 && merchant.categories.some((category) => /subscription|entertainment|bills/i.test(category)),
  );

  return (
    <FinanceScreen
      title="AI Insights"
      subtitle="Patterns derived from your own transaction ledger, with the evidence behind them."
      activeTab="insights"
    >
      <View style={styles.rangeRow}>
        {[3, 6, 12].map((value) => (
          <TouchableOpacity key={value} onPress={() => setRange(value)} style={[styles.rangeChip, range === value && styles.rangeChipActive]}>
            <Text style={[styles.rangeText, range === value && styles.rangeTextActive]}>{value} months</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isGuest ? <Text style={styles.previewBanner}>EXAMPLE ANALYTICS · These figures are illustrative, not account data.</Text> : null}
      {loading ? <ActivityIndicator color={FinanceTheme.colors.primarySoft} style={styles.loader} /> : null}
      {error ? <SurfaceCard><Text style={styles.errorText}>{error}</Text></SurfaceCard> : null}

      <SurfaceCard style={styles.healthCard}>
        <View style={styles.healthRing}>
          <Text style={styles.healthScore}>{isGuest ? '780' : healthScore === null ? '—' : String(healthScore)}</Text>
          <Text style={styles.healthOutOf}>/ 1000</Text>
        </View>
        <View style={styles.healthDescription}>
          <Text style={styles.healthTitle}>Financial Health Snapshot</Text>
          <Text style={styles.healthBody}>
            {isGuest
              ? 'A clear view of cash flow, category concentration and tracked balance trends.'
              : healthScore === null
                ? 'Add an account with statement history and income data to calculate a useful snapshot.'
                : `Based on your ${range}-month net cash flow and savings rate. This is an informational metric, not financial advice.`}
          </Text>
        </View>
      </SurfaceCard>

      {isGuest ? (
        <View style={styles.previewPill}><Text style={styles.previewPillText}>SAMPLE DATA</Text></View>
      ) : null}

      <View>
        <SectionHeader title="Where your money goes" />
        <SurfaceCard style={styles.chartCard}>
          {categoryData.length === 0 ? (
            <EmptyState title="No category data" description="Import a statement with transactions to see your category split." />
          ) : (
            Platform.OS === 'web' ? (
              <CategoryBreakdownFallback data={categoryData.map(({ name, amount, color }) => ({ name, amount, color }))} />
            ) : (
              <PieChart
                data={categoryData.map(({ amount, ...item }) => ({ ...item, population: amount }))}
                width={chartWidth}
                height={190}
                chartConfig={chartConfig}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="8"
                absolute
                hasLegend
              />
            )
          )}
          {topCategory && !isGuest ? (
            <Text style={styles.chartFootnote}>
              {topCategory.category} is highest at {formatINR(topCategory.amount)} across {topCategory.count} transactions.
            </Text>
          ) : null}
        </SurfaceCard>
      </View>

      <View>
        <SectionHeader title="Income vs expenses" />
        <SurfaceCard style={styles.chartCard}>
          {Platform.OS === 'web' ? (
            isGuest || monthlyData.length > 0 ? (
              <CashFlowFallback
                data={isGuest
                  ? [
                    { label: 'May', income: 62000, expense: 48000 },
                    { label: 'Jun', income: 58000, expense: 52000 },
                    { label: 'Jul', income: 71000, expense: 55000 },
                    { label: 'Aug', income: 63500, expense: 49000 },
                    { label: 'Sep', income: 69000, expense: 57600 },
                    { label: 'Oct', income: 75000, expense: 56600 },
                  ]
                  : monthlyData.map((month) => ({
                    label: new Date(month.year, month.month - 1, 1).toLocaleDateString('en-IN', { month: 'short' }),
                    income: month.income,
                    expense: month.expense,
                  }))}
              />
            ) : <Text style={styles.noData}>No monthly cash flow available for this range.</Text>
          ) : isGuest ? (
            <BarChart
              data={{ labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'], datasets: [{ data: [62000, 58000, 71000, 63500, 69000, 75000] }, { data: [48000, 52000, 55000, 49000, 57600, 56600] }] }}
              width={chartWidth}
              height={205}
              chartConfig={chartConfig}
              yAxisLabel="₹"
              yAxisSuffix=""
              fromZero
              showValuesOnTopOfBars={false}
              withInnerLines
              flatColor
              style={styles.chart}
            />
          ) : monthlyData.length > 0 ? (
            <BarChart
              data={{
                labels: monthlyData.map((month) => new Date(month.year, month.month - 1, 1).toLocaleDateString('en-IN', { month: 'short' })),
                datasets: [{ data: expense }, { data: income }],
              }}
              width={chartWidth}
              height={205}
              chartConfig={chartConfig}
              yAxisLabel="₹"
              yAxisSuffix=""
              fromZero
              showValuesOnTopOfBars={false}
              withInnerLines
              flatColor
              style={styles.chart}
            />
          ) : <Text style={styles.noData}>No monthly cash flow available for this range.</Text>}
          <View style={styles.legendRow}>
            <LegendDot color={FinanceTheme.colors.red} label="Expenses" />
            <LegendDot color={FinanceTheme.colors.green} label="Income" />
          </View>
        </SurfaceCard>
      </View>

      <View>
        <SectionHeader title="Balance over time" actionLabel="Open history" onAction={() => router.push('/history')} />
        <SurfaceCard style={styles.chartCard}>
          {Platform.OS === 'web' ? (
            isGuest || history.length > 0 ? (
              <BalanceTrendFallback
                data={(isGuest
                  ? [335000, 350000, 375000, 395000, 420000, 452380].map((value, index) => ({
                    label: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'][index],
                    value,
                  }))
                  : history.map((point) => ({
                    label: new Date(point.date).toLocaleDateString('en-IN', { month: 'short' }),
                    value: point.balance,
                  })))}
              />
            ) : <Text style={styles.noData}>Balance trend appears when accounts have opening balances or statement snapshots.</Text>
          ) : isGuest ? (
            <LineChart
              data={{ labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'], datasets: [{ data: [335000, 350000, 375000, 395000, 420000, 452380] }] }}
              width={chartWidth}
              height={170}
              chartConfig={chartConfig}
              bezier
              withHorizontalLabels={false}
              withVerticalLabels
              withOuterLines={false}
              style={styles.chart}
            />
          ) : history.length > 0 ? (
            <LineChart
              data={{ labels: history.map((point) => new Date(point.date).toLocaleDateString('en-IN', { month: 'short' })), datasets: [{ data: history.map((point) => point.balance) }] }}
              width={chartWidth}
              height={170}
              chartConfig={chartConfig}
              bezier
              withHorizontalLabels={false}
              withVerticalLabels
              withOuterLines={false}
              style={styles.chart}
            />
          ) : <Text style={styles.noData}>Balance trend appears when accounts have opening balances or statement snapshots.</Text>}
        </SurfaceCard>
      </View>

      <View>
        <SectionHeader title="Signals from your ledger" />
        {isGuest ? (
          <InsightTile title="Category change" description="Compare your monthly spending patterns and spot categories that are growing." tone="amber" />
        ) : topCategory ? (
          <InsightTile title={`${topCategory.category} leads your spending`} description={`${formatINR(topCategory.amount)} was recorded across ${topCategory.count} transactions in this range.`} tone="amber" />
        ) : (
          <InsightTile title="Build your first insight" description="Import a statement to identify category patterns from real transactions." tone="purple" />
        )}
        {isGuest ? (
          <InsightTile title="Recurring charges" description="Repeated merchant payments can reveal subscriptions you may want to review." tone="green" />
        ) : recurringMerchants.length > 0 ? (
          recurringMerchants.slice(0, 3).map((merchant) => (
            <InsightTile
              key={merchant.name}
              title={`${merchant.name} appears regularly`}
              description={`${merchant.transactionCount} entries · ${formatINR(merchant.spent)} debit total. Review the timeline before deciding whether it is recurring.`}
              tone="green"
            />
          ))
        ) : (
          <InsightTile title="No recurring merchant pattern yet" description="Repeated transactions will be surfaced after more statement history is available." tone="green" />
        )}
      </View>

      {!isGuest && analytics?.byCategory.length === 0 ? (
        <PrimaryButton label="Import a bank statement" onPress={() => router.push('/statement-import')} />
      ) : null}
    </FinanceScreen>
  );
}

function calculateHealthScore(analytics: FinanceAnalytics | null): number | null {
  if (!analytics || analytics.totals.income <= 0) return null;
  const savingsRate = (analytics.totals.income - analytics.totals.expense) / analytics.totals.income;
  const score = 500 + Math.min(300, Math.max(-300, savingsRate * 500));
  const dataCoverageBonus = Math.min(100, analytics.monthlyTotals.filter((month) => month.income > 0 || month.expense > 0).length * 10);
  return Math.round(Math.max(0, Math.min(1000, score + dataCoverageBonus)));
}

function LegendDot({ color, label }: { color: string; label: string }): React.JSX.Element {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>;
}

function InsightTile({ title, description, tone }: { title: string; description: string; tone: 'amber' | 'green' | 'purple' }): React.JSX.Element {
  return (
    <SurfaceCard style={[styles.insightTile, tone === 'amber' ? styles.insightAmber : tone === 'green' ? styles.insightGreen : styles.insightPurple]}>
      <View style={[styles.insightMarker, tone === 'amber' ? styles.markerAmber : tone === 'green' ? styles.markerGreen : styles.markerPurple]} />
      <View style={styles.insightText}>
        <Text style={styles.insightTitle}>{title}</Text>
        <Text style={styles.insightDescription}>{description}</Text>
      </View>
    </SurfaceCard>
  );
}

const chartConfig = {
  backgroundColor: FinanceTheme.colors.surface,
  backgroundGradientFrom: FinanceTheme.colors.surface,
  backgroundGradientTo: FinanceTheme.colors.surface,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(181,164,255,${opacity})`,
  labelColor: (opacity = 1) => `rgba(161,161,179,${opacity})`,
  barPercentage: 0.58,
  propsForDots: { r: '3', strokeWidth: '1', stroke: FinanceTheme.colors.primarySoft },
  propsForBackgroundLines: { stroke: 'rgba(255,255,255,0.06)' },
};

const styles = StyleSheet.create({
  rangeRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 7 },
  rangeChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: FinanceTheme.colors.surface, borderWidth: 1, borderColor: FinanceTheme.colors.border },
  rangeChipActive: { backgroundColor: FinanceTheme.colors.primary, borderColor: FinanceTheme.colors.primary },
  rangeText: { color: FinanceTheme.colors.muted, fontSize: 9, fontWeight: '700' },
  rangeTextActive: { color: '#ffffff' },
  previewBanner: { color: FinanceTheme.colors.amber, fontSize: 8, lineHeight: 12, textAlign: 'center', fontWeight: '800', padding: 8, backgroundColor: 'rgba(245,184,75,0.1)', borderRadius: 9 },
  loader: { paddingVertical: 18 },
  errorText: { color: FinanceTheme.colors.red, fontSize: 10 },
  healthCard: { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: '#12261f', borderColor: 'rgba(33,201,151,0.25)' },
  healthRing: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: FinanceTheme.colors.green, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(33,201,151,0.08)' },
  healthScore: { color: FinanceTheme.colors.text, fontSize: 20, fontWeight: '900' },
  healthOutOf: { color: FinanceTheme.colors.muted, fontSize: 8, marginTop: -2 },
  healthDescription: { flex: 1 },
  healthTitle: { color: FinanceTheme.colors.text, fontSize: 12, fontWeight: '800' },
  healthBody: { color: FinanceTheme.colors.muted, fontSize: 9, lineHeight: 14, marginTop: 5 },
  previewPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(245,184,75,0.12)' },
  previewPillText: { color: FinanceTheme.colors.amber, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  chartCard: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12, overflow: 'hidden' },
  chart: { borderRadius: 10, alignSelf: 'center' },
  chartFootnote: { color: FinanceTheme.colors.muted, fontSize: 9, textAlign: 'center', paddingHorizontal: 10, marginTop: 5, lineHeight: 14 },
  noData: { color: FinanceTheme.colors.subtle, fontSize: 10, textAlign: 'center', padding: 20, lineHeight: 15 },
  legendRow: { flexDirection: 'row', gap: 16, alignSelf: 'flex-end', paddingHorizontal: 10, paddingTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: FinanceTheme.colors.muted, fontSize: 8 },
  insightTile: { flexDirection: 'row', gap: 10, padding: 13 },
  insightAmber: { borderColor: 'rgba(245,184,75,0.22)' },
  insightGreen: { borderColor: 'rgba(33,201,151,0.2)' },
  insightPurple: { borderColor: 'rgba(128,92,255,0.25)' },
  insightMarker: { width: 9, height: 9, borderRadius: 5, marginTop: 4 },
  markerAmber: { backgroundColor: FinanceTheme.colors.amber },
  markerGreen: { backgroundColor: FinanceTheme.colors.green },
  markerPurple: { backgroundColor: FinanceTheme.colors.primarySoft },
  insightText: { flex: 1 },
  insightTitle: { color: FinanceTheme.colors.text, fontSize: 11, fontWeight: '800' },
  insightDescription: { color: FinanceTheme.colors.muted, fontSize: 9, lineHeight: 14, marginTop: 4 },
});
