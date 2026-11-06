import React, { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { Alert, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { FinanceScreen } from '@/components/finance-screen';
import { PrimaryButton, SurfaceCard } from '@/components/finance-ui';
import { useFinanceColors, formatINR } from '@/constants/finance-theme';
import { useAuth } from '@/auth/auth-context';
import { FinanceService } from '@/services/finance-service';
import { PreferencesService } from '@/services/preferences-service';
import { useThemeStore } from '@/store/themeStore';

export default function SettingsScreen(): React.JSX.Element {
  const colors = useFinanceColors();
  const { status, token } = useAuth();
  const isAuthenticated = status === 'authenticated' && Boolean(token);
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const [hideBalances, setHideBalances] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetSpent, setBudgetSpent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBudget, setSavingBudget] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  useEffect(() => {
    let active = true;
    const loadSettings = async (): Promise<void> => {
      try {
        const [hidden, budget] = await Promise.all([
          PreferencesService.getHideBalances(),
          isAuthenticated && token ? FinanceService.getBudget(token) : Promise.resolve(null),
        ]);
        if (!active) return;
        setHideBalances(hidden);
        if (budget) {
          setBudgetAmount(budget.amount === null ? '' : String(budget.amount));
          setBudgetSpent(budget.spent);
        }
      } catch (error) {
        Alert.alert(
          'Could not load settings',
          error instanceof Error ? error.message : 'Please reopen settings and try again.',
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadSettings();
    return () => { active = false; };
  }, [isAuthenticated, token]);

  const toggleHideBalances = async (hidden: boolean): Promise<void> => {
    const previousValue = hideBalances;
    setHideBalances(hidden);
    try {
      await PreferencesService.setHideBalances(hidden);
    } catch (error) {
      setHideBalances(previousValue);
      Alert.alert('Could not save preference', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const toggleTheme = async (enabled: boolean): Promise<void> => {
    setSavingTheme(true);
    try {
      await setMode(enabled ? 'dark' : 'light');
    } catch (error) {
      Alert.alert('Could not save theme', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingTheme(false);
    }
  };

  const saveBudget = async (): Promise<void> => {
    if (!isAuthenticated || !token) {
      Alert.alert('Sign in required', 'Sign in to set a monthly spending budget.');
      return;
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(budgetAmount) || !new Decimal(budgetAmount).isPositive()) {
      Alert.alert('Enter a valid budget', 'Your monthly budget must be greater than zero.');
      return;
    }
    setSavingBudget(true);
    try {
      const saved = await FinanceService.setBudget(token, budgetAmount);
      setBudgetSpent(saved.spent);
      Alert.alert('Budget saved', `Your monthly limit is ${formatINR(saved.amount ?? budgetAmount)}.`);
    } catch (error) {
      Alert.alert('Could not save budget', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingBudget(false);
    }
  };

  return (
    <FinanceScreen title="App settings" subtitle="Adjust how your private finance workspace behaves.">
      <SurfaceCard style={styles.preferenceRow}>
        <View style={styles.preferenceCopy}>
          <Text style={[styles.preferenceTitle, { color: colors.text }]}>Appearance</Text>
          <Text style={[styles.preferenceDescription, { color: colors.muted }]}>
            {mode === 'dark' ? 'Dark mode is on.' : 'Light mode is on.'} Your choice is saved on this device.
          </Text>
        </View>
        <Switch
          value={mode === 'dark'}
          disabled={savingTheme}
          onValueChange={(value) => void toggleTheme(value)}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#ffffff"
          accessibilityLabel="Enable dark theme"
        />
      </SurfaceCard>

      <SurfaceCard style={styles.preferenceRow}>
        <View style={styles.preferenceCopy}>
          <Text style={[styles.preferenceTitle, { color: colors.text }]}>Hide balances on the dashboard</Text>
          <Text style={[styles.preferenceDescription, { color: colors.muted }]}>Obscure account totals whenever you open the home screen.</Text>
        </View>
        <Switch
          value={hideBalances}
          disabled={loading}
          onValueChange={(value) => void toggleHideBalances(value)}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#ffffff"
          accessibilityLabel="Hide dashboard balances by default"
        />
      </SurfaceCard>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Monthly budget</Text>
        <SurfaceCard style={styles.budgetCard}>
          <Text style={[styles.preferenceDescription, { color: colors.muted }]}>
            Set a spending limit for this calendar month. The dashboard will alert you as you approach it.
          </Text>
          <TextInput
            value={budgetAmount}
            onChangeText={setBudgetAmount}
            placeholder="Monthly limit in ₹"
            placeholderTextColor={colors.subtle}
            keyboardType="decimal-pad"
            editable={isAuthenticated && !savingBudget}
            style={[styles.budgetInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            accessibilityLabel="Monthly budget amount in rupees"
          />
          {budgetSpent !== null ? (
            <Text style={[styles.preferenceDescription, { color: colors.muted }]}>
              Spent this month: {formatINR(budgetSpent)}
            </Text>
          ) : null}
          <PrimaryButton
            label={isAuthenticated ? 'Save monthly budget' : 'Sign in to set a budget'}
            onPress={() => void saveBudget()}
            loading={savingBudget}
            disabled={!isAuthenticated || loading}
          />
        </SurfaceCard>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Regional preferences</Text>
        <SurfaceCard style={styles.infoCard}>
          <SettingRow label="Currency" value="Indian Rupee · INR (₹)" />
          <SettingRow label="Number format" value="Indian grouping · 1,00,000" />
          <SettingRow label="Date format" value="Day · Month · Year" />
        </SurfaceCard>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Privacy</Text>
        <SurfaceCard>
          <Text style={[styles.privacyText, { color: colors.muted }]}>Your session is stored in secure device storage. Statements are processed for your account only, and uploaded PDFs are not retained after extraction.</Text>
        </SurfaceCard>
      </View>
    </FinanceScreen>
  );
}

function SettingRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.settingLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.settingValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  preferenceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preferenceCopy: { flex: 1, gap: 5 },
  preferenceTitle: { fontSize: 16, fontWeight: '700' },
  preferenceDescription: { fontSize: 13, lineHeight: 19 },
  section: { gap: 9 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  budgetCard: { gap: 12 },
  budgetInput: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  infoCard: { paddingVertical: 4 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  settingLabel: { fontSize: 14 },
  settingValue: { fontSize: 14, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  privacyText: { fontSize: 14, lineHeight: 21 },
});
