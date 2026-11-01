import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FinanceTheme, formatINR } from '@/constants/finance-theme';

export type CategoryChartValue = {
  name: string;
  amount: number;
  color: string;
};

export type CashFlowChartValue = {
  label: string;
  income: number;
  expense: number;
};

export type BalanceTrendValue = {
  label: string;
  value: number;
};

type CategoryBreakdownFallbackProps = {
  data: CategoryChartValue[];
};

type CashFlowFallbackProps = {
  data: CashFlowChartValue[];
};

type BalanceTrendFallbackProps = {
  data: BalanceTrendValue[];
};

/**
 * Chart-kit forwards React Native responder callbacks to SVG nodes on web.
 * These semantic charts use regular native views on web to avoid invalid DOM
 * event props while preserving chart-kit visuals on iOS and Android.
 */
export function CategoryBreakdownFallback({ data }: CategoryBreakdownFallbackProps): React.JSX.Element {
  const total = data.reduce((sum, item) => sum + Math.max(0, item.amount), 0);

  return (
    <View style={styles.categoryList} accessibilityLabel="Spending by category">
      {data.map((item) => {
        const amount = Math.max(0, item.amount);
        const percentage = total > 0 ? (amount / total) * 100 : 0;

        return (
          <View key={item.name} style={styles.categoryItem}>
            <View style={styles.categoryHeading}>
              <View style={styles.categoryNameGroup}>
                <View style={[styles.categoryDot, { backgroundColor: item.color }]} />
                <Text style={styles.categoryName} numberOfLines={1}>{item.name}</Text>
              </View>
              <Text style={styles.categoryAmount}>{formatINR(amount)} · {percentage.toFixed(0)}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { backgroundColor: item.color, width: `${percentage}%` }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function CashFlowFallback({ data }: CashFlowFallbackProps): React.JSX.Element {
  const maxValue = Math.max(1, ...data.flatMap((item) => [item.income, item.expense]));

  return (
    <View style={styles.cashFlowChart} accessibilityLabel="Monthly income and expenses">
      <View style={styles.cashFlowBars}>
        {data.map((item) => (
          <View key={item.label} style={styles.monthColumn}>
            <View style={styles.barPair}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, styles.expenseBar, { height: barHeight(item.expense, maxValue) }]} />
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.bar, styles.incomeBar, { height: barHeight(item.income, maxValue) }]} />
              </View>
            </View>
            <Text style={styles.axisLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function BalanceTrendFallback({ data }: BalanceTrendFallbackProps): React.JSX.Element {
  const values = data.map((item) => item.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum;

  return (
    <View style={styles.trendChart} accessibilityLabel="Balance trend over time">
      <View style={styles.trendBars}>
        {data.map((item) => {
          const relative = spread > 0 ? (item.value - minimum) / spread : 0.5;
          const height = 30 + relative * 68;

          return (
            <View key={`${item.label}-${item.value}`} style={styles.trendColumn}>
              <View style={styles.trendTrack}>
                <View style={[styles.trendBar, { height }]} />
              </View>
              <Text style={styles.axisLabel} numberOfLines={1}>{item.label}</Text>
            </View>
          );
        })}
      </View>
      {data.length > 0 ? (
        <View style={styles.trendSummary}>
          <Text style={styles.summaryLabel}>START</Text>
          <Text style={styles.summaryValue}>{formatINR(data[0].value)}</Text>
          <View style={styles.summarySpacer} />
          <Text style={styles.summaryLabel}>LATEST</Text>
          <Text style={styles.summaryValue}>{formatINR(data[data.length - 1].value)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function barHeight(value: number, maxValue: number): number {
  if (value <= 0) return 0;
  return Math.max(4, (value / maxValue) * 104);
}

const styles = StyleSheet.create({
  categoryList: { width: '100%', gap: 14, paddingHorizontal: 10, paddingVertical: 8 },
  categoryItem: { gap: 7 },
  categoryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  categoryNameGroup: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryName: { color: FinanceTheme.colors.text, fontSize: 11, fontWeight: '700', flexShrink: 1 },
  categoryAmount: { color: FinanceTheme.colors.muted, fontSize: 10, fontWeight: '600' },
  progressTrack: { height: 6, width: '100%', borderRadius: 999, overflow: 'hidden', backgroundColor: FinanceTheme.colors.surfaceRaised },
  progressFill: { height: '100%', borderRadius: 999 },
  cashFlowChart: { width: '100%', paddingHorizontal: 6, paddingTop: 12 },
  cashFlowBars: { minHeight: 142, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: 5 },
  monthColumn: { flex: 1, alignItems: 'center', gap: 8 },
  barPair: { width: '100%', height: 116, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  barTrack: { width: 12, height: 108, justifyContent: 'flex-end', borderTopLeftRadius: 5, borderTopRightRadius: 5, overflow: 'hidden' },
  bar: { width: '100%', borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  expenseBar: { backgroundColor: FinanceTheme.colors.red },
  incomeBar: { backgroundColor: FinanceTheme.colors.green },
  axisLabel: { color: FinanceTheme.colors.muted, fontSize: 8, fontWeight: '600', textAlign: 'center' },
  trendChart: { width: '100%', paddingHorizontal: 8, paddingTop: 12 },
  trendBars: { height: 137, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: 4 },
  trendColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 7 },
  trendTrack: { width: '65%', height: 106, justifyContent: 'flex-end', borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: FinanceTheme.colors.surfaceRaised, overflow: 'hidden' },
  trendBar: { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: FinanceTheme.colors.primarySoft },
  trendSummary: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 15, paddingTop: 10, borderTopWidth: 1, borderTopColor: FinanceTheme.colors.border },
  summaryLabel: { color: FinanceTheme.colors.subtle, fontSize: 7, fontWeight: '800', letterSpacing: 0.4 },
  summaryValue: { color: FinanceTheme.colors.text, fontSize: 9, fontWeight: '700' },
  summarySpacer: { flex: 1 },
});
