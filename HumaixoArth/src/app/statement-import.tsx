import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { EmptyState, InfoPill, PrimaryButton, SectionHeader, SurfaceCard } from '@/components/finance-ui';
import { FinanceTheme, formatDate, formatINR } from '@/constants/finance-theme';
import { FinanceService } from '@/services/finance-service';
import { useFinanceStore } from '@/store/finance-store';
import type { FinanceAccount, StatementImportHistoryItem, StatementPreview } from '@/types/finance';

const MAX_CSV_BYTES = 5_000_000;

export default function StatementImportScreen(): React.JSX.Element {
  const router = useRouter();
  const { status, token } = useAuth();
  const isGuest = status !== 'authenticated' || !token;
  const accounts = useFinanceStore((state) => state.accounts);
  const refreshDashboard = useFinanceStore((state) => state.refreshDashboard);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [history, setHistory] = useState<StatementImportHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAccountId = selectedAccountId ?? accounts[0]?.id;

  useEffect(() => {
    if (isGuest || !token) return;
    let active = true;
    void FinanceService.getStatementHistory(token)
      .then((result) => { if (active) setHistory(result); })
      .catch(() => { if (active) setHistory([]); });
    return () => { active = false; };
  }, [isGuest, token]);

  const pickAndPreview = async (): Promise<void> => {
    if (isGuest || !token) {
      router.push('/login');
      return;
    }
    if (!activeAccountId) {
      setError('Add and select an account before importing a statement.');
      return;
    }

    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (!asset.name.toLowerCase().endsWith('.csv')) {
        throw new Error('Choose a CSV file exported from your bank or wallet.');
      }
      if (asset.size !== undefined && asset.size > MAX_CSV_BYTES) {
        throw new Error('CSV files must be 5 MB or smaller.');
      }

      const text = Platform.OS === 'web' && asset.file
        ? await asset.file.text()
        : await new File(asset.uri).text();
      // A UTF-16 estimate is conservative and works on Hermes without relying
      // on a TextEncoder polyfill that may not exist in a native runtime.
      if (text.length * 2 > MAX_CSV_BYTES) {
        throw new Error('CSV files must be 5 MB or smaller.');
      }
      if (!text.trim()) throw new Error('The selected CSV file is empty.');

      const nextPreview = await FinanceService.previewStatement(token, {
        accountId: activeAccountId,
        fileName: asset.name,
        csvContent: text,
      });
      setFileName(asset.name);
      setCsvContent(text);
      setPreview(nextPreview);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : 'Could not preview this CSV file.');
    } finally {
      setLoading(false);
    }
  };

  const importStatement = async (): Promise<void> => {
    if (!token || !activeAccountId || !fileName || !csvContent || !preview) {
      setError('Choose and preview a statement before importing.');
      return;
    }
    if (preview.alreadyImported || preview.newRows === 0) {
      setError('There are no new transactions to import from this file.');
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const result = await FinanceService.importStatement(token, {
        accountId: activeAccountId,
        fileName,
        csvContent,
      });
      await refreshDashboard(token);
      setHistory(await FinanceService.getStatementHistory(token));
      setPreview(null);
      setCsvContent(null);
      setFileName(null);
      Alert.alert(
        'Statement imported',
        `${result.importedRows} transactions added · ${result.duplicateRows} duplicates skipped · ${result.rejectedRows} rows need review.`,
      );
      router.replace('/transactions');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Statement import failed.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <FinanceScreen title="Import statement" subtitle="Preview, verify and import your bank activity into a private ledger.">
      {isGuest ? (
        <EmptyState title="Sign in to import securely" description="Your statement will be validated and attached only to your account." action={<PrimaryButton label="Login" onPress={() => router.push('/login')} />} />
      ) : accounts.length === 0 ? (
        <EmptyState title="Create an account first" description="An account gives every row a ledger owner and opening-balance baseline." action={<PrimaryButton label="Add an account" onPress={() => router.push('/accounts')} />} />
      ) : (
        <>
          <SurfaceCard style={styles.privacyCard}>
            <View style={styles.privacyIcon}><Text style={styles.privacyIconText}>▣</Text></View>
            <View style={styles.privacyText}>
              <Text style={styles.privacyTitle}>Statement data is sensitive</Text>
              <Text style={styles.privacyDescription}>Only transaction fields are stored. Raw statement text is used to preview and import, then kept only in this screen&apos;s memory.</Text>
            </View>
          </SurfaceCard>

          <View>
            <SectionHeader title="Choose an account" />
            <View style={styles.accountList}>
              {accounts.map((account) => (
                <AccountChoice key={account.id} account={account} selected={activeAccountId === account.id} onPress={() => { setSelectedAccountId(account.id); setPreview(null); setCsvContent(null); }} />
              ))}
            </View>
          </View>

          <SurfaceCard style={styles.uploadCard}>
            <View style={styles.uploadIcon}><Text style={styles.uploadIconText}>⇧</Text></View>
            <Text style={styles.uploadTitle}>{fileName ?? 'Select a bank CSV statement'}</Text>
            <Text style={styles.uploadDescription}>CSV up to 5 MB · up to 10,000 rows · common Indian bank headers supported</Text>
            <PrimaryButton label={loading ? 'Reading and previewing…' : 'Choose CSV and preview'} onPress={() => void pickAndPreview()} loading={loading} />
          </SurfaceCard>

          {preview ? (
            <View>
              <SectionHeader title="Preview before import" />
              <SurfaceCard style={styles.previewCard}>
                <View style={styles.previewHeader}>
                  <View style={styles.previewHeading}>
                    <Text style={styles.previewTitle} numberOfLines={1}>{preview.fileName}</Text>
                    <Text style={styles.previewSubtitle}>{preview.account.institution} · {preview.account.name}</Text>
                  </View>
                  {preview.alreadyImported ? <InfoPill label="Already imported" tone="amber" /> : <InfoPill label="Ready to review" tone="green" />}
                </View>
                <View style={styles.countGrid}>
                  <CountCard label="New rows" value={preview.newRows} color={FinanceTheme.colors.green} />
                  <CountCard label="Duplicates" value={preview.duplicateRows} color={FinanceTheme.colors.amber} />
                  <CountCard label="Needs review" value={preview.rejectedRows} color={FinanceTheme.colors.red} />
                  <CountCard label="Rows with balance" value={preview.rowsWithBalance} color={FinanceTheme.colors.primarySoft} />
                </View>
                <Text style={styles.periodText}>
                  Statement period: {preview.period.from ? formatDate(preview.period.from) : 'unknown'} – {preview.period.to ? formatDate(preview.period.to) : 'unknown'}
                </Text>
                <Text style={styles.coverageText}>
                  {preview.personTransfers} possible person transfers identified. Balance-at-time is most reliable when the CSV includes a running balance column.
                </Text>

                <Text style={styles.tableHeading}>Sample rows</Text>
                {preview.sample.slice(0, 6).map((row, index) => (
                  <View key={`${row.date}-${row.amount}-${index}`} style={styles.sampleRow}>
                    <View style={styles.sampleMain}>
                      <Text style={styles.sampleName} numberOfLines={1}>{row.counterparty ?? row.merchant}</Text>
                      <Text style={styles.sampleMeta}>{formatDate(row.date)} · {row.category} · {row.paymentMethod ?? 'Statement'}</Text>
                      {row.balanceAfter !== null ? <Text style={styles.sampleBalance}>Balance after: {formatINR(row.balanceAfter)}</Text> : null}
                    </View>
                    <Text style={[styles.sampleAmount, row.type === 'credit' ? styles.income : styles.expense]}>{row.type === 'credit' ? '+' : '−'}{formatINR(row.amount)}</Text>
                  </View>
                ))}

                {preview.issues.length > 0 ? (
                  <View style={styles.issueBox}>
                    <Text style={styles.issueTitle}>Rows needing review</Text>
                    {preview.issues.slice(0, 5).map((issue) => (
                      <Text key={`${issue.row}-${issue.message}`} style={styles.issueText}>Row {issue.row}: {issue.message}</Text>
                    ))}
                  </View>
                ) : null}

                <PrimaryButton
                  label={preview.alreadyImported ? 'This statement was already imported' : `Import ${preview.newRows} new transaction${preview.newRows === 1 ? '' : 's'}`}
                  onPress={() => void importStatement()}
                  loading={importing}
                  disabled={preview.alreadyImported || preview.newRows === 0}
                />
              </SurfaceCard>
            </View>
          ) : null}

          {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}

          {history.length > 0 ? (
            <View>
              <SectionHeader title="Recent imports" />
              <View style={styles.importHistory}>
                {history.slice(0, 5).map((item) => (
                  <SurfaceCard key={item.id} style={styles.historyItem}>
                    <Text style={styles.historyName} numberOfLines={1}>{item.fileName}</Text>
                    <Text style={styles.historyMeta}>{item.importedRows} added · {item.duplicateRows} duplicates · {item.rejectedRows} review</Text>
                    <Text style={styles.historyDate}>{formatDate(item.createdAt)}</Text>
                  </SurfaceCard>
                ))}
              </View>
            </View>
          ) : null}

          <SurfaceCard style={styles.formatCard}>
            <Text style={styles.formatTitle}>Supported CSV columns</Text>
            <Text style={styles.formatText}>Date, Description/Narration, Debit and Credit (or Amount and Type), plus optional Balance, Recipient, Reference and Category.</Text>
          </SurfaceCard>
        </>
      )}
    </FinanceScreen>
  );
}

function AccountChoice({ account, selected, onPress }: { account: FinanceAccount; selected: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.accountChoice, selected && styles.accountChoiceActive]}>
      <View style={[styles.radio, selected && styles.radioActive]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={styles.accountChoiceText}>
        <Text style={styles.accountChoiceName}>{account.name}</Text>
        <Text style={styles.accountChoiceMeta}>{account.institution} · current {formatINR(account.balance)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function CountCard({ label, value, color }: { label: string; value: number; color: string }): React.JSX.Element {
  return (
    <View style={styles.countCard}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  privacyCard: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 13, borderColor: 'rgba(88,166,255,0.24)' },
  privacyIcon: { width: 33, height: 33, borderRadius: 11, backgroundColor: 'rgba(88,166,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  privacyIconText: { color: FinanceTheme.colors.blue, fontSize: 16, fontWeight: '900' },
  privacyText: { flex: 1 },
  privacyTitle: { color: FinanceTheme.colors.text, fontSize: 10, fontWeight: '800' },
  privacyDescription: { color: FinanceTheme.colors.muted, fontSize: 8, lineHeight: 12, marginTop: 3 },
  accountList: { gap: 7 },
  accountChoice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: FinanceTheme.colors.surface, borderWidth: 1, borderColor: FinanceTheme.colors.border },
  accountChoiceActive: { borderColor: FinanceTheme.colors.primary, backgroundColor: 'rgba(128,92,255,0.1)' },
  radio: { width: 17, height: 17, borderRadius: 9, borderWidth: 1, borderColor: FinanceTheme.colors.subtle, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: FinanceTheme.colors.primarySoft },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: FinanceTheme.colors.primarySoft },
  accountChoiceText: { flex: 1 },
  accountChoiceName: { color: FinanceTheme.colors.text, fontSize: 10, fontWeight: '700' },
  accountChoiceMeta: { color: FinanceTheme.colors.subtle, fontSize: 8, marginTop: 3 },
  uploadCard: { alignItems: 'center', padding: 18, gap: 9, borderStyle: 'dashed', borderColor: '#514479' },
  uploadIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(128,92,255,0.17)', alignItems: 'center', justifyContent: 'center' },
  uploadIconText: { color: FinanceTheme.colors.primarySoft, fontSize: 25, fontWeight: '800' },
  uploadTitle: { color: FinanceTheme.colors.text, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  uploadDescription: { color: FinanceTheme.colors.muted, fontSize: 9, textAlign: 'center', lineHeight: 14, marginBottom: 3 },
  previewCard: { gap: 13 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewHeading: { flex: 1 },
  previewTitle: { color: FinanceTheme.colors.text, fontSize: 11, fontWeight: '800' },
  previewSubtitle: { color: FinanceTheme.colors.subtle, fontSize: 8, marginTop: 3 },
  countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  countCard: { minWidth: '47%', flexGrow: 1, padding: 10, borderRadius: 11, backgroundColor: FinanceTheme.colors.background, borderWidth: 1, borderColor: FinanceTheme.colors.border },
  countValue: { fontSize: 16, fontWeight: '900' },
  countLabel: { color: FinanceTheme.colors.subtle, fontSize: 8, marginTop: 3 },
  periodText: { color: FinanceTheme.colors.muted, fontSize: 9 },
  coverageText: { color: FinanceTheme.colors.subtle, fontSize: 8, lineHeight: 13 },
  tableHeading: { color: FinanceTheme.colors.text, fontSize: 10, fontWeight: '800', marginBottom: -4 },
  sampleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomColor: FinanceTheme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  sampleMain: { flex: 1, minWidth: 0 },
  sampleName: { color: FinanceTheme.colors.text, fontSize: 9, fontWeight: '700' },
  sampleMeta: { color: FinanceTheme.colors.subtle, fontSize: 7, marginTop: 3 },
  sampleBalance: { color: FinanceTheme.colors.primarySoft, fontSize: 7, marginTop: 2 },
  sampleAmount: { fontSize: 9, fontWeight: '800' },
  income: { color: FinanceTheme.colors.green },
  expense: { color: FinanceTheme.colors.red },
  issueBox: { padding: 10, borderRadius: 11, backgroundColor: 'rgba(255,99,117,0.08)', gap: 4 },
  issueTitle: { color: FinanceTheme.colors.red, fontSize: 9, fontWeight: '800' },
  issueText: { color: FinanceTheme.colors.muted, fontSize: 8, lineHeight: 12 },
  errorText: { color: FinanceTheme.colors.red, fontSize: 10, lineHeight: 15 },
  importHistory: { gap: 7 },
  historyItem: { padding: 11 },
  historyName: { color: FinanceTheme.colors.text, fontSize: 9, fontWeight: '700' },
  historyMeta: { color: FinanceTheme.colors.muted, fontSize: 8, marginTop: 4 },
  historyDate: { color: FinanceTheme.colors.subtle, fontSize: 7, marginTop: 3 },
  formatCard: { gap: 6, borderColor: FinanceTheme.colors.border },
  formatTitle: { color: FinanceTheme.colors.text, fontSize: 10, fontWeight: '800' },
  formatText: { color: FinanceTheme.colors.muted, fontSize: 8, lineHeight: 13 },
});
