import React, { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { EmptyState, PrimaryButton, SectionHeader, SurfaceCard } from '@/components/finance-ui';
import { useFinanceColors } from '@/constants/finance-theme';
import { StatementImportService } from '@/services/statement-import-service';
import { useFinanceStore } from '@/store/finance-store';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default function StatementUploadScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { status, token } = useAuth();
  const accounts = useFinanceStore((state) => state.accounts);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedAccountId = accountId ?? accounts[0]?.id ?? null;

  const chooseStatement = async (): Promise<void> => {
    if (status !== 'authenticated' || !token) {
      router.push('/login');
      return;
    }
    if (!selectedAccountId) {
      setError('Add an account before uploading a statement.');
      return;
    }
    setError(null);
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (selection.canceled || !selection.assets[0]) return;

      const asset = selection.assets[0];
      if (!asset.name.toLowerCase().endsWith('.csv')) {
        throw new Error('Choose a CSV statement file.');
      }
      if (asset.size !== undefined && asset.size > MAX_FILE_BYTES) {
        throw new Error('Statement files must be 10 MB or smaller.');
      }

      setFileInfo({ name: asset.name, size: asset.size ?? 0 });
      setLoading(true);
      const fileBlob = Platform.OS === 'web' && asset.file
        ? asset.file
        : new File(asset.uri);
      if (fileBlob.size > MAX_FILE_BYTES) throw new Error('Statement files must be 10 MB or smaller.');
      setFileInfo({ name: asset.name, size: fileBlob.size });

      const uploaded = await StatementImportService.upload(token, selectedAccountId, asset.name, fileBlob);
      router.push(`/(tabs)/statements/review/${uploaded.statementId}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Statement upload failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FinanceScreen title="Import statement" subtitle="Upload a bank CSV securely, then review every row before it enters your ledger.">
      {status !== 'authenticated' ? (
        <EmptyState
          title="Sign in to import"
          description="Statements are private and attached only to accounts you own."
          action={<PrimaryButton label="Sign in" onPress={() => router.push('/login')} />}
        />
      ) : accounts.length === 0 ? (
        <EmptyState title="Create an account first" description="Choose the account that owns this statement before importing." />
      ) : (
        <>
          <SurfaceCard style={styles.privacy}>
            <Text style={[styles.privacyTitle, { color: colors.text }]}>Private by design</Text>
            <Text style={[styles.description, { color: colors.muted }]}>
              Files are limited to 10 MB. The source rows are retained separately from normalized values, and raw storage paths are never returned.
            </Text>
          </SurfaceCard>

          <View>
            <SectionHeader title="Select account" />
            <View style={styles.accountList}>
              {accounts.map((account) => {
                const selected = account.id === selectedAccountId;
                return (
                  <TouchableOpacity
                    key={account.id}
                    onPress={() => setAccountId(account.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[
                      styles.account,
                      { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.surface },
                    ]}
                  >
                    <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.subtle }]}>
                      {selected ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
                    </View>
                    <View style={styles.accountLabel}>
                      <Text style={[styles.accountName, { color: colors.text }]}>{account.name}</Text>
                      <Text style={[styles.description, { color: colors.muted }]}>{account.institution}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <SurfaceCard style={styles.uploadCard}>
            <Text style={[styles.uploadIcon, { color: colors.primarySoft }]}>↑</Text>
            <Text style={[styles.uploadTitle, { color: colors.text }]}>{fileInfo?.name ?? 'CSV bank statement'}</Text>
            {fileInfo ? (
              <Text style={[styles.description, { color: colors.muted }]}>{(fileInfo.size / 1024).toFixed(1)} KB selected</Text>
            ) : (
              <Text style={[styles.description, { color: colors.muted }]}>CSV only · maximum 10 MB · source text is preserved</Text>
            )}
            {loading ? (
              <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel="Uploading statement securely">
                <ActivityIndicator color={colors.primarySoft} />
                <Text style={[styles.description, { color: colors.muted }]}>Uploading and parsing securely…</Text>
              </View>
            ) : (
              <PrimaryButton label="Choose CSV statement" onPress={() => void chooseStatement()} />
            )}
          </SurfaceCard>
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
        </>
      )}
    </FinanceScreen>
  );
}

const styles = StyleSheet.create({
  privacy: { gap: 7, borderWidth: 1 },
  privacyTitle: { fontSize: 15, fontWeight: '800' },
  description: { fontSize: 12, lineHeight: 18 },
  accountList: { gap: 8 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  accountLabel: { flex: 1, gap: 3 },
  accountName: { fontSize: 14, fontWeight: '700' },
  uploadCard: { alignItems: 'center', gap: 10, padding: 22 },
  uploadIcon: { fontSize: 38, fontWeight: '800' },
  uploadTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  error: { fontSize: 13, lineHeight: 19 },
});
