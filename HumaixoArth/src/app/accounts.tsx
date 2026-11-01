import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { EmptyState, PrimaryButton, SectionHeader, SurfaceCard } from '@/components/finance-ui';
import { FinanceTheme, formatDate, formatINR } from '@/constants/finance-theme';
import { FinanceService } from '@/services/finance-service';
import { useFinanceStore } from '@/store/finance-store';
import type { AccountType, CreateAccountInput } from '@/types/finance';

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'savings', label: 'Savings' },
  { value: 'bank', label: 'Bank' },
  { value: 'current', label: 'Current' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' },
];

const ACCOUNT_COLORS = ['#805cff', '#22c997', '#58a6ff', '#f5b84b', '#ff6375'];

export default function AccountsScreen(): React.JSX.Element {
  const router = useRouter();
  const { status, token } = useAuth();
  const isGuest = status !== 'authenticated' || !token;
  const accounts = useFinanceStore((state) => state.accounts);
  const refreshDashboard = useFinanceStore((state) => state.refreshDashboard);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [type, setType] = useState<AccountType>('savings');
  const [accountSuffix, setAccountSuffix] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10));
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token && status === 'authenticated' && accounts.length === 0) void refreshDashboard(token);
  }, [accounts.length, refreshDashboard, status, token]);

  const handleCreateAccount = async (): Promise<void> => {
    if (isGuest || !token) {
      router.push('/login');
      return;
    }
    const normalizedName = name.trim();
    const normalizedInstitution = institution.trim();
    const amount = Number(openingBalance);
    const parsedDate = new Date(`${openingDate}T12:00:00`);

    if (!normalizedName || !normalizedInstitution) {
      setFormError('Enter an account name and institution.');
      return;
    }
    if (!Number.isFinite(amount)) {
      setFormError('Enter a valid opening balance. Use a negative number for an account liability.');
      return;
    }
    if (Number.isNaN(parsedDate.getTime())) {
      setFormError('Enter the date when this opening balance was accurate.');
      return;
    }

    const input: CreateAccountInput = {
      name: normalizedName,
      institution: normalizedInstitution,
      type,
      accountSuffix: accountSuffix.trim(),
      currency: 'INR',
      openingBalance: amount,
      openingBalanceDate: parsedDate.toISOString(),
      color: ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length],
    };

    setLoading(true);
    setFormError(null);
    try {
      await FinanceService.createAccount(token, input);
      await refreshDashboard(token);
      setName('');
      setInstitution('');
      setAccountSuffix('');
      setOpeningBalance('');
      setOpeningDate(new Date().toISOString().slice(0, 10));
      setShowForm(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not create this account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FinanceScreen
      title="Linked Accounts"
      subtitle="Combine bank, wallet, card, investment and cash balances in one private ledger."
    >
      {isGuest ? (
        <EmptyState title="Keep all your balances together" description="Sign in to link accounts and import statements securely to your own profile." action={<PrimaryButton label="Login to manage accounts" onPress={() => router.push('/login')} />} />
      ) : (
        <>
          <SurfaceCard style={styles.totalCard}>
            <Text style={styles.totalLabel}>TRACKED NET BALANCE</Text>
            <Text style={styles.totalValue}>{formatINR(accounts.reduce((sum, account) => sum + account.balance, 0))}</Text>
            <Text style={styles.totalHint}>Calculated from account opening balances and recorded transactions.</Text>
          </SurfaceCard>

          <PrimaryButton label={showForm ? 'Cancel adding account' : '＋ Add account'} onPress={() => { setShowForm((current) => !current); setFormError(null); }} secondary={!showForm} />

          {showForm ? (
            <SurfaceCard style={styles.formCard}>
              <SectionHeader title="New account" />
              <Field label="Account name" value={name} onChangeText={setName} placeholder="e.g. Main Savings" />
              <Field label="Bank or provider" value={institution} onChangeText={setInstitution} placeholder="e.g. HDFC Bank" />
              <Text style={styles.fieldLabel}>Account type</Text>
              <View style={styles.typeGrid}>
                {ACCOUNT_TYPES.map((option) => (
                  <TouchableOpacity key={option.value} onPress={() => setType(option.value)} style={[styles.typeChip, type === option.value && styles.typeChipActive]}>
                    <Text style={[styles.typeChipText, type === option.value && styles.typeChipTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.splitFields}>
                <View style={styles.splitField}>
                  <Field label="Last 4 digits (optional)" value={accountSuffix} onChangeText={(value) => setAccountSuffix(value.replace(/\D/g, '').slice(0, 4))} placeholder="4521" keyboardType="number-pad" />
                </View>
                <View style={styles.splitField}>
                  <Field label="Opening balance (₹)" value={openingBalance} onChangeText={setOpeningBalance} placeholder="0.00" keyboardType="decimal-pad" />
                </View>
              </View>
              <Field label="Balance as of (YYYY-MM-DD)" value={openingDate} onChangeText={setOpeningDate} placeholder="2026-10-01" />
              <Text style={styles.helperText}>This date is the baseline for historical balance calculations. Enter the statement&apos;s opening date when importing older activity.</Text>
              {formError ? <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text> : null}
              <PrimaryButton label="Save account" onPress={() => void handleCreateAccount()} loading={loading} />
            </SurfaceCard>
          ) : null}

          <View>
            <SectionHeader title={`Your accounts · ${accounts.length}`} actionLabel="Import statement" onAction={() => router.push('/statement-import')} />
            {accounts.length === 0 ? (
              <EmptyState title="No accounts yet" description="Add an opening balance, then import a statement to see account-level history." />
            ) : (
              <View style={styles.accountList}>
                {accounts.map((account) => (
                  <SurfaceCard key={account.id} style={styles.accountCard}>
                    <View style={styles.accountTop}>
                      <View style={[styles.accountIcon, { backgroundColor: `${account.color}27` }]}>
                        <Text style={[styles.accountIconText, { color: account.color }]}>{account.institution.slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <View style={styles.accountTitle}>
                        <Text style={styles.accountName}>{account.name}</Text>
                        <Text style={styles.accountMeta}>{account.institution} · {account.type.replace('_', ' ')}</Text>
                      </View>
                      <Text style={styles.accountBalance}>{formatINR(account.balance)}</Text>
                    </View>
                    <View style={styles.accountBottom}>
                      <Text style={styles.accountMeta}>{account.accountSuffix ? `•••• ${account.accountSuffix} · ` : ''}Opening balance {formatINR(account.openingBalance)}</Text>
                      <Text style={styles.accountMeta}>since {formatDate(account.openingBalanceDate)}</Text>
                    </View>
                  </SurfaceCard>
                ))}
              </View>
            )}
          </View>

          <SurfaceCard style={styles.importHint}>
            <Text style={styles.importTitle}>Have a bank statement?</Text>
            <Text style={styles.importDescription}>Preview the rows first. Humaixo reports duplicates, rejected lines and balance coverage before it saves anything.</Text>
            <PrimaryButton label="Preview a CSV statement" onPress={() => router.push('/statement-import')} secondary />
          </SurfaceCard>
        </>
      )}
    </FinanceScreen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={FinanceTheme.colors.subtle} keyboardType={keyboardType} style={styles.input} autoCapitalize="words" />
    </View>
  );
}

const styles = StyleSheet.create({
  totalCard: { backgroundColor: '#21143d', borderColor: 'rgba(139,108,255,0.32)' },
  totalLabel: { color: '#b5a4d0', fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  totalValue: { color: '#ffffff', fontSize: 29, fontWeight: '900', marginTop: 7 },
  totalHint: { color: '#a99cbe', fontSize: 9, lineHeight: 14, marginTop: 6 },
  formCard: { gap: 9 },
  field: { gap: 6, marginBottom: 2 },
  fieldLabel: { color: FinanceTheme.colors.muted, fontSize: 9, fontWeight: '700' },
  input: { minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: FinanceTheme.colors.border, backgroundColor: FinanceTheme.colors.background, paddingHorizontal: 11, color: FinanceTheme.colors.text, fontSize: 11 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 5 },
  typeChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: FinanceTheme.colors.surfaceRaised, borderWidth: 1, borderColor: FinanceTheme.colors.border },
  typeChipActive: { backgroundColor: 'rgba(128,92,255,0.2)', borderColor: FinanceTheme.colors.primary },
  typeChipText: { color: FinanceTheme.colors.muted, fontSize: 9 },
  typeChipTextActive: { color: FinanceTheme.colors.primarySoft, fontWeight: '800' },
  splitFields: { flexDirection: 'row', gap: 9 },
  splitField: { flex: 1 },
  helperText: { color: FinanceTheme.colors.subtle, fontSize: 9, lineHeight: 14 },
  formError: { color: FinanceTheme.colors.red, fontSize: 10 },
  accountList: { gap: 9 },
  accountCard: { padding: 14 },
  accountTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accountIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  accountIconText: { fontSize: 15, fontWeight: '900' },
  accountTitle: { flex: 1 },
  accountName: { color: FinanceTheme.colors.text, fontSize: 12, fontWeight: '800' },
  accountMeta: { color: FinanceTheme.colors.subtle, fontSize: 8, marginTop: 3, textTransform: 'capitalize' },
  accountBalance: { color: FinanceTheme.colors.text, fontSize: 12, fontWeight: '800' },
  accountBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginTop: 13, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: FinanceTheme.colors.border },
  importHint: { gap: 10 },
  importTitle: { color: FinanceTheme.colors.text, fontSize: 13, fontWeight: '800' },
  importDescription: { color: FinanceTheme.colors.muted, fontSize: 10, lineHeight: 15 },
});
