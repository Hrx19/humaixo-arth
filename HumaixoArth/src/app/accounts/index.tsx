import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Banknote, CreditCard, Landmark, Plus, Wallet } from 'lucide-react-native';
import type { ManagedAccount, ManagedAccountType } from '@/services/accountService';
import { AccountService } from '@/services/accountService';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { EmptyState, SurfaceCard } from '@/components/finance-ui';
import { useFinanceColors } from '@/constants/finance-theme';

function formatBalance(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function accountTypeLabel(type: ManagedAccountType): string {
  return type.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function AccountTypeIcon({ type }: { type: ManagedAccountType }): React.JSX.Element {
  const colors = useFinanceColors();
  const iconProps = { size: 21, color: colors.primarySoft, strokeWidth: 1.8 };

  switch (type) {
    case 'credit_card':
      return <CreditCard {...iconProps} />;
    case 'wallet':
      return <Wallet {...iconProps} />;
    case 'cash':
      return <Banknote {...iconProps} />;
    default:
      return <Landmark {...iconProps} />;
  }
}

function AccountSkeleton(): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <SurfaceCard style={styles.accountCard}>
      <View style={styles.skeletonHeader}>
        <View style={[styles.skeletonIcon, { backgroundColor: colors.surfaceRaised }]} />
        <View style={styles.skeletonCopy}>
          <View style={[styles.skeletonLine, styles.skeletonLong, { backgroundColor: colors.surfaceRaised }]} />
          <View style={[styles.skeletonLine, styles.skeletonShort, { backgroundColor: colors.surfaceRaised }]} />
        </View>
      </View>
      <View style={[styles.skeletonBalance, { backgroundColor: colors.surfaceRaised }]} />
    </SurfaceCard>
  );
}

export default function AccountsScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { status, token } = useAuth();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async (): Promise<void> => {
    if (!token || status !== 'authenticated') {
      setAccounts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setAccounts(await AccountService.getAccounts());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your accounts.');
    } finally {
      setLoading(false);
    }
  }, [status, token]);

  useFocusEffect(
    useCallback(() => {
      if (status === 'authenticated') void loadAccounts();
    }, [loadAccounts, status]),
  );

  const archiveAccount = (account: ManagedAccount): void => {
    Alert.alert(
      'Archive account?',
      `${account.displayName} will be removed from your active account list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            void AccountService.archiveAccount(account.id)
              .then(() => loadAccounts())
              .catch((archiveError: unknown) => {
                Alert.alert(
                  'Could not archive account',
                  archiveError instanceof Error ? archiveError.message : 'Please try again.',
                );
              });
          },
        },
      ],
    );
  };

  const addButton = (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Add a new account"
      onPress={() => router.push('/accounts/add')}
      style={[styles.addButton, { backgroundColor: colors.primary }]}
    >
      <Plus size={19} color="#ffffff" strokeWidth={2.5} />
      <Text style={styles.addButtonLabel}>Add account</Text>
    </TouchableOpacity>
  );

  return (
    <FinanceScreen
      title="Your accounts"
      subtitle="A clear view of the money you keep across banks, cards, wallets and cash."
      rightAction={addButton}
      contentStyle={styles.screenContent}
    >
      {status === 'loading' || (status === 'authenticated' && loading) ? (
        <View style={styles.accountList} accessibilityLabel="Loading accounts">
          <AccountSkeleton />
          <AccountSkeleton />
          <AccountSkeleton />
        </View>
      ) : status !== 'authenticated' || !token ? (
        <EmptyState
          title="Sign in to manage accounts"
          description="Your accounts are private and available after you sign in."
          action={
            <TouchableOpacity
              onPress={() => router.push('/login')}
              style={[styles.primaryAction, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.primaryActionText}>Sign in</Text>
            </TouchableOpacity>
          }
        />
      ) : error ? (
        <SurfaceCard style={styles.messageCard}>
          <Text style={[styles.messageTitle, { color: colors.text }]}>Accounts could not load</Text>
          <Text style={[styles.messageBody, { color: colors.muted }]}>{error}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void loadAccounts()}
            style={[styles.primaryAction, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.primaryActionText}>Try again</Text>
          </TouchableOpacity>
        </SurfaceCard>
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Add your first bank account to get started."
          action={
            <TouchableOpacity
              onPress={() => router.push('/accounts/add')}
              style={[styles.primaryAction, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.primaryActionText}>Add your first account</Text>
            </TouchableOpacity>
          }
        />
      ) : (
        <View style={styles.accountList}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Linked accounts</Text>
            <Text style={[styles.accountCount, { color: colors.muted }]}>{accounts.length}</Text>
          </View>
          {accounts.map((account) => (
            <SurfaceCard key={account.id} style={styles.accountCard}>
              <View style={styles.accountHeader}>
                <View style={[styles.accountIcon, { backgroundColor: colors.surfaceRaised }]}>
                  <AccountTypeIcon type={account.accountType} />
                </View>
                <View style={styles.accountIdentity}>
                  <Text style={[styles.bankName, { color: colors.muted }]} numberOfLines={1}>
                    {account.bankName || accountTypeLabel(account.accountType)}
                  </Text>
                  <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
                    {account.displayName}
                  </Text>
                  <Text style={[styles.accountType, { color: colors.subtle }]}>
                    {accountTypeLabel(account.accountType)}
                  </Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Archive ${account.displayName}`}
                  onPress={() => archiveAccount(account)}
                  style={styles.moreButton}
                >
                  <Text style={[styles.moreButtonText, { color: colors.subtle }]}>•••</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.balanceRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.balanceLabel, { color: colors.muted }]}>Current balance</Text>
                <Text style={[styles.balanceValue, { color: colors.text }]}>
                  {formatBalance(account.currentBalance, account.currency)}
                </Text>
              </View>
            </SurfaceCard>
          ))}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push('/accounts/add')}
            style={[styles.addAnotherButton, { borderColor: colors.border }]}
          >
            <Plus size={17} color={colors.primarySoft} />
            <Text style={[styles.addAnotherText, { color: colors.primarySoft }]}>Add another account</Text>
          </TouchableOpacity>
        </View>
      )}
    </FinanceScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 34 },
  accountList: { gap: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  accountCount: { fontSize: 12, fontWeight: '700' },
  accountCard: { padding: 17, borderRadius: 20 },
  accountHeader: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  accountIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  accountIdentity: { flex: 1, minWidth: 0 },
  bankName: { fontSize: 11, fontWeight: '600' },
  displayName: { fontSize: 16, fontWeight: '800', marginTop: 3 },
  accountType: { fontSize: 11, marginTop: 4, textTransform: 'capitalize' },
  moreButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  moreButtonText: { fontSize: 17, letterSpacing: 1 },
  balanceRow: {
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  balanceLabel: { fontSize: 12, fontWeight: '500' },
  balanceValue: { fontSize: 18, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
  addButton: { minHeight: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 11 },
  addButtonLabel: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  addAnotherButton: {
    minHeight: 52,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 2,
  },
  addAnotherText: { fontSize: 13, fontWeight: '700' },
  messageCard: { gap: 10 },
  messageTitle: { fontSize: 16, fontWeight: '800' },
  messageBody: { fontSize: 13, lineHeight: 19 },
  primaryAction: { paddingHorizontal: 18, minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryActionText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  skeletonIcon: { width: 48, height: 48, borderRadius: 16 },
  skeletonCopy: { flex: 1, gap: 8 },
  skeletonLine: { height: 10, borderRadius: 8 },
  skeletonLong: { width: '64%' },
  skeletonShort: { width: '42%' },
  skeletonBalance: { height: 17, width: '44%', borderRadius: 8, alignSelf: 'flex-end', marginTop: 18 },
});
