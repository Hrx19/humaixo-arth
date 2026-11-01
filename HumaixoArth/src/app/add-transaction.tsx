import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { PrimaryButton, SurfaceCard } from '@/components/finance-ui';
import { FinanceTheme } from '@/constants/finance-theme';
import { FinanceService } from '@/services/finance-service';
import { useFinanceStore } from '@/store/finance-store';
import type { CreateTransactionInput, TransactionType } from '@/types/finance';

const CATEGORIES = ['Food', 'Shopping', 'Travel', 'Fuel', 'Bills', 'Transfer', 'Income', 'Healthcare', 'Rent', 'Other'];

export default function AddTransactionScreen(): React.JSX.Element {
  const router = useRouter();
  const { status, token } = useAuth();
  const isGuest = status !== 'authenticated' || !token;
  const accounts = useFinanceStore((state) => state.accounts);
  const refreshDashboard = useFinanceStore((state) => state.refreshDashboard);
  const [type, setType] = useState<TransactionType>('debit');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [category, setCategory] = useState('Food');
  const [accountId, setAccountId] = useState<string | undefined>();
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [balanceAfter, setBalanceAfter] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    if (isGuest || !token) {
      router.push('/login');
      return;
    }
    const numericAmount = Number(amount);
    const numericBalance = balanceAfter.trim() ? Number(balanceAfter) : undefined;
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (!merchant.trim()) {
      setError('Enter the merchant or transaction description.');
      return;
    }
    if (balanceAfter.trim() && !Number.isFinite(numericBalance)) {
      setError('Enter a valid balance after this transaction.');
      return;
    }

    const input: CreateTransactionInput = {
      ...(accountId ? { accountId } : {}),
      merchant: merchant.trim(),
      amount: numericAmount,
      type,
      category,
      ...(counterparty.trim() ? { counterparty: counterparty.trim(), counterpartyType: 'person' as const } : {}),
      ...(paymentMethod.trim() ? { paymentMethod: paymentMethod.trim() } : {}),
      ...(numericBalance !== undefined ? { balanceAfter: numericBalance } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      description: merchant.trim(),
    };

    setSaving(true);
    setError(null);
    try {
      await FinanceService.createTransaction(token, input);
      await refreshDashboard(token);
      Alert.alert('Saved', 'Transaction has been added to your ledger.');
      router.replace('/transactions');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this transaction.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FinanceScreen title="Add transaction" subtitle="Record an entry with enough context to explain it later.">
      {isGuest ? (
        <SurfaceCard style={styles.guestCard}>
          <Text style={styles.guestTitle}>Sign in to keep a private ledger</Text>
          <Text style={styles.helpText}>Transactions are saved to your account and never added to the shared demo.</Text>
          <PrimaryButton label="Login" onPress={() => router.push('/login')} />
        </SurfaceCard>
      ) : (
        <SurfaceCard style={styles.formCard}>
          <View style={styles.typeToggle}>
            <TypeButton label="Money out" active={type === 'debit'} onPress={() => { setType('debit'); if (category === 'Income') setCategory('Food'); }} />
            <TypeButton label="Money in" active={type === 'credit'} onPress={() => { setType('credit'); setCategory('Income'); }} />
          </View>

          <Field label="Amount (₹)" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
          <Field label="Merchant or description" value={merchant} onChangeText={setMerchant} placeholder="e.g. Swiggy, salary, rent" />
          <Field label="Person involved (optional)" value={counterparty} onChangeText={setCounterparty} placeholder="e.g. Rahul Sharma" />

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.chipWrap}>
            {CATEGORIES.map((value) => (
              <TypeButton key={value} label={value} active={category === value} onPress={() => setCategory(value)} compact />
            ))}
          </View>

          {accounts.length > 0 ? (
            <>
              <Text style={styles.fieldLabel}>Account</Text>
              <View style={styles.chipWrap}>
                {accounts.map((account) => (
                  <TypeButton key={account.id} label={account.name} active={accountId === account.id} onPress={() => setAccountId(account.id)} compact />
                ))}
                <TypeButton label="No account" active={!accountId} onPress={() => setAccountId(undefined)} compact />
              </View>
            </>
          ) : (
            <TouchableOpacity onPress={() => router.push('/accounts')} style={styles.addAccountLink}>
              <Text style={styles.addAccountLinkText}>＋ Add an account for balance tracking</Text>
            </TouchableOpacity>
          )}

          <View style={styles.optionalHeader}><Text style={styles.fieldLabel}>More detail (optional)</Text><Text style={styles.optionalTag}>You can add this later</Text></View>
          <Field label="Payment method" value={paymentMethod} onChangeText={setPaymentMethod} placeholder="UPI, NEFT, cash, card" />
          <Field label="Balance after (₹)" value={balanceAfter} onChangeText={setBalanceAfter} placeholder="Use if shown on your statement" keyboardType="decimal-pad" />
          <Field label="Note" value={note} onChangeText={setNote} placeholder="What was this for?" />

          {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
          <PrimaryButton label="Save transaction" onPress={() => void handleSave()} loading={saving} />
        </SurfaceCard>
      )}
    </FinanceScreen>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default' }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'decimal-pad' }): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={FinanceTheme.colors.subtle} keyboardType={keyboardType} style={styles.input} />
    </View>
  );
}

function TypeButton({ label, active, onPress, compact = false }: { label: string; active: boolean; onPress: () => void; compact?: boolean }): React.JSX.Element {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.typeButton, compact && styles.typeButtonCompact, active && styles.typeButtonActive]}>
      <Text style={[styles.typeButtonText, active && styles.typeButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  formCard: { gap: 12 },
  guestCard: { gap: 12 },
  guestTitle: { color: FinanceTheme.colors.text, fontSize: 14, fontWeight: '800' },
  helpText: { color: FinanceTheme.colors.muted, fontSize: 10, lineHeight: 15 },
  typeToggle: { flexDirection: 'row', gap: 8 },
  typeButton: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: FinanceTheme.colors.border, backgroundColor: FinanceTheme.colors.surfaceRaised },
  typeButtonCompact: { flex: 0, minHeight: 32, paddingHorizontal: 10, borderRadius: 999 },
  typeButtonActive: { backgroundColor: 'rgba(128,92,255,0.22)', borderColor: FinanceTheme.colors.primary },
  typeButtonText: { color: FinanceTheme.colors.muted, fontSize: 10, fontWeight: '700' },
  typeButtonTextActive: { color: FinanceTheme.colors.primarySoft },
  field: { gap: 6 },
  fieldLabel: { color: FinanceTheme.colors.muted, fontSize: 9, fontWeight: '700' },
  input: { minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: FinanceTheme.colors.border, backgroundColor: FinanceTheme.colors.background, paddingHorizontal: 11, color: FinanceTheme.colors.text, fontSize: 11 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  addAccountLink: { paddingVertical: 7 },
  addAccountLinkText: { color: FinanceTheme.colors.primarySoft, fontSize: 10, fontWeight: '700' },
  optionalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  optionalTag: { color: FinanceTheme.colors.subtle, fontSize: 8 },
  errorText: { color: FinanceTheme.colors.red, fontSize: 10 },
});
