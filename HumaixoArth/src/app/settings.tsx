import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { FinanceScreen } from '@/components/finance-screen';
import { SurfaceCard } from '@/components/finance-ui';
import { FinanceTheme } from '@/constants/finance-theme';
import { PreferencesService } from '@/services/preferences-service';

export default function SettingsScreen(): React.JSX.Element {
  const [hideBalances, setHideBalances] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void PreferencesService.getHideBalances()
      .then((hidden) => { if (active) setHideBalances(hidden); })
      .catch((error: unknown) => {
        Alert.alert(
          'Could not load preferences',
          error instanceof Error ? error.message : 'Please reopen settings and try again.',
        );
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const toggleHideBalances = async (hidden: boolean): Promise<void> => {
    const previousValue = hideBalances;
    setHideBalances(hidden);
    try {
      await PreferencesService.setHideBalances(hidden);
    } catch (error) {
      setHideBalances(previousValue);
      Alert.alert(
        'Could not save preference',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  return (
    <FinanceScreen title="App settings" subtitle="Adjust how your private finance workspace behaves.">
      <SurfaceCard style={styles.preferenceRow}>
        <View style={styles.preferenceCopy}>
          <Text style={styles.preferenceTitle}>Hide balances on the dashboard</Text>
          <Text style={styles.preferenceDescription}>Obscure account totals whenever you open the home screen.</Text>
        </View>
        <Switch
          value={hideBalances}
          disabled={loading}
          onValueChange={(value) => void toggleHideBalances(value)}
          trackColor={{ false: FinanceTheme.colors.border, true: FinanceTheme.colors.primary }}
          thumbColor="#ffffff"
          accessibilityLabel="Hide dashboard balances by default"
        />
      </SurfaceCard>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Regional preferences</Text>
        <SurfaceCard style={styles.infoCard}>
          <SettingRow label="Currency" value="Indian Rupee · INR (₹)" />
          <SettingRow label="Number format" value="Indian grouping · 1,00,000" />
          <SettingRow label="Date format" value="Day · Month · Year" />
        </SurfaceCard>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        <SurfaceCard>
          <Text style={styles.privacyText}>Your session is stored in secure device storage. Statements are processed for your account only, and uploaded PDFs are not retained after extraction.</Text>
        </SurfaceCard>
      </View>
    </FinanceScreen>
  );
}

function SettingRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  preferenceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preferenceCopy: { flex: 1, gap: 5 },
  preferenceTitle: { color: FinanceTheme.colors.text, fontSize: 16, fontWeight: '700' },
  preferenceDescription: { color: FinanceTheme.colors.muted, fontSize: 13, lineHeight: 19 },
  section: { gap: 9 },
  sectionTitle: { color: FinanceTheme.colors.text, fontSize: 16, fontWeight: '700' },
  infoCard: { paddingVertical: 4 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: FinanceTheme.colors.border },
  settingLabel: { color: FinanceTheme.colors.muted, fontSize: 14 },
  settingValue: { color: FinanceTheme.colors.text, fontSize: 14, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  privacyText: { color: FinanceTheme.colors.muted, fontSize: 14, lineHeight: 21 },
});
