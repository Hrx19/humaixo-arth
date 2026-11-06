import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FinanceScreen } from '@/components/finance-screen';
import { useAuth } from '@/auth/auth-context';
import { useFinanceColors } from '@/constants/finance-theme';
import {
  formatDecimalINR,
  TransactionIntelligenceService,
  type TransactionDetail,
} from '@/services/transaction-intelligence-service';

export default function TransactionDetailScreen(): React.JSX.Element {
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useFinanceColors();
  const { token, status } = useAuth();
  const [categoryOverride, setCategoryOverride] = useState<string | null>(null);
  const [noteOverride, setNoteOverride] = useState<string | null>(null);
  const detailQuery = useQuery({
    queryKey: ['transaction-intelligence', 'detail', token, id],
    queryFn: () => TransactionIntelligenceService.getDetail(token!, id!),
    enabled: Boolean(token && id),
  });
  const updateMutation = useMutation({
    mutationFn: (input: { category?: string; note?: string | null }) =>
      TransactionIntelligenceService.update(token!, id!, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['transaction-intelligence', 'detail', token, id], updated);
      setCategoryOverride(null);
      setNoteOverride(null);
      await queryClient.invalidateQueries({ queryKey: ['transaction-intelligence', 'list', token] });
      Alert.alert('Saved', 'Your transaction changes were saved. The original imported values remain unchanged.');
    },
    onError: (error: Error) => Alert.alert('Could not save changes', error.message),
  });

  if (status === 'loading') {
    return <FinanceScreen title="Transaction"><ActivityIndicator color={colors.primarySoft} /></FinanceScreen>;
  }
  if (!token) {
    return <FinanceScreen title="Transaction"><Text style={{ color: colors.muted }}>Sign in to view transaction details.</Text></FinanceScreen>;
  }
  if (detailQuery.isLoading) {
    return <FinanceScreen title="Transaction"><ActivityIndicator color={colors.primarySoft} /></FinanceScreen>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <FinanceScreen title="Transaction">
        <Text style={{ color: colors.red }}>{detailQuery.error?.message ?? 'Transaction was not found.'}</Text>
        <TouchableOpacity onPress={() => void detailQuery.refetch()} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </FinanceScreen>
    );
  }

  const transaction = detailQuery.data;
  const category = categoryOverride ?? transaction.category;
  const note = noteOverride ?? transaction.note ?? '';
  const hasChanges = category.trim() !== transaction.category || note.trim() !== (transaction.note ?? '');
  const save = (): void => {
    const changed: { category?: string; note?: string | null } = {};
    if (category.trim() !== transaction.category) changed.category = category.trim();
    if (note.trim() !== (transaction.note ?? '')) changed.note = note.trim() || null;
    if (Object.keys(changed).length) updateMutation.mutate(changed);
  };

  return (
    <FinanceScreen title="Transaction details" subtitle="Review the imported record and its source information." activeTab="transactions">
      <ScrollView
        style={styles.innerScroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <View style={[styles.amountCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.amount, { color: transaction.type === 'credit' ? colors.green : colors.red }]}>
            {transaction.type === 'credit' ? '+' : '−'}{formatDecimalINR(transaction.amount)}
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>{transaction.counterparty || transaction.merchant || 'Unknown counterparty'}</Text>
          <Text style={[styles.muted, { color: colors.muted }]}>{transaction.date ? new Date(transaction.date).toLocaleString('en-IN') : 'Date and time unavailable'}</Text>
          <Text style={[styles.muted, { color: colors.muted }]}>Source: {sourceLabel(transaction.source)} · Confidence: {Math.round(transaction.confidence * 100)}%</Text>
        </View>

        <Section title="EDIT YOUR DETAILS" colors={colors}>
          <Field label="Category" value={category} onChangeText={setCategoryOverride} colors={colors} />
          <Field label="Personal note" value={note} onChangeText={setNoteOverride} colors={colors} multiline />
          <TouchableOpacity
            disabled={!hasChanges || updateMutation.isPending || !category.trim()}
            onPress={save}
            style={[styles.button, { backgroundColor: colors.primary, opacity: !hasChanges || updateMutation.isPending || !category.trim() ? 0.55 : 1 }]}
          >
            {updateMutation.isPending
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={styles.buttonText}>Save changes</Text>}
          </TouchableOpacity>
          <Text style={[styles.hint, { color: colors.subtle }]}>Your corrections are recorded separately. They do not overwrite the imported source data.</Text>
        </Section>

        <Section title="TRANSACTION INFORMATION" colors={colors}>
          <InfoRow label="Description" value={transaction.description} colors={colors} />
          <InfoRow label="Merchant" value={transaction.merchant} colors={colors} />
          <InfoRow label="Counterparty" value={transaction.counterparty} colors={colors} />
          <InfoRow label="Account" value={transaction.accountName} colors={colors} />
          <InfoRow label="Payment method" value={transaction.paymentMethod} colors={colors} />
          <InfoRow label="Reference number" value={transaction.referenceNumber} colors={colors} />
          <InfoRow label="Transaction time" value={transaction.time} colors={colors} />
          <InfoRow label="Balance before" value={transaction.balanceBefore ? formatDecimalINR(transaction.balanceBefore) : null} colors={colors} />
          <InfoRow label="Balance after" value={transaction.balanceAfter ? formatDecimalINR(transaction.balanceAfter) : null} colors={colors} />
          <InfoRow label="Source row" value={transaction.sourceRowNumber ? String(transaction.sourceRowNumber) : null} colors={colors} />
        </Section>

        <Section title="SOURCE & PROVENANCE" colors={colors}>
          <InfoRow label="Source type" value={sourceLabel(transaction.source)} colors={colors} />
          <InfoRow label="Confidence" value={`${Math.round(transaction.confidence * 100)}%`} colors={colors} />
          {transaction.statement ? (
            <TouchableOpacity
              onPress={() => router.push(`/(tabs)/statements/review/${transaction.statement!.id}`)}
              style={[styles.sourceButton, { borderColor: colors.border }]}
              accessibilityRole="link"
            >
              <Text style={[styles.sourceButtonText, { color: colors.primarySoft }]}>Open source statement · {transaction.statement.fileName}</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.subheading, { color: colors.text }]}>Field provenance</Text>
          <JsonPanel value={transaction.provenance} emptyText="No field-level provenance was stored." colors={colors} />
          <Text style={[styles.subheading, { color: colors.text }]}>Original source row</Text>
          <JsonPanel value={transaction.rawSourceData} emptyText="No raw source row is available." colors={colors} />
          <Text style={[styles.subheading, { color: colors.text }]}>Corrections supplied at import</Text>
          <JsonPanel value={transaction.userCorrections} emptyText="No import-time corrections were recorded. The original source row above is preserved." colors={colors} />
          {transaction.userEdits.length ? (
            <>
              <Text style={[styles.subheading, { color: colors.text }]}>Edit history</Text>
              <JsonPanel value={transaction.userEdits} emptyText="" colors={colors} />
            </>
          ) : null}
        </Section>
      </ScrollView>
    </FinanceScreen>
  );
}

function sourceLabel(source: TransactionDetail['source']): string {
  if (source === 'statement') return 'Imported from statement';
  if (source === 'sms') return 'Parsed from SMS';
  return 'User entered';
}

function Section({
  title,
  children,
  colors,
}: React.PropsWithChildren<{ title: string; colors: ReturnType<typeof useFinanceColors> }>): React.JSX.Element {
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  colors,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  colors: ReturnType<typeof useFinanceColors>;
  multiline?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        maxLength={multiline ? 500 : 60}
        placeholder={label}
        placeholderTextColor={colors.subtle}
        style={[styles.input, multiline && styles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
      />
    </View>
  );
}

function InfoRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string | null | undefined;
  colors: ReturnType<typeof useFinanceColors>;
}): React.JSX.Element {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
      <Text selectable style={[styles.infoValue, { color: colors.text }]}>{value || 'Unknown'}</Text>
    </View>
  );
}

function JsonPanel({
  value,
  emptyText,
  colors,
}: {
  value: unknown;
  emptyText: string;
  colors: ReturnType<typeof useFinanceColors>;
}): React.JSX.Element {
  const serialized = value === null || value === undefined ? '' : JSON.stringify(value, null, 2);
  return (
    <Text selectable style={[styles.json, { color: colors.muted, backgroundColor: colors.background, borderColor: colors.border }]}>
      {serialized || emptyText}
    </Text>
  );
}

const styles = StyleSheet.create({
  innerScroll: { maxHeight: 620 },
  content: { paddingBottom: 22, gap: 12 },
  amountCard: { alignItems: 'center', gap: 8, padding: 22, borderWidth: 1, borderRadius: 18 },
  amount: { fontSize: 28, fontWeight: '900' },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  muted: { fontSize: 12, textAlign: 'center' },
  section: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 11 },
  sectionTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  field: { gap: 5 },
  fieldLabel: { fontSize: 11, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, minHeight: 42, fontSize: 13 },
  multiline: { minHeight: 80, paddingTop: 10, textAlignVertical: 'top' },
  button: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 15 },
  buttonText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  hint: { fontSize: 11, lineHeight: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  infoLabel: { flex: 1, fontSize: 12 },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '600' },
  sourceButton: { borderWidth: 1, padding: 11, borderRadius: 11 },
  sourceButtonText: { fontSize: 12, fontWeight: '700' },
  subheading: { fontSize: 12, fontWeight: '800', marginTop: 4 },
  json: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 10, lineHeight: 15, overflow: 'hidden' },
});
