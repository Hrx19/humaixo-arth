import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FinanceScreen } from '@/components/finance-screen';
import { AIChatInterface } from '@/components/AIChatInterface';
import { AuditFeed } from '@/components/AuditFeed';
import { MasterCodeModal } from '@/components/MasterCodeModal';
import { useAuth } from '@/auth/auth-context';
import { useFinanceColors } from '@/constants/finance-theme';
import { AiApiService } from '@/services/ai-api-service';

export default function AiAssistantScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { token, status } = useAuth();
  const queryClient = useQueryClient();
  const [masterMode, setMasterMode] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [verifyingMasterCode, setVerifyingMasterCode] = useState(false);
  const masterStatus = useQuery({
    queryKey: ['owner-master-status', token],
    queryFn: () => AiApiService.masterCodeStatus(token!),
    enabled: Boolean(token && status === 'authenticated'),
    staleTime: 60_000,
  });

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      const hasSession = token ? await AiApiService.hasOwnerSession() : false;
      if (active) setMasterMode(hasSession);
    }).catch(() => {
      if (active) setMasterMode(false);
    });
    return () => { active = false; };
  }, [token]);

  const auditQuery = useQuery({
    queryKey: ['owner-ai-audit', token],
    queryFn: () => AiApiService.listAudit(token!),
    enabled: Boolean(token && status === 'authenticated'),
    refetchInterval: masterMode ? 30_000 : false,
  });
  const mutationQuery = useQuery({
    queryKey: ['owner-ai-mutations', token],
    queryFn: () => AiApiService.listMutations(token!),
    enabled: Boolean(token && masterMode && status === 'authenticated'),
    refetchInterval: masterMode ? 30_000 : false,
  });
  const emergency = useMutation({
    mutationFn: (action: 'cache-flush' | 'restart-service') => AiApiService.executeEmergencyAction(token!, action),
    onSuccess: async (result, action) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owner-ai-audit', token] }),
        queryClient.invalidateQueries({ queryKey: ['owner-ai-mutations', token] }),
      ]);
      Alert.alert(
        'Emergency action',
        action === 'cache-flush'
          ? `Cache flush completed. ${result.clearedEntries ?? 0} entries cleared.`
          : 'Graceful restart requested.',
      );
    },
  });

  const toggleMasterMode = async (enabled: boolean): Promise<void> => {
    setModalError(null);
    if (enabled) {
      setEnrolling(masterStatus.data?.enrolled === false);
      setModalVisible(true);
      return;
    }
    try {
      await AiApiService.clearOwnerSession(token!);
      setMasterMode(false);
    } catch (error) {
      setMasterMode(false);
      setModalError(error instanceof Error ? error.message : 'Could not revoke owner session.');
    }
  };

  const verify = async (code: string): Promise<void> => {
    if (!token) throw new Error('Sign in before enabling Master Mode.');
    if (verifyingMasterCode) return;
    setModalError(null);
    setVerifyingMasterCode(true);
    try {
      if (enrolling) await AiApiService.enrollMasterCode(token, code);
      else await AiApiService.verifyMasterCode(token, code);
      setMasterMode(true);
      setModalVisible(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owner-ai-audit', token] }),
        queryClient.invalidateQueries({ queryKey: ['owner-master-status', token] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Master Code verification failed.';
      setModalError(message);
      throw error;
    } finally {
      setVerifyingMasterCode(false);
    }
  };

  if (status === 'loading') {
    return <FinanceScreen title="Humaixo AI"><ActivityIndicator color={colors.primarySoft} /></FinanceScreen>;
  }
  if (!token) {
    return (
      <FinanceScreen title="Humaixo AI" subtitle="Sign in to ask questions about your private financial records.">
        <TouchableOpacity onPress={() => router.push('/login')} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={styles.buttonText}>Sign in</Text>
        </TouchableOpacity>
      </FinanceScreen>
    );
  }

  return (
    <FinanceScreen
      title="Humaixo AI"
      subtitle="Grounded read-only financial answers. Privileged controls are owner-gated and audited."
    >
      <View style={[styles.accessCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.accessHeader}>
          <View style={styles.accessCopy}>
            <Text style={[styles.accessTitle, { color: colors.text }]}>Master Mode</Text>
            <Text style={[styles.accessText, { color: colors.muted }]}>
              {masterMode ? 'Owner session active · expires automatically' : 'Emergency controls are locked'}
            </Text>
          </View>
          <Switch
            value={masterMode}
            onValueChange={(value) => void toggleMasterMode(value)}
            disabled={!masterStatus.data || masterStatus.isError}
            accessibilityLabel="Toggle Master Mode"
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
        {!masterMode && masterStatus.data?.enrolled === false ? (
          <TouchableOpacity
            onPress={() => {
              setEnrolling(true);
              setModalError(null);
              setModalVisible(true);
            }}
            style={styles.setupLink}
          >
            <Text style={[styles.setupText, { color: colors.primarySoft }]}>First-time owner setup</Text>
          </TouchableOpacity>
        ) : null}
        {masterStatus.isError ? (
          <Text style={[styles.accessText, { color: colors.muted }]}>Owner controls are unavailable for this account.</Text>
        ) : null}
      </View>

      <AIChatInterface token={token} />

      {masterMode ? (
        <View style={[styles.console, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.consoleTitle, { color: colors.text }]}>Emergency Console · Tier 3</Text>
          <Text style={[styles.accessText, { color: colors.muted }]}>
            Each action requires a live owner session and creates an audit record. Restart invokes graceful shutdown.
          </Text>
          {emergency.isError ? <Text style={[styles.accessText, { color: colors.red }]}>{emergency.error.message}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => emergency.mutate('cache-flush')}
              disabled={emergency.isPending}
              style={[styles.button, styles.secondaryButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.actionText, { color: colors.text }]}>{emergency.isPending ? 'Working…' : 'Flush cache'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert(
                'Restart service?',
                'The API process will shut down gracefully and relies on its process manager to restart it.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Restart', style: 'destructive', onPress: () => emergency.mutate('restart-service') },
                ],
              )}
              disabled={emergency.isPending}
              style={[styles.button, { backgroundColor: colors.red }]}
            >
              <Text style={styles.buttonText}>Restart service</Text>
            </TouchableOpacity>
          </View>
          <AuditFeed
            entries={auditQuery.data}
            mutations={mutationQuery.data}
            loading={auditQuery.isLoading || mutationQuery.isLoading}
            error={auditQuery.error?.message ?? mutationQuery.error?.message ?? null}
          />
        </View>
      ) : (
        <AuditFeed
          entries={auditQuery.data}
          loading={auditQuery.isLoading}
          error={auditQuery.error?.message ?? null}
        />
      )}

      <MasterCodeModal
        visible={modalVisible}
        mode={enrolling ? 'enroll' : 'verify'}
        busy={verifyingMasterCode}
        error={modalError}
        onCancel={() => {
          setModalVisible(false);
          setModalError(null);
        }}
        onSubmit={verify}
      />
    </FinanceScreen>
  );
}

const styles = StyleSheet.create({
  accessCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  accessHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accessCopy: { flex: 1, gap: 3 },
  accessTitle: { fontSize: 15, fontWeight: '800' },
  accessText: { fontSize: 11, lineHeight: 16 },
  setupLink: { alignSelf: 'flex-start', paddingVertical: 6 },
  setupText: { fontSize: 12, fontWeight: '700' },
  console: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
  consoleTitle: { fontSize: 16, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  button: { minHeight: 42, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1 },
  buttonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  actionText: { fontSize: 12, fontWeight: '800' },
});
