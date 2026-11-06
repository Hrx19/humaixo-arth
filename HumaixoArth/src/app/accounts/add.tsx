import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronDown, X } from 'lucide-react-native';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { SurfaceCard } from '@/components/finance-ui';
import { useFinanceColors } from '@/constants/finance-theme';
import { AccountService, type ManagedAccountType } from '@/services/accountService';

const accountTypes: { value: ManagedAccountType; label: string; description: string }[] = [
  { value: 'savings', label: 'Savings', description: 'Personal or salary account' },
  { value: 'current', label: 'Current', description: 'Business banking account' },
  { value: 'credit_card', label: 'Credit card', description: 'Card balance or liability' },
  { value: 'wallet', label: 'Wallet', description: 'Digital or prepaid wallet' },
  { value: 'cash', label: 'Cash', description: 'Cash kept on hand' },
];

const addAccountSchema = z.object({
  bankName: z.string().trim().min(1, 'Enter the bank or provider name.').max(120, 'Use 120 characters or fewer.'),
  displayName: z.string().trim().min(1, 'Enter a name for this account.').max(100, 'Use 100 characters or fewer.'),
  accountType: z.enum(['savings', 'current', 'cash', 'credit_card', 'wallet']),
  openingBalance: z.string()
    .trim()
    .regex(/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/, 'Enter a valid balance with up to 2 decimal places.'),
});

type AddAccountForm = z.infer<typeof addAccountSchema>;

export default function AddAccountScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { status } = useAuth();
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState(false);
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AddAccountForm>({
    resolver: zodResolver(addAccountSchema),
    defaultValues: {
      bankName: '',
      displayName: '',
      accountType: 'savings',
      openingBalance: '0',
    },
  });
  const selectedType = useWatch({ control, name: 'accountType' });
  const selectedAccountType = accountTypes.find((type) => type.value === selectedType) ?? accountTypes[0];

  const submit = handleSubmit(async (values) => {
    if (status !== 'authenticated') {
      router.replace('/login');
      return;
    }

    setSaving(true);
    try {
      await AccountService.createAccount({
        bankName: values.bankName.trim(),
        displayName: values.displayName.trim(),
        accountType: values.accountType,
        openingBalance: values.openingBalance.trim(),
        currency: 'INR',
      });
      setSuccessToast(true);
      setTimeout(() => router.back(), 900);
    } catch (error) {
      Alert.alert(
        'Could not add account',
        error instanceof Error ? error.message : 'Please check the details and try again.',
      );
    } finally {
      setSaving(false);
    }
  });

  return (
    <FinanceScreen
      title="Add an account"
      subtitle="Add a bank, card, wallet or cash balance to your private ledger."
      contentStyle={styles.screenContent}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <SurfaceCard style={styles.formCard}>
            <View style={styles.sectionIntro}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Account details</Text>
              <Text style={[styles.formSubtitle, { color: colors.muted }]}>
                You can update these details later.
              </Text>
            </View>

            <FormField
              control={control}
              name="bankName"
              label="Bank or provider"
              placeholder="e.g. HDFC Bank"
              error={errors.bankName?.message}
              colors={colors}
            />
            <FormField
              control={control}
              name="displayName"
              label="Display name"
              placeholder="e.g. Everyday Savings"
              error={errors.displayName?.message}
              colors={colors}
            />

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Account type</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Account type, ${selectedAccountType.label}`}
                accessibilityHint="Choose an account type"
                onPress={() => setTypePickerVisible(true)}
                style={[styles.selectButton, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <View style={styles.selectTextGroup}>
                  <Text style={[styles.selectLabel, { color: colors.text }]}>{selectedAccountType.label}</Text>
                  <Text style={[styles.selectDescription, { color: colors.muted }]}>{selectedAccountType.description}</Text>
                </View>
                <ChevronDown size={19} color={colors.muted} />
              </TouchableOpacity>
              {errors.accountType?.message ? (
                <Text accessibilityRole="alert" style={[styles.fieldError, { color: colors.red }]}>{errors.accountType.message}</Text>
              ) : null}
            </View>

            <FormField
              control={control}
              name="openingBalance"
              label="Opening balance"
              placeholder="0.00"
              keyboardType="decimal-pad"
              error={errors.openingBalance?.message}
              colors={colors}
              leftAdornment={<Text style={[styles.currencyPrefix, { color: colors.muted }]}>₹</Text>}
              helper="Use a negative amount for a balance you owe, such as a credit card."
            />

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: saving, busy: saving }}
              disabled={saving}
              onPress={() => void submit()}
              style={[styles.submitButton, { backgroundColor: colors.primary }, saving && styles.disabledButton]}
            >
              {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitButtonText}>Save account</Text>}
            </TouchableOpacity>
          </SurfaceCard>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={typePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTypePickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.typeSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.typeSheetHeader}>
              <View>
                <Text style={[styles.typeSheetTitle, { color: colors.text }]}>Choose account type</Text>
                <Text style={[styles.typeSheetSubtitle, { color: colors.muted }]}>Select the closest match.</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close account type selector"
                onPress={() => setTypePickerVisible(false)}
                style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]}
              >
                <X size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>
            {accountTypes.map((type) => {
              const selected = type.value === selectedType;
              return (
                <TouchableOpacity
                  key={type.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setValue('accountType', type.value, { shouldValidate: true });
                    setTypePickerVisible(false);
                  }}
                  style={[
                    styles.typeOption,
                    { borderColor: selected ? colors.primary : colors.border },
                    selected && { backgroundColor: colors.surfaceRaised },
                  ]}
                >
                  <View style={styles.typeOptionCopy}>
                    <Text style={[styles.typeOptionLabel, { color: colors.text }]}>{type.label}</Text>
                    <Text style={[styles.typeOptionDescription, { color: colors.muted }]}>{type.description}</Text>
                  </View>
                  {selected ? <Check size={18} color={colors.primarySoft} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {successToast ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.toast, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        >
          <View style={[styles.toastCheck, { backgroundColor: colors.green }]}>
            <Check size={15} color="#ffffff" strokeWidth={3} />
          </View>
          <Text style={[styles.toastText, { color: colors.text }]}>Account added successfully</Text>
        </View>
      ) : null}
    </FinanceScreen>
  );
}

function FormField({
  control,
  name,
  label,
  placeholder,
  keyboardType = 'default',
  error,
  colors,
  leftAdornment,
  helper,
}: {
  control: ReturnType<typeof useForm<AddAccountForm>>['control'];
  name: 'bankName' | 'displayName' | 'openingBalance';
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad';
  error?: string;
  colors: ReturnType<typeof useFinanceColors>;
  leftAdornment?: React.ReactNode;
  helper?: string;
}): React.JSX.Element {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => (
          <View
            style={[
              styles.inputWrap,
              { backgroundColor: colors.background, borderColor: error ? colors.red : colors.border },
            ]}
          >
            {leftAdornment}
            <TextInput
              accessibilityLabel={label}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder={placeholder}
              placeholderTextColor={colors.subtle}
              keyboardType={keyboardType}
              autoCapitalize={name === 'openingBalance' ? 'none' : 'words'}
              style={[styles.input, { color: colors.text }]}
            />
          </View>
        )}
      />
      {helper ? <Text style={[styles.helperText, { color: colors.subtle }]}>{helper}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.fieldError, { color: colors.red }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 34 },
  formCard: { padding: 20, gap: 19 },
  sectionIntro: { gap: 5, marginBottom: 2 },
  formTitle: { fontSize: 18, fontWeight: '800' },
  formSubtitle: { fontSize: 12, lineHeight: 18 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  inputWrap: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    gap: 9,
  },
  input: { flex: 1, minHeight: 50, paddingVertical: 0, fontSize: 14 },
  currencyPrefix: { fontSize: 16, fontWeight: '700' },
  helperText: { fontSize: 11, lineHeight: 16 },
  fieldError: { fontSize: 11, lineHeight: 16 },
  selectButton: {
    minHeight: 60,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectTextGroup: { flex: 1, gap: 3 },
  selectLabel: { fontSize: 14, fontWeight: '700' },
  selectDescription: { fontSize: 11 },
  submitButton: { minHeight: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  submitButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.65 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'flex-end', padding: 16 },
  typeSheet: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 9 },
  typeSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  typeSheetTitle: { fontSize: 17, fontWeight: '800' },
  typeSheetSubtitle: { fontSize: 12, marginTop: 4 },
  closeButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  typeOption: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  typeOptionCopy: { gap: 3 },
  typeOptionLabel: { fontSize: 13, fontWeight: '700' },
  typeOptionDescription: { fontSize: 11 },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    elevation: 8,
  },
  toastCheck: { width: 27, height: 27, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toastText: { fontSize: 13, fontWeight: '700' },
});
