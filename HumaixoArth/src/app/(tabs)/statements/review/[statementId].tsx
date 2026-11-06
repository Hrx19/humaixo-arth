import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { EmptyState, InfoPill, PrimaryButton, SectionHeader, SurfaceCard } from '@/components/finance-ui';
import { formatINR, useFinanceColors } from '@/constants/finance-theme';
import {
  StatementImportService,
  type StatementConfirmation,
  type StatementCorrection,
  type StatementNormalizedRow,
  type StatementReview,
} from '@/services/statement-import-service';

function rowConfidence(row: StatementNormalizedRow): number {
  const scores = Object.values(row.provenance).flatMap((source) => source ? [source.confidence] : []);
  return scores.length ? Math.min(...scores) : 0;
}

export default function StatementReviewScreen(): React.JSX.Element {
  const { statementId } = useLocalSearchParams<{ statementId: string }>();
  const router = useRouter();
  const colors = useFinanceColors();
  const { status, token } = useAuth();
  const [review, setReview] = useState<StatementReview | null>(null);
  const [rows, setRows] = useState<StatementNormalizedRow[]>([]);
  const [confirmed, setConfirmed] = useState<StatementConfirmation | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !statementId) return;
    let active = true;
    void StatementImportService.getPreview(token, statementId)
      .then((result) => {
        if (!active) return;
        setReview(result);
        setRows(result.rows.map((item) => item.normalized));
        if (result.result) setConfirmed(result.result);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load this statement.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [statementId, token]);

  const summary = useMemo(() => rows.reduce(
    (totals, row) => {
      if (row.amount === null) return totals;
      if (row.direction === 'credit') totals.credits = new Decimal(totals.credits).plus(row.amount).toString();
      if (row.direction === 'debit') totals.debits = new Decimal(totals.debits).plus(row.amount).toString();
      return totals;
    },
    { credits: '0', debits: '0' },
  ), [rows]);

  const updateRow = (rowNumber: number, patch: Partial<StatementNormalizedRow>): void => {
    setRows((current) => current.map((row) => row.rowNumber === rowNumber ? { ...row, ...patch } : row));
  };

  const confirmImport = async (): Promise<void> => {
    if (!token || !review || !statementId) return;
    setConfirming(true);
    setError(null);
    try {
      const corrections: StatementCorrection[] = rows.flatMap((row, index) => {
        const original = review.rows[index]?.normalized;
        if (!original) return [];
        const changed: StatementCorrection = { rowNumber: row.rowNumber };
        if (row.date !== original.date) changed.date = row.date;
        if (row.time !== original.time) changed.time = row.time;
        if (row.amount !== original.amount) changed.amount = row.amount;
        if (row.direction !== original.direction) changed.direction = row.direction;
        if (row.description !== original.description) changed.description = row.description;
        if (row.counterparty !== original.counterparty) changed.counterparty = row.counterparty;
        if (row.referenceNumber !== original.referenceNumber) changed.referenceNumber = row.referenceNumber;
        return Object.keys(changed).length > 1 ? [changed] : [];
      });
      const result = await StatementImportService.confirm(token, statementId, corrections);
      setConfirmed(result);
      Alert.alert('Import confirmed', `${result.importedRows} new rows added. ${result.duplicateRows} duplicates and ${result.rejectedRows} rows were reported.`);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Could not confirm this statement.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <FinanceScreen title={confirmed ? 'Import complete' : 'Review statement'} subtitle={review?.fileName ?? 'Verify extracted values before importing.'}>
      {status !== 'authenticated' ? (
        <EmptyState title="Sign in to review" description="Statement previews are only available to the authenticated account owner." />
      ) : loading ? (
        <SurfaceCard><Text style={{ color: colors.text }}>Loading statement preview…</Text></SurfaceCard>
      ) : error && !review ? (
        <EmptyState title="Statement unavailable" description={error} action={<PrimaryButton label="Back to upload" onPress={() => router.replace('/(tabs)/statements/upload')} />} />
      ) : confirmed ? (
        <SurfaceCard style={styles.successCard}>
          <InfoPill label="Confirmed" tone="green" />
          <Text style={[styles.successTitle, { color: colors.text }]}>{confirmed.importedRows} transactions imported</Text>
          <Text style={[styles.secondary, { color: colors.muted }]}>{confirmed.duplicateRows} duplicates · {confirmed.rejectedRows} rows reported</Text>
          <Text style={[styles.secondary, { color: colors.muted }]}>Updated account balance: {formatINR(confirmed.currentBalance)}</Text>
          <PrimaryButton label="Done" onPress={() => router.replace('/transactions')} />
        </SurfaceCard>
      ) : review ? (
        <>
          <SurfaceCard style={styles.summaryCard}>
            <View style={styles.summary}>
              <SummaryItem label="Credits" value={formatINR(summary.credits)} color={colors.green} />
              <SummaryItem label="Debits" value={formatINR(summary.debits)} color={colors.red} />
              <SummaryItem label="Rows" value={String(rows.length)} color={colors.text} />
              <SummaryItem label="Flagged" value={String(review.issues.length)} color={review.issues.length ? colors.amber : colors.green} />
            </View>
            <Text style={[styles.secondary, { color: colors.muted }]}>
              {review.account ? `${review.account.institution} · ${review.account.name}` : 'Account unavailable'} · Values missing from the source remain unknown.
            </Text>
          </SurfaceCard>

          <SectionHeader title="Transactions (editable)" />
          <ScrollView style={styles.rows} contentContainerStyle={styles.rowsContent} nestedScrollEnabled>
            {rows.map((row) => {
              const confidence = rowConfidence(row);
              const flagged = row.issues.length > 0 || confidence < 0.75;
              const rowColor = row.issues.some((issue) => issue.toLowerCase().includes('missing') || issue.toLowerCase().includes('invalid'))
                ? 'rgba(255,99,117,0.12)'
                : flagged ? 'rgba(245,184,75,0.14)' : colors.surface;
              return (
                <SurfaceCard key={row.rowNumber} style={[styles.rowCard, { backgroundColor: rowColor, borderColor: flagged ? colors.amber : colors.border }]}>
                  <View style={styles.rowHeader}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>Row {row.rowNumber}</Text>
                    <InfoPill label={`${Math.round(confidence * 100)}% confidence`} tone={confidence < 0.75 ? 'amber' : 'green'} />
                  </View>
                  {row.issues.map((issue) => <Text key={issue} style={[styles.rowIssue, { color: colors.red }]}>{issue}</Text>)}
                  <Field label="Date (ISO 8601)" value={row.date ?? ''} placeholder="Unknown" onChangeText={(value) => updateRow(row.rowNumber, { date: value || null })} />
                  <Field label="Time (unknown when absent in source)" value={row.time ?? ''} placeholder="Unknown" onChangeText={(value) => updateRow(row.rowNumber, { time: value || null })} />
                  <Field label="Amount" value={row.amount ?? ''} placeholder="Unknown" keyboardType="decimal-pad" onChangeText={(value) => {
                    if (!value) updateRow(row.rowNumber, { amount: null });
                    else if (/^\d*(?:\.\d{0,2})?$/.test(value)) updateRow(row.rowNumber, { amount: value });
                  }} />
                  <View style={styles.directionRow}>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Direction</Text>
                    {(['debit', 'credit'] as const).map((direction) => (
                      <TouchableOpacity
                        key={direction}
                        onPress={() => updateRow(row.rowNumber, { direction })}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: row.direction === direction }}
                        style={[styles.directionButton, { borderColor: row.direction === direction ? colors.primary : colors.border }]}
                      >
                        <Text style={{ color: colors.text }}>{direction}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Field label="Description" value={row.description ?? ''} placeholder="Unknown" onChangeText={(value) => updateRow(row.rowNumber, { description: value || null })} />
                  <Field label="Counterparty" value={row.counterparty ?? ''} placeholder="Unknown" onChangeText={(value) => updateRow(row.rowNumber, { counterparty: value || null })} />
                  <Field label="Reference" value={row.referenceNumber ?? ''} placeholder="Unknown" onChangeText={(value) => updateRow(row.rowNumber, { referenceNumber: value || null })} />
                  <Text style={[styles.rawText, { color: colors.subtle }]} numberOfLines={3}>Original: {review.rows.find((item) => item.normalized.rowNumber === row.rowNumber)?.raw?.rawText ?? 'unavailable'}</Text>
                </SurfaceCard>
              );
            })}
          </ScrollView>

          {review.issues.length > 0 ? (
            <SurfaceCard style={styles.issuesCard}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Import issue report</Text>
              {review.issues.map((issue, index) => (
                <Text key={`${issue.rowNumber}-${issue.code}-${index}`} style={[styles.secondary, { color: colors.amber }]}>
                  {issue.rowNumber > 0 ? `Row ${issue.rowNumber}: ` : ''}{issue.message}
                </Text>
              ))}
            </SurfaceCard>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
          <PrimaryButton label="Confirm import" onPress={() => void confirmImport()} loading={confirming} disabled={review.status === 'confirmed'} />
        </>
      ) : null}
    </FinanceScreen>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChangeText,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText(value: string): void;
  keyboardType?: 'default' | 'decimal-pad';
}): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.subtle}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        accessibilityLabel={label}
      />
    </View>
  );
}

function SummaryItem({ label, value, color }: { label: string; value: string; color: string }): React.JSX.Element {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: { gap: 14 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryItem: { flexGrow: 1, minWidth: '40%', gap: 3 },
  summaryValue: { fontSize: 16, fontWeight: '800' },
  summaryLabel: { color: '#9694a5', fontSize: 11 },
  secondary: { fontSize: 12, lineHeight: 18 },
  rows: { maxHeight: 580 },
  rowsContent: { gap: 10, paddingBottom: 8 },
  rowCard: { gap: 9, borderWidth: 1 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '800' },
  rowIssue: { fontSize: 12, lineHeight: 17 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 11, fontWeight: '700' },
  input: { minHeight: 40, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13 },
  directionRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  directionButton: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  rawText: { fontSize: 10, lineHeight: 15 },
  issuesCard: { gap: 7, borderColor: '#f5b84b' },
  error: { fontSize: 13, lineHeight: 19 },
  successCard: { alignItems: 'flex-start', gap: 12 },
  successTitle: { fontSize: 20, fontWeight: '800' },
});
