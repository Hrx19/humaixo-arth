import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { EmptyState, PrimaryButton, SurfaceCard } from '@/components/finance-ui';
import { FinanceTheme } from '@/constants/finance-theme';
import { useFinanceStore } from '@/store/finance-store';
import { AuthService } from '@/services/auth-service';
import { useAuthStore } from '@/store/authStore';

export default function ProfileScreen(): React.JSX.Element {
  const router = useRouter();
  const { status, token, user, signOut } = useAuth();
  const clearFinance = useFinanceStore((state) => state.clear);
  const updateUser = useAuthStore((state) => state.updateUser);
  const analytics = useFinanceStore((state) => state.analytics);
  const transactions = useFinanceStore((state) => state.transactions);
  const isGuest = status !== 'authenticated' || !token;
  const [signingOut, setSigningOut] = useState(false);
  const [profileEditorVisible, setProfileEditorVisible] = useState(false);
  const [editedName, setEditedName] = useState(user?.name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const saveProfile = async (): Promise<void> => {
    const name = editedName.trim();
    if (!token || name.length < 1 || name.length > 100) {
      setProfileError('Enter a name between 1 and 100 characters.');
      return;
    }

    setSavingProfile(true);
    setProfileError(null);
    try {
      const updatedUser = await AuthService.updateProfile(token, name);
      await updateUser(updatedUser);
      setProfileEditorVisible(false);
      Alert.alert('Profile updated', 'Your name has been saved.');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Could not update your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    setSigningOut(true);
    try {
      clearFinance();
      await signOut();
      router.replace('/');
    } catch (error) {
      Alert.alert('Could not sign out', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  const savingsRate = analytics && new Decimal(analytics.totals.income).isPositive()
    ? new Decimal(analytics.totals.income).minus(analytics.totals.expense).dividedBy(analytics.totals.income).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)
    : null;

  return (
    <FinanceScreen title="Profile" subtitle="Your account, linked finances and privacy controls.">
      {isGuest ? (
        <EmptyState title="Your finances stay private" description="Sign in to view your personal profile, statement imports and linked accounts." action={<PrimaryButton label="Login or create account" onPress={() => router.push('/login')} />} />
      ) : (
        <>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name?.trim()[0] ?? 'U').toUpperCase()}</Text></View>
            <Text style={styles.userName}>{user?.name ?? 'Humaixo user'}</Text>
            <Text style={styles.userEmail}>{user?.email ?? ''}</Text>
          </View>

          <View style={styles.metricsRow}>
            <Metric value={String(analytics?.byCategory.reduce((sum, item) => sum + item.count, 0) ?? transactions.length)} label="Transactions" />
            <Metric value={savingsRate === null ? '—' : `${savingsRate}%`} label="Savings rate" />
            <Metric value={String(analytics?.accounts.length ?? 0)} label="Accounts" />
          </View>

          <Section title="Account">
            <MenuItem
              icon="✎"
              title="Edit profile"
              description="Update the name shown on your account"
              onPress={() => {
                setEditedName(user?.name ?? '');
                setProfileError(null);
                setProfileEditorVisible(true);
              }}
            />
          </Section>

          <Section title="Your money workspace">
            <MenuItem icon="▣" title="Linked accounts" description="Opening balances and account totals" onPress={() => router.push('/accounts')} />
            <MenuItem icon="⇧" title="Bank statements" description="Preview, import and review past CSV uploads" onPress={() => router.push('/statement-import')} />
            <MenuItem icon="▤" title="Import a PDF statement" description="Extract bank activity from a digital PDF" onPress={() => router.push('/parse-statement')} />
            <MenuItem icon="▤" title="Transaction ledger" description="Search payments, balances and references" onPress={() => router.push('/transactions')} />
            <MenuItem icon="✦" title="Insights and trends" description="Monthly cash flow and category analysis" onPress={() => router.push('/insights')} />
            <MenuItem icon="◷" title="Balance history" description="Look back at tracked monthly balances" onPress={() => router.push('/history')} />
          </Section>

          <Section title="Preferences and support">
            <MenuItem icon="⚙" title="App settings" description="Privacy and regional preferences" onPress={() => router.push('/settings')} />
            <MenuItem icon="?" title="Help & support" description="Find answers about accounts and transactions" onPress={() => router.push('/help-support')} />
          </Section>

          <Section title="Privacy and data">
            <View style={styles.privacyRow}>
              <View style={styles.privacyIcon}><Text style={styles.privacyIconText}>⌑</Text></View>
              <View style={styles.privacyContent}>
                <Text style={styles.privacyTitle}>Statement data protection</Text>
              <Text style={styles.privacyText}>Account and transaction rows are scoped to your user. Parsed SMS is retained with its transaction and omitted from list responses; original CSV files are not retained after import.</Text>
              </View>
            </View>
            <View style={styles.privacyRow}>
              <View style={styles.privacyIcon}><Text style={styles.privacyIconText}>◈</Text></View>
              <View style={styles.privacyContent}>
                <Text style={styles.privacyTitle}>Session storage</Text>
                <Text style={styles.privacyText}>Mobile sessions use secure device storage; web sessions use browser storage.</Text>
              </View>
            </View>
          </Section>

          <SurfaceCard style={styles.signOutCard}>
            <Text style={styles.signOutTitle}>Sign out from this device</Text>
            <Text style={styles.signOutDescription}>Your cloud ledger remains attached to your account. This removes the local session.</Text>
            <TouchableOpacity onPress={() => void handleSignOut()} disabled={signingOut} style={styles.signOutButton} accessibilityRole="button">
              {signingOut ? <ActivityIndicator color={FinanceTheme.colors.red} /> : <Text style={styles.signOutText}>Logout</Text>}
            </TouchableOpacity>
          </SurfaceCard>

          <Modal
            visible={profileEditorVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setProfileEditorVisible(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.profileModal}>
                <Text style={styles.modalTitle}>Edit profile</Text>
                <Text style={styles.modalDescription}>Change the name displayed on your account.</Text>
                <TextInput
                  value={editedName}
                  onChangeText={setEditedName}
                  placeholder="Your name"
                  placeholderTextColor={FinanceTheme.colors.subtle}
                  maxLength={100}
                  autoCapitalize="words"
                  style={styles.nameInput}
                  accessibilityLabel="Profile name"
                />
                {profileError ? <Text accessibilityRole="alert" style={styles.modalError}>{profileError}</Text> : null}
                <PrimaryButton label="Save changes" onPress={() => void saveProfile()} loading={savingProfile} />
                <TouchableOpacity
                  onPress={() => setProfileEditorVisible(false)}
                  disabled={savingProfile}
                  style={styles.cancelButton}
                  accessibilityRole="button"
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </>
      )}
    </FinanceScreen>
  );
}

function Section({ title, children }: React.PropsWithChildren<{ title: string }>): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <SurfaceCard style={styles.sectionCard}>{children}</SurfaceCard>
    </View>
  );
}

function Metric({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <SurfaceCard style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </SurfaceCard>
  );
}

function MenuItem({ icon, title, description, onPress }: { icon: string; title: string; description: string; onPress: () => void }): React.JSX.Element {
  return (
    <TouchableOpacity onPress={onPress} style={styles.menuItem} accessibilityRole="button">
      <View style={styles.menuIcon}><Text style={styles.menuIconText}>{icon}</Text></View>
      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuDescription}>{description}</Text>
      </View>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  profileHeader: { alignItems: 'center', paddingVertical: 10 },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: FinanceTheme.colors.primary, borderWidth: 3, borderColor: 'rgba(181,164,255,0.35)' },
  avatarText: { color: '#ffffff', fontSize: 30, fontWeight: '900' },
  userName: { color: FinanceTheme.colors.text, fontSize: 17, fontWeight: '800', marginTop: 11 },
  userEmail: { color: FinanceTheme.colors.muted, fontSize: 14, marginTop: 4 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metricCard: { flex: 1, alignItems: 'center', padding: 12 },
  metricValue: { color: FinanceTheme.colors.text, fontSize: 17, fontWeight: '900' },
  metricLabel: { color: FinanceTheme.colors.subtle, fontSize: 12, marginTop: 4 },
  section: { gap: 8 },
  sectionTitle: { color: FinanceTheme.colors.muted, fontSize: 14, fontWeight: '800', paddingHorizontal: 2, letterSpacing: 0.3 },
  sectionCard: { paddingHorizontal: 12, paddingVertical: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomColor: FinanceTheme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  menuIcon: { width: 33, height: 33, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(128,92,255,0.15)' },
  menuIconText: { color: FinanceTheme.colors.primarySoft, fontSize: 15, fontWeight: '800' },
  menuText: { flex: 1 },
  menuTitle: { color: FinanceTheme.colors.text, fontSize: 14, fontWeight: '700' },
  menuDescription: { color: FinanceTheme.colors.subtle, fontSize: 12, lineHeight: 16, marginTop: 3 },
  menuArrow: { color: FinanceTheme.colors.subtle, fontSize: 18 },
  privacyRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomColor: FinanceTheme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  privacyIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(33,201,151,0.12)', alignItems: 'center', justifyContent: 'center' },
  privacyIconText: { color: FinanceTheme.colors.green, fontSize: 14, fontWeight: '800' },
  privacyContent: { flex: 1 },
  privacyTitle: { color: FinanceTheme.colors.text, fontSize: 14, fontWeight: '700' },
  privacyText: { color: FinanceTheme.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  signOutCard: { gap: 8, borderColor: 'rgba(255,99,117,0.2)' },
  signOutTitle: { color: FinanceTheme.colors.text, fontSize: 16, fontWeight: '800' },
  signOutDescription: { color: FinanceTheme.colors.muted, fontSize: 13, lineHeight: 19 },
  signOutButton: { height: 40, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,99,117,0.36)', backgroundColor: 'rgba(255,99,117,0.07)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  signOutText: { color: FinanceTheme.colors.red, fontSize: 14, fontWeight: '800' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(0,0,0,0.72)' },
  profileModal: { gap: 12, padding: 20, borderRadius: 20, backgroundColor: FinanceTheme.colors.surface, borderWidth: 1, borderColor: FinanceTheme.colors.border },
  modalTitle: { color: FinanceTheme.colors.text, fontSize: 22, fontWeight: '800' },
  modalDescription: { color: FinanceTheme.colors.muted, fontSize: 14, lineHeight: 20 },
  nameInput: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: FinanceTheme.colors.border, backgroundColor: FinanceTheme.colors.background, paddingHorizontal: 13, color: FinanceTheme.colors.text, fontSize: 16 },
  modalError: { color: FinanceTheme.colors.red, fontSize: 13 },
  cancelButton: { minHeight: 42, justifyContent: 'center', alignItems: 'center' },
  cancelButtonText: { color: FinanceTheme.colors.muted, fontSize: 14, fontWeight: '700' },
});
