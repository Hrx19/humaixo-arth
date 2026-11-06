import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { FileText, ShieldCheck, Upload } from 'lucide-react-native';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { EmptyState, PrimaryButton, SurfaceCard, SectionHeader } from '@/components/finance-ui';
import { FinanceTheme, formatINR } from '@/constants/finance-theme';
import { FinanceService } from '@/services/finance-service';
import { useFinanceStore } from '@/store/finance-store';

const MAX_PDF_BYTES = 5 * 1024 * 1024;

export default function ParseStatementScreen(): React.JSX.Element {
  const router = useRouter();
  const { status, token } = useAuth();
  const isGuest = status !== 'authenticated' || !token;
  const accounts = useFinanceStore((state) => state.accounts);
  const refreshDashboard = useFinanceStore((state) => state.refreshDashboard);
  const dashboardLoading = useFinanceStore((state) => state.loading);
  const dashboardError = useFinanceStore((state) => state.error);
  const [accountId, setAccountId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountLoadAttempted = useRef(false);
  const selectedAccountId = accountId ?? accounts[0]?.id;

  useEffect(() => {
    if (
      status === 'authenticated' &&
      token &&
      accounts.length === 0 &&
      !dashboardLoading &&
      !accountLoadAttempted.current
    ) {
      accountLoadAttempted.current = true;
      void refreshDashboard(token);
    }
  }, [accounts.length, dashboardLoading, refreshDashboard, status, token]);

  const chooseAndParsePdf = async (): Promise<void> => {
    if (isGuest || !token) {
      router.push('/login');
      return;
    }
    if (!selectedAccountId) {
      setError('Add an account before importing a bank statement.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (!asset.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Choose a PDF statement exported by your bank.');
      }
      if (asset.size !== undefined && asset.size > MAX_PDF_BYTES) {
        throw new Error('PDF files must be 5 MB or smaller.');
      }

      const file = new File(asset.uri);
      if (file.size > MAX_PDF_BYTES) {
        throw new Error('PDF files must be 5 MB or smaller.');
      }

      const response = await FinanceService.parsePdfStatement(
        token,
        selectedAccountId,
        file,
        asset.name,
      );
      await refreshDashboard(token);
      Alert.alert(
        'Statement imported',
        `${response.data.importedCount} transaction${response.data.importedCount === 1 ? '' : 's'} added to ${response.data.account}. ${response.data.duplicateCount} duplicate${response.data.duplicateCount === 1 ? '' : 's'} skipped.`,
      );
      router.replace('/transactions');
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Could not parse this statement.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FinanceScreen title="Import PDF statement" subtitle="Extract transaction details from a bank statement and add them to your private ledger.">
      {isGuest ? (
        <EmptyState
          title="Sign in to import securely"
          description="PDF statements are uploaded only to your authenticated account."
          action={<PrimaryButton label="Login" onPress={() => router.push('/login')} />}
        />
      ) : dashboardLoading && accounts.length === 0 ? (
        <SurfaceCard style={styles.loadingCard}>
          <ActivityIndicator size="large" color={FinanceTheme.colors.primarySoft} />
          <Text style={styles.loadingText}>Loading your accounts…</Text>
        </SurfaceCard>
      ) : accounts.length === 0 ? (
        <EmptyState
          title={dashboardError ? 'Could not load your accounts' : 'Create an account first'}
          description={dashboardError ?? 'Choose the account that owns the transactions before importing a statement.'}
          action={dashboardError
            ? <PrimaryButton label="Retry" onPress={() => {
              accountLoadAttempted.current = true;
              if (token) void refreshDashboard(token);
            }} />
            : <PrimaryButton label="Add an account" onPress={() => router.push('/accounts')} />}
        />
      ) : (
        <>
          <SurfaceCard style={styles.privacyCard}>
            <ShieldCheck size={23} color={FinanceTheme.colors.green} />
            <View style={styles.privacyCopy}>
              <Text style={styles.privacyTitle}>Private by design</Text>
              <Text style={styles.privacyText}>The PDF is processed in memory and is not stored. Only extracted transaction fields are saved to your account.</Text>
            </View>
          </SurfaceCard>

          <View>
            <SectionHeader title="Save transactions to" />
            <View style={styles.accountList}>
              {accounts.map((account) => {
                const selected = account.id === selectedAccountId;
                return (
                  <TouchableOpacity
                    key={account.id}
                    onPress={() => setAccountId(account.id)}
                    style={[styles.accountOption, selected && styles.accountOptionSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <View style={[styles.radio, selected && styles.radioSelected]} />
                    <View style={styles.accountCopy}>
                      <Text style={styles.accountName}>{account.name}</Text>
                      <Text style={styles.accountMeta}>{account.institution} · {account.type.replace('_', ' ')}</Text>
                    </View>
                    <Text style={styles.accountBalance}>{account.currency} {formatINR(account.balance)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <SurfaceCard style={styles.uploadCard}>
            <View style={styles.fileIcon}>
              {loading ? (
                <ActivityIndicator size="large" color={FinanceTheme.colors.primarySoft} />
              ) : (
                <FileText size={30} color={FinanceTheme.colors.primarySoft} />
              )}
            </View>
            <Text style={styles.uploadTitle}>{loading ? 'Reading your statement' : 'Upload a bank statement PDF'}</Text>
            <Text style={styles.uploadSubtitle}>
              {loading
                ? 'Finding dates, descriptions, amounts and balances…'
                : 'Digital statements up to 5 MB · HDFC, SBI, ICICI and other common layouts'}
            </Text>
            <PrimaryButton
              label={loading ? 'Parsing statement…' : 'Choose PDF statement'}
              onPress={() => void chooseAndParsePdf()}
              loading={loading}
              disabled={loading}
            />
            {!loading ? (
              <View style={styles.uploadHint}>
                <Upload size={15} color={FinanceTheme.colors.muted} />
                <Text style={styles.uploadHintText}>Scanned image-only PDFs are not supported yet.</Text>
              </View>
            ) : null}
          </SurfaceCard>

          {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
        </>
      )}
    </FinanceScreen>
  );
}

const styles = StyleSheet.create({
  privacyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: 'rgba(33,201,151,0.25)' },
  loadingCard: { minHeight: 120, gap: 12, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: FinanceTheme.colors.muted, fontSize: 14 },
  privacyCopy: { flex: 1, gap: 4 },
  privacyTitle: { color: FinanceTheme.colors.text, fontSize: 15, fontWeight: '800' },
  privacyText: { color: FinanceTheme.colors.muted, fontSize: 13, lineHeight: 19 },
  accountList: { gap: 8 },
  accountOption: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 58, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: FinanceTheme.colors.border, backgroundColor: FinanceTheme.colors.surface },
  accountOptionSelected: { borderColor: FinanceTheme.colors.primary, backgroundColor: 'rgba(11,130,126,0.12)' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: FinanceTheme.colors.subtle },
  radioSelected: { borderWidth: 5, borderColor: FinanceTheme.colors.primarySoft },
  accountCopy: { flex: 1 },
  accountName: { color: FinanceTheme.colors.text, fontSize: 14, fontWeight: '700' },
  accountMeta: { color: FinanceTheme.colors.muted, fontSize: 12, marginTop: 3, textTransform: 'capitalize' },
  accountBalance: { color: FinanceTheme.colors.text, fontSize: 12, fontWeight: '600' },
  uploadCard: { alignItems: 'center', gap: 12, paddingVertical: 28, paddingHorizontal: 20, borderStyle: 'dashed', borderColor: '#514479' },
  fileIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,130,126,0.16)' },
  uploadTitle: { color: FinanceTheme.colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  uploadSubtitle: { color: FinanceTheme.colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 5 },
  uploadHint: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  uploadHintText: { color: FinanceTheme.colors.subtle, fontSize: 12 },
  errorText: { color: FinanceTheme.colors.red, fontSize: 14 },
});
