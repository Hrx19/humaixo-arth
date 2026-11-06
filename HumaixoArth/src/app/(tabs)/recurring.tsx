import DecimalJS from 'decimal.js';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
  type DetectedRecurringPattern,
} from '@/services/money-tools-service';

function validAmount(value: string): boolean {
  return /^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/.test(value) && new DecimalJS(value).isPositive();
}

function dateToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : parsed.toISOString();
}

function intervalLabel(interval: DetectedRecurringPattern['interval']): string {
  switch (interval) {
    case 'biweekly': return 'every 2 weeks';
    case 'quarterly': return 'quarterly';
    case 'yearly': return 'yearly';
    case 'weekly': return 'weekly';
    default: return 'monthly';
  }
}

export default function RecurringScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { token, status } = useAuth();
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const patternsQuery = useQuery({
    queryKey: ['money-tools', 'recurring-patterns', token],
    queryFn: () => MoneyToolsService.getDetectedRecurring(token!),
    enabled: Boolean(token && status === 'authenticated'),
  });
  const invalidatePatterns = async () => {
    await queryClient.invalidateQueries({ queryKey: ['money-tools', 'recurring-patterns', token] });
  };
  const confirmMutation = useMutation({
    mutationFn: (input: { patternKey: string; amount?: string; nextExpectedDate?: string }) => {
      if (!token) throw new Error('Sign in to confirm a recurring pattern.');
      return MoneyToolsService.confirmRecurring(token, input);
    },
    onSuccess: invalidatePatterns,
    onError: (error: Error) => setFormError(error.message),
  });
  const dismissMutation = useMutation({
    mutationFn: (patternKey: string) => {
      if (!token) throw new Error('Sign in to dismiss a recurring pattern.');
      return MoneyToolsService.dismissRecurring(token, patternKey);
    },
    onSuccess: invalidatePatterns,
    onError: (error: Error) => setFormError(error.message),
  });

  if (status === 'loading') {
    return <FinanceScreen title="Recurring" activeTab="tools"><ToolLoading /></FinanceScreen>;
  }
  if (!token) {
    return (
      <FinanceScreen title="Recurring transactions" subtitle="Review regular payments detected in your activity." activeTab="tools">
        <ToolEmptyState title="Sign in to review patterns" description="Your recurring transaction suggestions stay private to your account." action={<ToolButton label="Sign in" onPress={() => router.push('/login')} />} />
      </FinanceScreen>
    );
  }

  const patterns = patternsQuery.data ?? [];
  return (
    <FinanceScreen title="Recurring transactions" subtitle="Confirm regular activity and keep expected amounts and dates up to date." activeTab="tools">
      {patternsQuery.isLoading ? <ToolLoading /> : null}
      {patternsQuery.isError ? <ToolError message={patternsQuery.error.message} onRetry={() => void patternsQuery.refetch()} /> : null}
      {confirmMutation.isError || dismissMutation.isError ? (
        <ToolError
          message={formError || 'The pattern could not be updated.'}
          onRetry={() => {
            if (confirmMutation.isError && confirmMutation.variables) {
              confirmMutation.mutate(confirmMutation.variables);
            } else if (dismissMutation.isError && dismissMutation.variables) {
              dismissMutation.mutate(dismissMutation.variables);
            }
          }}
        />
      ) : null}
      {!patternsQuery.isLoading && !patternsQuery.isError && patterns.length === 0 ? (
        <ToolEmptyState
          title="No recurring patterns detected"
          description="Once you have a few months of transaction history, regular payments will appear here for review."
          action={<ToolButton label="View activity" onPress={() => router.push('/transactions')} secondary />}
        />
      ) : null}
      {patterns.length > 0 ? (
        <>
          <ToolSectionTitle>Suggested patterns</ToolSectionTitle>
          {patterns.map((pattern) => {
            const confidenceTone = pattern.confidence >= 0.85 ? 'green' : pattern.confidence >= 0.65 ? 'amber' : 'muted';
            const confidenceLabel = pattern.confidence >= 0.85 ? 'High confidence' : pattern.confidence >= 0.65 ? 'Medium confidence' : 'Low confidence';
            const editing = editingKey === pattern.patternKey;
            const currentAmount = amounts[pattern.patternKey] ?? pattern.amount;
            const currentDate = dates[pattern.patternKey] ?? pattern.nextExpectedDate.slice(0, 10);
            const submitting = confirmMutation.isPending || dismissMutation.isPending;
            return (
              <ToolCard key={pattern.patternKey} style={styles.patternCard}>
                <View style={styles.patternHeader}>
                  <View style={styles.patternCopy}>
                    <Text style={[styles.patternName, { color: colors.text }]} numberOfLines={1}>{pattern.counterparty || pattern.description}</Text>
                    <Text style={[styles.patternMeta, { color: colors.muted }]}>{intervalLabel(pattern.interval)} · {pattern.occurrenceCount} observed payments</Text>
                  </View>
                  <ToolBadge label={confidenceLabel} tone={confidenceTone} />
                </View>
                <Text style={[styles.amountLine, { color: colors.text }]}>{formatINR(pattern.amount)}<Text style={{ color: colors.muted, fontWeight: '500' }}> / {intervalLabel(pattern.interval)}</Text></Text>
                <Text style={[styles.expectedDate, { color: colors.muted }]}>Next expected · {formatShortDate(pattern.nextExpectedDate)}</Text>
                {editing ? (
                  <View style={[styles.editPanel, { backgroundColor: colors.surfaceRaised }]}>
                    <ToolField
                      label="EXPECTED AMOUNT · INR"
                      value={currentAmount}
                      onChangeText={(value) => {
                        if (value === '' || /^(?:0|[1-9]\d{0,14})(?:\.\d{0,2})?$/.test(value)) setAmounts((previous) => ({ ...previous, [pattern.patternKey]: value }));
                      }}
                      keyboardType="decimal-pad"
                      maxLength={18}
                      accessibilityLabel="Edit recurring expected amount in rupees"
                    />
                    <ToolField
                      label="NEXT EXPECTED DATE · YYYY-MM-DD"
                      value={currentDate}
                      onChangeText={(value) => setDates((previous) => ({ ...previous, [pattern.patternKey]: value }))}
                      placeholder="2026-12-15"
                      maxLength={10}
                      accessibilityLabel="Edit next expected recurring date"
                    />
                    {formError ? <Text style={[styles.formError, { color: colors.red }]}>{formError}</Text> : null}
                    <ToolButton
                      label="Save & confirm pattern"
                      onPress={() => {
                        const nextExpectedDate = dateToIso(currentDate);
                        if (!validAmount(currentAmount)) {
                          setFormError('Enter a positive amount with up to two decimal places.');
                          return;
                        }
                        if (!nextExpectedDate) {
                          setFormError('Enter a valid date in YYYY-MM-DD format.');
                          return;
                        }
                        setFormError('');
                        confirmMutation.mutate({
                          patternKey: pattern.patternKey,
                          amount: currentAmount,
                          nextExpectedDate,
                        });
                      }}
                      loading={confirmMutation.isPending && confirmMutation.variables?.patternKey === pattern.patternKey}
                      disabled={confirmMutation.isPending && confirmMutation.variables?.patternKey !== pattern.patternKey}
                    />
                  </View>
                ) : (
                  <View style={styles.actions}>
                    <ToolButton
                      label="Confirm pattern"
                      onPress={() => {
                        setFormError('');
                        confirmMutation.mutate({ patternKey: pattern.patternKey });
                      }}
                      loading={confirmMutation.isPending && confirmMutation.variables?.patternKey === pattern.patternKey}
                    />
                    <ToolButton
                      label="Edit amount or date"
                      onPress={() => {
                        setEditingKey(pattern.patternKey);
                        setFormError('');
                      }}
                      secondary
                      disabled={submitting}
                    />
                    <ToolButton
                      label="Dismiss"
                      onPress={() => dismissMutation.mutate(pattern.patternKey)}
                      secondary
                      destructive
                      loading={dismissMutation.isPending && dismissMutation.variables === pattern.patternKey}
                      disabled={submitting}
                    />
                  </View>
                )}
              </ToolCard>
            );
          })}
        </>
      ) : null}
    </FinanceScreen>
  );
}

const styles = StyleSheet.create({
  patternCard: { gap: 12 },
  patternHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  patternCopy: { flex: 1, minWidth: 0, gap: 4 },
  patternName: { fontSize: 15, fontWeight: '800' },
  patternMeta: { fontSize: 11 },
  amountLine: { fontSize: 16, fontWeight: '800' },
  expectedDate: { fontSize: 12 },
  actions: { gap: 8, marginTop: 2 },
  editPanel: { padding: 12, borderRadius: 14, gap: 12 },
  formError: { fontSize: 12 },
});
