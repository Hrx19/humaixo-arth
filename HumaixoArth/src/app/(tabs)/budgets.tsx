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
  type BudgetPeriod,
} from '@/services/money-tools-service';

function activePeriodDates(period: BudgetPeriod): { startDate: string; endDate: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === 'monthly') {
    start.setUTCDate(1);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function isValidAmount(value: string): boolean {
  if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/.test(value)) return false;
  return new DecimalJS(value).isPositive();
}

export default function BudgetsScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { token, status } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [formError, setFormError] = useState('');

  const budgetsQuery = useQuery({
    queryKey: ['money-tools', 'budgets', token],
    queryFn: () => MoneyToolsService.getBudgets(token!),
    enabled: Boolean(token && status === 'authenticated'),
  });
  const categoriesQuery = useQuery({
    queryKey: ['money-tools', 'budget-categories', token],
    queryFn: () => MoneyToolsService.getBudgetCategories(token!),
    enabled: Boolean(token && status === 'authenticated' && formOpen),
  });
  const createMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Sign in to create a budget.');
      if (!categoryId) throw new Error('Choose an expense category.');
      if (!isValidAmount(amount)) throw new Error('Enter a positive amount with up to two decimal places.');
      return MoneyToolsService.createBudget(token, {
        categoryId,
        amount,
        period,
        ...activePeriodDates(period),
      });
    },
    onSuccess: async () => {
      setFormOpen(false);
      setAmount('');
      setCategoryId('');
      setFormError('');
      await queryClient.invalidateQueries({ queryKey: ['money-tools', 'budgets', token] });
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const headerAction = (
    <TouchableOpacity
      onPress={() => setFormOpen((open) => !open)}
      accessibilityRole="button"
      accessibilityLabel={formOpen ? 'Close new budget form' : 'Add new budget'}
      style={[styles.addButton, { backgroundColor: colors.primary }]}
    >
      <Text style={styles.addButtonText}>{formOpen ? 'Close' : '+ Budget'}</Text>
    </TouchableOpacity>
  );

  if (status === 'loading') {
    return <FinanceScreen title="Budgets" activeTab="tools"><ToolLoading /></FinanceScreen>;
  }
  if (!token) {
    return (
      <FinanceScreen title="Budgets" subtitle="Plan spending by category and stay ahead of the month." activeTab="tools">
        <ToolEmptyState title="Sign in to manage budgets" description="Your budgets are private and available after you sign in." action={<ToolButton label="Sign in" onPress={() => router.push('/login')} />} />
      </FinanceScreen>
    );
  }

  const budgets = budgetsQuery.data ?? [];
  const categories = (categoriesQuery.data ?? []).filter((category) => category.kind === 'expense');

  return (
    <FinanceScreen
      title="Budgets"
      subtitle="Keep category spending within a plan that works for you."
      activeTab="tools"
      rightAction={headerAction}
    >
      {formOpen ? (
        <ToolCard>
          <ToolSectionTitle>Set a new budget</ToolSectionTitle>
          {categoriesQuery.isLoading ? <ToolLoading /> : null}
          {categoriesQuery.isError ? <ToolError message={categoriesQuery.error.message} onRetry={() => void categoriesQuery.refetch()} /> : null}
          {!categoriesQuery.isLoading && !categoriesQuery.isError ? (
            <>
              <Text style={[styles.formLabel, { color: colors.muted }]}>EXPENSE CATEGORY</Text>
              <View style={styles.categoryGrid}>
                {categories.map((category) => {
                  const selected = category.id === categoryId;
                  return (
                    <TouchableOpacity
                      key={category.id}
                      onPress={() => setCategoryId(category.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: selected ? `${colors.primary}20` : colors.surfaceRaised, borderColor: selected ? colors.primary : colors.border },
                      ]}
                    >
                      <Text style={[styles.categoryText, { color: selected ? colors.primarySoft : colors.text }]}>{category.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <ToolField
                label="BUDGET AMOUNT · INR"
                value={amount}
                onChangeText={(value) => {
                  if (value === '' || /^(?:0|[1-9]\d{0,14})(?:\.\d{0,2})?$/.test(value)) setAmount(value);
                }}
                placeholder="e.g. 5000"
                keyboardType="decimal-pad"
                maxLength={18}
                accessibilityLabel="Budget amount in rupees"
              />
              <Text style={[styles.formLabel, { color: colors.muted }]}>PERIOD</Text>
              <View style={styles.periodRow}>
                {(['monthly', 'weekly'] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setPeriod(value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: period === value }}
                    style={[
                      styles.periodChip,
                      { backgroundColor: period === value ? `${colors.primary}20` : colors.surfaceRaised, borderColor: period === value ? colors.primary : colors.border },
                    ]}
                  >
                    <Text style={[styles.categoryText, { color: period === value ? colors.primarySoft : colors.text }]}>{value === 'monthly' ? 'Monthly' : 'Weekly'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {formError ? <Text style={[styles.formError, { color: colors.red }]}>{formError}</Text> : null}
              <ToolButton label="Create budget" onPress={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!categoryId || !amount} />
            </>
          ) : null}
        </ToolCard>
      ) : null}

      {budgetsQuery.isLoading ? <ToolLoading /> : null}
      {budgetsQuery.isError ? <ToolError message={budgetsQuery.error.message} onRetry={() => void budgetsQuery.refetch()} /> : null}
      {!budgetsQuery.isLoading && !budgetsQuery.isError && budgets.length === 0 ? (
        <ToolEmptyState
          title="Start with a spending plan"
          description="Create your first category budget to see what you’ve spent and how much is left."
          action={<ToolButton label="Add your first budget" onPress={() => setFormOpen(true)} />}
        />
      ) : null}
      {!budgetsQuery.isLoading && !budgetsQuery.isError && budgets.length > 0 ? (
        <>
          <ToolSectionTitle>Active budgets</ToolSectionTitle>
          {budgets.map((budget) => {
            const tone = budget.status === 'exceeded' ? 'red' : budget.status === 'warning' ? 'amber' : 'green';
            const progressColor = budget.status === 'exceeded' ? colors.red : budget.status === 'warning' ? colors.amber : colors.green;
            const percentage = new DecimalJS(budget.percentageUsed);
            const barWidth = DecimalJS.min(100, DecimalJS.max(0, percentage)).toNumber();
            return (
              <ToolCard key={budget.id} style={styles.budgetCard}>
                <View style={styles.budgetHeader}>
                  <View style={styles.budgetTitleGroup}>
                    <Text style={[styles.categoryName, { color: colors.text }]}>{budget.categoryName ?? 'Uncategorised'}</Text>
                    <Text style={[styles.budgetMeta, { color: colors.muted }]}>{budget.period === 'weekly' ? 'Weekly' : 'Monthly'} · {formatShortDate(budget.periodStart)} – {formatShortDate(budget.periodEnd)}</Text>
                  </View>
                  <ToolBadge label={budget.status === 'exceeded' ? 'Exceeded' : budget.status === 'warning' ? 'Near limit' : 'On track'} tone={tone} />
                </View>
                <Text style={[styles.amountLine, { color: colors.text }]}>
                  {formatINR(budget.spentAmount)} <Text style={{ color: colors.muted, fontWeight: '500' }}>of {formatINR(budget.budgetAmount)}</Text>
                </Text>
                <View
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.max(0, barWidth)) }}
                  accessibilityLabel={`${budget.categoryName ?? 'Budget'} spent`}
                  style={[styles.track, { backgroundColor: colors.surfaceRaised }]}
                >
                  <View style={[styles.fill, { backgroundColor: progressColor, width: `${barWidth}%` }]} />
                </View>
                <View style={styles.budgetFooter}>
                  <Text style={[styles.percent, { color: progressColor }]}>{budget.percentageUsed}% spent</Text>
                  <Text style={[styles.remaining, { color: colors.muted }]}>{new DecimalJS(budget.remainingAmount).isNegative() ? `${formatINR(new DecimalJS(budget.remainingAmount).abs().toString())} over` : `${formatINR(budget.remainingAmount)} left`}</Text>
                </View>
              </ToolCard>
            );
          })}
        </>
      ) : null}
    </FinanceScreen>
  );
}

const styles = StyleSheet.create({
  addButton: { minHeight: 38, borderRadius: 12, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  budgetCard: { gap: 13 },
  budgetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  budgetTitleGroup: { flex: 1, minWidth: 0, gap: 4 },
  categoryName: { fontSize: 16, fontWeight: '800' },
  budgetMeta: { fontSize: 11 },
  amountLine: { fontSize: 14, fontWeight: '800' },
  track: { height: 9, overflow: 'hidden', borderRadius: 99 },
  fill: { height: '100%', borderRadius: 99 },
  budgetFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  percent: { fontSize: 11, fontWeight: '800' },
  remaining: { fontSize: 11, fontWeight: '600' },
  formLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 9 },
  categoryText: { fontSize: 12, fontWeight: '700' },
  periodRow: { flexDirection: 'row', gap: 8 },
  periodChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10 },
  formError: { fontSize: 12 },
});
