import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { FinanceScreen } from '@/components/finance-screen';
import { EmptyState, InfoPill, PrimaryButton, SurfaceCard, TransactionRow } from '@/components/finance-ui';
import { FinanceTheme, formatINR, formatShortDate } from '@/constants/finance-theme';
import { FinanceService } from '@/services/finance-service';
import type { MerchantSummary, PersonDetails, PersonSummary } from '@/types/finance';

type PeopleTab = 'people' | 'merchants';
const EMPTY_PEOPLE: PersonSummary[] = [];
const EMPTY_MERCHANTS: MerchantSummary[] = [];

export default function PeopleScreen(): React.JSX.Element {
  const router = useRouter();
  const { status, token } = useAuth();
  const isGuest = status !== 'authenticated' || !token;
  const [tab, setTab] = useState<PeopleTab>('people');
  const [peopleSnapshot, setPeopleSnapshot] = useState<{
    token: string | null;
    people: PersonSummary[];
    merchants: MerchantSummary[];
  }>({ token: null, people: [], merchants: [] });
  const [requestError, setRequestError] = useState<{ token: string; message: string } | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonDetails | null>(null);
  const [search, setSearch] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const people = peopleSnapshot.token === token ? peopleSnapshot.people : EMPTY_PEOPLE;
  const merchants = peopleSnapshot.token === token ? peopleSnapshot.merchants : EMPTY_MERCHANTS;
  const loading = !isGuest && peopleSnapshot.token !== token && requestError?.token !== token;
  const error = token && requestError?.token === token ? requestError.message : null;

  useEffect(() => {
    if (isGuest || !token) return;

    let active = true;
    Promise.all([FinanceService.getPeople(token), FinanceService.getMerchants(token)])
      .then(([peopleResult, merchantResult]) => {
        if (!active) return;
        setPeopleSnapshot({ token, people: peopleResult, merchants: merchantResult });
      })
      .catch((requestError: unknown) => {
        if (active) setRequestError({
          token,
          message: requestError instanceof Error ? requestError.message : 'Could not load people and merchant history.',
        });
      });

    return () => { active = false; };
  }, [isGuest, token]);

  const visiblePeople = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('en-IN');
    return people.filter((person) => !normalizedSearch || person.name.toLocaleLowerCase('en-IN').includes(normalizedSearch));
  }, [people, search]);

  const visibleMerchants = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('en-IN');
    return merchants.filter((merchant) => !normalizedSearch || merchant.name.toLocaleLowerCase('en-IN').includes(normalizedSearch));
  }, [merchants, search]);

  const openPerson = async (person: PersonSummary): Promise<void> => {
    if (!token) return;
    setDetailLoading(true);
    try {
      const details = await FinanceService.getPersonDetails(token, person.key);
      setSelectedPerson(details);
    } catch (detailError) {
      setRequestError({ token, message: detailError instanceof Error ? detailError.message : 'Could not load recipient history.' });
    } finally {
      setDetailLoading(false);
    }
  };

  const totalSent = people.reduce((sum, person) => new Decimal(sum).plus(person.sent).toString(), '0');
  const totalReceived = people.reduce((sum, person) => new Decimal(sum).plus(person.received).toString(), '0');

  return (
    <FinanceScreen
      title="People & Merchants"
      subtitle="Know who you paid, who paid you, and how your spending builds up over time."
      activeTab="people"
    >
      {isGuest ? (
        <EmptyState
          title="Your money relationships, mapped"
          description="Humaixo groups statement transfers by person and recurring purchases by merchant. Sign in to view your private history."
          action={<PrimaryButton label="Login to view people" onPress={() => router.push('/login')} />}
        />
      ) : (
        <>
          <View style={styles.summaryRow}>
            <SurfaceCard style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>SENT TO PEOPLE</Text>
              <Text style={[styles.summaryAmount, styles.outgoing]}>{formatINR(totalSent)}</Text>
              <Text style={styles.summaryHint}>{people.length} tracked contacts</Text>
            </SurfaceCard>
            <SurfaceCard style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>RECEIVED</Text>
              <Text style={[styles.summaryAmount, styles.incoming]}>{formatINR(totalReceived)}</Text>
              <Text style={styles.summaryHint}>Across your ledger</Text>
            </SurfaceCard>
          </View>

          <View style={styles.tabs}>
            <TabButton label="People" active={tab === 'people'} onPress={() => setTab('people')} />
            <TabButton label="Merchants" active={tab === 'merchants'} onPress={() => setTab('merchants')} />
          </View>

          <TextInput
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            placeholder={tab === 'people' ? 'Search a person' : 'Search a merchant'}
            placeholderTextColor={FinanceTheme.colors.subtle}
          />

          {loading ? (
            <ActivityIndicator color={FinanceTheme.colors.primarySoft} style={styles.loader} />
          ) : error ? (
            <SurfaceCard><Text style={styles.errorText}>{error}</Text></SurfaceCard>
          ) : tab === 'people' ? (
            visiblePeople.length === 0 ? (
              <EmptyState
                title="No people identified yet"
                description="Import a statement with UPI, IMPS, NEFT, or recipient details to build person-wise totals."
                action={<PrimaryButton label="Import a statement" onPress={() => router.push('/statement-import')} />}
              />
            ) : (
              <View style={styles.listGap}>
                {visiblePeople.map((person) => (
                  <TouchableOpacity key={person.key} onPress={() => void openPerson(person)} activeOpacity={0.78}>
                    <PersonCard person={person} />
                  </TouchableOpacity>
                ))}
              </View>
            )
          ) : visibleMerchants.length === 0 ? (
            <EmptyState
              title="No merchant history yet"
              description="Your most frequent merchants and category totals will appear after statement import."
              action={<PrimaryButton label="Import a statement" onPress={() => router.push('/statement-import')} />}
            />
          ) : (
            <View style={styles.listGap}>
              {visibleMerchants.map((merchant) => <MerchantCard key={merchant.name} merchant={merchant} />)}
            </View>
          )}
        </>
      )}

      <Modal
        visible={selectedPerson !== null || detailLoading}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedPerson(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            <View style={styles.modalTopRow}>
              <View style={styles.modalHeading}>
                <Text style={styles.modalTitle}>{selectedPerson?.person.name ?? (detailLoading ? 'Loading person…' : 'Person details')}</Text>
                {selectedPerson ? <Text style={styles.modalSubtitle}>{selectedPerson.person.transactionCount} recorded transfers · latest {formatShortDate(selectedPerson.person.lastDate)}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => setSelectedPerson(null)} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close person details">
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            {detailLoading ? (
              <ActivityIndicator color={FinanceTheme.colors.primarySoft} style={styles.loader} />
            ) : selectedPerson ? (
              <>
                <View style={styles.personTotals}>
                  <View style={styles.personTotalBlock}>
                    <Text style={styles.summaryLabel}>YOU SENT</Text>
                    <Text style={[styles.personTotalValue, styles.outgoing]}>{formatINR(selectedPerson.person.sent)}</Text>
                  </View>
                  <View style={styles.personTotalBlock}>
                    <Text style={styles.summaryLabel}>YOU RECEIVED</Text>
                    <Text style={[styles.personTotalValue, styles.incoming]}>{formatINR(selectedPerson.person.received)}</Text>
                  </View>
                </View>
                <Text style={styles.timelineLabel}>TRANSFER TIMELINE · LAST 100</Text>
                <View style={styles.personTransactions}>
                  {selectedPerson.transactions.map((transaction) => (
                    <TransactionRow key={transaction.id} transaction={transaction} expanded />
                  ))}
                  {selectedPerson.transactions.length === 0 ? <Text style={styles.emptyModalText}>No transfer entries found.</Text> : null}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </FinanceScreen>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PersonCard({ person }: { person: PersonSummary }): React.JSX.Element {
  const initials = person.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
  const sentMore = new Decimal(person.sent).greaterThanOrEqualTo(person.received);
  return (
    <SurfaceCard style={styles.personCard}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{initials || '•'}</Text></View>
      <View style={styles.personInfo}>
        <Text style={styles.personName} numberOfLines={1}>{person.name}</Text>
        <Text style={styles.personMeta}>{person.transactionCount} transfers · last {formatShortDate(person.lastDate)}</Text>
        <View style={styles.personPills}>
          <InfoPill label={`Sent ${formatINR(person.sent)}`} tone="purple" />
          {new Decimal(person.received).isPositive() ? <InfoPill label={`Got ${formatINR(person.received)}`} tone="green" /> : null}
        </View>
      </View>
      <View style={styles.personNetBlock}>
        <Text style={[styles.personNet, sentMore ? styles.outgoing : styles.incoming]}>{sentMore ? '−' : '+'}{formatINR(new Decimal(person.net).abs().toString())}</Text>
        <Text style={styles.personNetLabel}>net flow</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </SurfaceCard>
  );
}

function MerchantCard({ merchant }: { merchant: MerchantSummary }): React.JSX.Element {
  return (
    <SurfaceCard style={styles.merchantCard}>
      <View style={styles.merchantIcon}><Text style={styles.merchantIconText}>₹</Text></View>
      <View style={styles.personInfo}>
        <Text style={styles.personName} numberOfLines={1}>{merchant.name}</Text>
        <Text style={styles.personMeta}>{merchant.transactionCount} purchases · last {formatShortDate(merchant.lastDate)}</Text>
        <Text style={styles.merchantCategories}>{merchant.categories.slice(0, 3).join(' · ')}</Text>
      </View>
      <View style={styles.personNetBlock}>
        <Text style={styles.merchantSpent}>{formatINR(merchant.spent)}</Text>
        <Text style={styles.personNetLabel}>total spend</Text>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: 9 },
  summaryCard: { flex: 1, padding: 12 },
  summaryLabel: { color: FinanceTheme.colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  summaryAmount: { fontSize: 14, fontWeight: '900', marginTop: 7 },
  summaryHint: { color: FinanceTheme.colors.subtle, fontSize: 8, marginTop: 4 },
  outgoing: { color: FinanceTheme.colors.text },
  incoming: { color: FinanceTheme.colors.green },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: FinanceTheme.colors.surface, borderWidth: 1, borderColor: FinanceTheme.colors.border },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabButtonActive: { backgroundColor: FinanceTheme.colors.primary },
  tabText: { color: FinanceTheme.colors.muted, fontSize: 11, fontWeight: '700' },
  tabTextActive: { color: '#ffffff' },
  searchInput: { minHeight: 43, borderRadius: 12, backgroundColor: FinanceTheme.colors.surface, borderWidth: 1, borderColor: FinanceTheme.colors.border, color: FinanceTheme.colors.text, paddingHorizontal: 12, fontSize: 11 },
  loader: { paddingVertical: 24 },
  errorText: { color: FinanceTheme.colors.red, fontSize: 11 },
  listGap: { gap: 9 },
  personCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(128,92,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: FinanceTheme.colors.primarySoft, fontSize: 13, fontWeight: '800' },
  personInfo: { flex: 1, minWidth: 0 },
  personName: { color: FinanceTheme.colors.text, fontSize: 12, fontWeight: '800' },
  personMeta: { color: FinanceTheme.colors.subtle, fontSize: 9, marginTop: 3 },
  personPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  personNetBlock: { alignItems: 'flex-end', minWidth: 67 },
  personNet: { fontSize: 10, fontWeight: '800' },
  personNetLabel: { color: FinanceTheme.colors.subtle, fontSize: 8, marginTop: 3 },
  chevron: { color: FinanceTheme.colors.subtle, fontSize: 18, marginTop: 3 },
  merchantCard: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 13 },
  merchantIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(88,166,255,0.13)' },
  merchantIconText: { color: FinanceTheme.colors.blue, fontSize: 16, fontWeight: '900' },
  merchantCategories: { color: FinanceTheme.colors.primarySoft, fontSize: 8, marginTop: 5 },
  merchantSpent: { color: FinanceTheme.colors.text, fontSize: 11, fontWeight: '800' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  modalPanel: { maxHeight: '84%', minHeight: 300, padding: 19, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: FinanceTheme.colors.background, borderTopWidth: 1, borderColor: FinanceTheme.colors.border },
  modalTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 },
  modalHeading: { flex: 1 },
  modalTitle: { color: FinanceTheme.colors.text, fontSize: 19, fontWeight: '900' },
  modalSubtitle: { color: FinanceTheme.colors.muted, fontSize: 10, marginTop: 4 },
  closeButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: FinanceTheme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { color: FinanceTheme.colors.text, fontSize: 23, lineHeight: 26 },
  personTotals: { flexDirection: 'row', gap: 10, marginBottom: 17 },
  personTotalBlock: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: FinanceTheme.colors.surface, borderWidth: 1, borderColor: FinanceTheme.colors.border },
  personTotalValue: { fontSize: 15, fontWeight: '900', marginTop: 7 },
  timelineLabel: { color: FinanceTheme.colors.subtle, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8 },
  personTransactions: { flex: 1, backgroundColor: FinanceTheme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: FinanceTheme.colors.border, paddingHorizontal: 12 },
  emptyModalText: { color: FinanceTheme.colors.muted, fontSize: 11, textAlign: 'center', padding: 20 },
});
