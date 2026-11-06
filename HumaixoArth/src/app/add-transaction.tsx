import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Decimal from 'decimal.js';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { PrimaryButton, SurfaceCard } from '@/components/finance-ui';
import { FinanceTheme, useFinanceColors } from '@/constants/finance-theme';
import { FinanceService } from '@/services/finance-service';
import { useFinanceStore } from '@/store/finance-store';
import type { CreateTransactionInput, TransactionType } from '@/types/finance';

const CATEGORIES = ['Food', 'Shopping', 'Travel', 'Fuel', 'Bills', 'Transfer', 'Income', 'Healthcare', 'Rent', 'Other'];
const CATEGORY_ICONS: Record<string, string> = {
  Food: '🍽️',
  Shopping: '🛍️',
  Travel: '✈️',
  Fuel: '⛽',
  Bills: '🧾',
  Transfer: '↔️',
  Income: '↗️',
  Healthcare: '✚',
  Rent: '⌂',
  Other: '•••',
};

export default function AddTransactionScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { status, token } = useAuth();
  const isGuest = status !== 'authenticated' || !token;
  const accounts = useFinanceStore((state) => state.accounts);
  const refreshDashboard = useFinanceStore((state) => state.refreshDashboard);
  const [type, setType] = useState<TransactionType>('debit');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState<string | undefined>();
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [balanceAfter, setBalanceAfter] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    if (isGuest || !token) {
      router.push('/login');
      return;
    }
    const validAmount = /^\d+(?:\.\d{1,2})?$/.test(amount) && new Decimal(amount).isPositive();
    const validBalance = !balanceAfter.trim() || /^-?\d+(?:\.\d{1,2})?$/.test(balanceAfter);
    let hasFieldErrors = false;
    if (!validAmount) {
      setAmountError('Enter an amount greater than zero.');
      hasFieldErrors = true;
    } else {
      setAmountError(null);
    }
    if (!category) {
      setCategoryError('Choose a category for this transaction.');
      hasFieldErrors = true;
    } else {
      setCategoryError(null);
    }
    if (hasFieldErrors) {
      return;
    }
    setError(null);
    if (!merchant.trim()) {
      setError('Enter the merchant or transaction description.');
      return;
    }
    if (!validBalance) {
      setError('Enter a valid balance after this transaction.');
      return;
    }

    const input: CreateTransactionInput = {
      ...(accountId ? { accountId } : {}),
      merchant: merchant.trim(),
      amount,
      type,
      category,
      date: transactionDate.toISOString(),
      ...(counterparty.trim() ? { counterparty: counterparty.trim(), counterpartyType: 'person' as const } : {}),
      ...(paymentMethod.trim() ? { paymentMethod: paymentMethod.trim() } : {}),
      ...(balanceAfter.trim() ? { balanceAfter: balanceAfter.trim() } : {}),
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
            <TypeButton label="Money out" active={type === 'debit'} onPress={() => { setType('debit'); if (category === 'Income') setCategory(''); }} />
            <TypeButton label="Money in" active={type === 'credit'} onPress={() => { setType('credit'); setCategory('Income'); setCategoryError(null); }} />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Amount (₹)</Text>
            <TextInput
              value={amount}
              onChangeText={(value) => {
                setAmount(value);
                if (/^\d+(?:\.\d{1,2})?$/.test(value) && new Decimal(value).isPositive()) setAmountError(null);
              }}
              placeholder="0.00"
              placeholderTextColor={colors.subtle}
              keyboardType="decimal-pad"
              style={[
                styles.input,
                styles.amountInput,
                { color: colors.text, borderColor: amountError ? colors.red : colors.border, backgroundColor: colors.background },
              ]}
              accessibilityLabel="Transaction amount in rupees"
            />
            {amountError ? <Text accessibilityRole="alert" style={[styles.fieldError, { color: colors.red }]}>{amountError}</Text> : null}
          </View>
          <Field label="Merchant or description" value={merchant} onChangeText={setMerchant} placeholder="e.g. Swiggy, salary, rent" />
          <Field label="Person involved (optional)" value={counterparty} onChangeText={setCounterparty} placeholder="e.g. Rahul Sharma" />

          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Category</Text>
          <View style={[styles.categoryGrid, categoryError ? { borderWidth: 1, borderColor: colors.red, borderRadius: 14, padding: 5 } : null]}>
            {CATEGORIES.map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => { setCategory(value); setCategoryError(null); }}
                style={[
                  styles.categoryChoice,
                  { borderColor: category === value ? colors.primary : colors.border, backgroundColor: colors.surfaceRaised },
                  category === value && styles.categoryChoiceActive,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: category === value }}
              >
                <Text style={[styles.categoryIcon, { color: colors.primarySoft }]}>{CATEGORY_ICONS[value]}</Text>
                <Text style={[styles.categoryLabel, category === value && styles.typeButtonTextActive]}>{value}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {categoryError ? <Text accessibilityRole="alert" style={[styles.fieldError, { color: colors.red }]}>{categoryError}</Text> : null}

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Transaction date</Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker((visible) => !visible)}
              style={styles.dateButton}
              accessibilityRole="button"
            >
              <Text style={styles.dateButtonText}>
                {transactionDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
              <Text style={styles.dateButtonIcon}>▦</Text>
            </TouchableOpacity>
            {showDatePicker ? (
              <DateTimePicker
                value={transactionDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(event, selectedDate) => {
                  if (selectedDate) setTransactionDate(selectedDate);
                  if (Platform.OS !== 'ios' || event.type === 'dismissed') setShowDatePicker(false);
                }}
              />
            ) : null}
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
  fieldError: { fontSize: 12, marginTop: 1 },
  fieldLabel: { color: FinanceTheme.colors.muted, fontSize: 9, fontWeight: '700' },
  input: { minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: FinanceTheme.colors.border, backgroundColor: FinanceTheme.colors.background, paddingHorizontal: 11, color: FinanceTheme.colors.text, fontSize: 11 },
  amountInput: { minHeight: 64, fontSize: 30, fontWeight: '800', letterSpacing: 0.3 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChoice: { width: '18%', minWidth: 62, flexGrow: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, borderWidth: 1, borderColor: FinanceTheme.colors.border, backgroundColor: FinanceTheme.colors.surfaceRaised },
  categoryChoiceActive: { borderColor: FinanceTheme.colors.primary, backgroundColor: 'rgba(128,92,255,0.2)' },
  categoryIcon: { fontSize: 21, color: FinanceTheme.colors.primarySoft },
  categoryLabel: { color: FinanceTheme.colors.muted, fontSize: 11, fontWeight: '700' },
  dateButton: { minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: FinanceTheme.colors.border, backgroundColor: FinanceTheme.colors.background, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateButtonText: { color: FinanceTheme.colors.text, fontSize: 14, fontWeight: '600' },
  dateButtonIcon: { color: FinanceTheme.colors.primarySoft, fontSize: 19 },
  addAccountLink: { paddingVertical: 7 },
  addAccountLinkText: { color: FinanceTheme.colors.primarySoft, fontSize: 10, fontWeight: '700' },
  optionalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  optionalTag: { color: FinanceTheme.colors.subtle, fontSize: 8 },
  errorText: { color: FinanceTheme.colors.red, fontSize: 10 },
});
