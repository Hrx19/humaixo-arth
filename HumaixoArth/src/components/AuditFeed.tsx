import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFinanceColors } from '@/constants/finance-theme';
import type { MutationStatus, PermissionAuditEntry } from '@/services/ai-api-service';

type AuditFeedProps = {
  entries?: PermissionAuditEntry[];
  mutations?: MutationStatus[];
  loading?: boolean;
  error?: string | null;
};

function describe(entry: PermissionAuditEntry): string {
  if (entry.action === 'emergency_cache_flush') return `Owner requested cache flush · Tier ${entry.tier}`;
  if (entry.action === 'emergency_restart_service') return `Owner requested service restart · Tier ${entry.tier}`;
  if (entry.action === 'schema_change') return `Schema change proposal · ${entry.decision}`;
  if (entry.action === 'settings_change') return `Settings proposal · ${entry.decision}`;
  return `${entry.action.replaceAll('_', ' ')} · Tier ${entry.tier} · ${entry.decision}`;
}

export function AuditFeed({
  entries = [],
  mutations = [],
  loading = false,
  error,
}: AuditFeedProps): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.text }]}>Control Plane Audit</Text>
      {loading ? <ActivityIndicator color={colors.primarySoft} /> : null}
      {error ? <Text style={[styles.body, { color: colors.red }]}>{error}</Text> : null}
      <ScrollView style={styles.list} nestedScrollEnabled>
        {entries.length === 0 && !loading && !error ? (
          <Text style={[styles.body, { color: colors.muted }]}>No permission events recorded yet.</Text>
        ) : entries.map((entry) => (
          <View key={entry.id} style={[styles.row, { borderTopColor: colors.border }]}>
            <Text style={[styles.body, { color: colors.text }]}>{describe(entry)}</Text>
            <Text style={[styles.detail, { color: colors.muted }]}>{entry.result}</Text>
            <Text style={[styles.date, { color: colors.subtle }]}>{new Date(entry.createdAt).toLocaleString()}</Text>
          </View>
        ))}
      </ScrollView>
      {mutations.length > 0 ? (
        <>
          <Text style={[styles.heading, styles.mutationHeading, { color: colors.text }]}>Code Mutation Feed</Text>
          {mutations.map((mutation) => (
            <View key={mutation.mutationId} style={[styles.row, { borderTopColor: colors.border }]}>
              <Text style={[styles.body, { color: colors.text }]}>{mutation.changedPaths.join(', ')}</Text>
              <Text style={[styles.detail, { color: colors.muted }]}>
                Checks: {mutation.checks.overall} · Approval: {mutation.approval.state} · Deployment: {mutation.deploymentState}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  heading: { fontSize: 14, fontWeight: '800' },
  mutationHeading: { marginTop: 8 },
  list: { maxHeight: 280 },
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 4, gap: 4 },
  body: { fontSize: 12, lineHeight: 17 },
  detail: { fontSize: 11, lineHeight: 16 },
  date: { fontSize: 10 },
});
