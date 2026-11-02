import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { LineChart, PieChart } from 'react-native-chart-kit';
import * as Clipboard from 'expo-clipboard';
import { FinanceScreen } from '@/components/finance-screen';
import { EmptyState, SectionHeader, SurfaceCard, TransactionRow, PrimaryButton } from '@/components/finance-ui';
import { FinanceTheme, formatINR } from '@/constants/finance-theme';
import { useAuth } from '@/auth/auth-context';
import { FinanceService } from '@/services/finance-service';
import { useFinanceStore } from '@/store/finance-store';
import type { FinanceTransaction } from '@/types/finance';
import { CashFlowFallback, CategoryBreakdownFallback } from '@/components/web-chart-fallbacks';
import { PreferencesService } from '@/services/preferences-service';

const CHART_COLORS = ['#8b6cff', '#22c997', '#f5b84b', '#58a6ff', '#ff6375', '#d879ff'];

type SpendingChartItem = {
  name: string;
  amount: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
};

const GUEST_CHART: SpendingChartItem[] = [
  { name: 'Food', amount: 4200, color: '#8b6cff', legendFontColor: '#a1a1b3', legendFontSize: 11 },
  { name: 'Travel', amount: 2800, color: '#22c997', legendFontColor: '#a1a1b3', legendFontSize: 11 },
  { name: 'Bills', amount: 1900, color: '#f5b84b', legendFontColor: '#a1a1b3', legendFontSize: 11 },
  { name: 'Shopping', amount: 1500, color: '#58a6ff', legendFontColor: '#a1a1b3', legendFontSize: 11 },
];

function isSuccessfulParse(
  value: unknown,
): value is { success: true; data: FinanceTransaction } {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { success?: unknown; data?: unknown };
  if (candidate.success !== true || typeof candidate.data !== 'object' || candidate.data === null) return false;
  const transaction = candidate.data as Partial<FinanceTransaction>;
  return (
    typeof transaction.id === 'string' &&
    typeof transaction.amount === 'number' &&
    (transaction.type === 'credit' || transaction.type === 'debit') &&
    typeof transaction.merchant === 'string'
  );
}

export default function HomeScreen(): React.JSX.Element {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktopViewport = Platform.OS === 'web' && screenWidth >= 1024;
  const chartWidth = isDesktopViewport
    ? Math.min(720, Math.max(240, screenWidth - 320))
    : Math.min(680, Math.max(240, screenWidth - (screenWidth < 480 ? 76 : 96)));
  const { status, token, user } = useAuth();
  const isGuest = status !== 'authenticated' || !token;
  const accounts = useFinanceStore((state) => state.accounts);
  const transactions = useFinanceStore((state) => state.transactions);
  const analytics = useFinanceStore((state) => state.analytics);
  const loading = useFinanceStore((state) => state.loading);
  const dashboardError = useFinanceStore((state) => state.error);
  const refreshDashboard = useFinanceStore((state) => state.refreshDashboard);
  const [smsText, setSmsText] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [isParsing, setIsParsing] = useState(false);
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const [balanceHidden, setBalanceHidden] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && token) {
      void refreshDashboard(token);
    }
  }, [refreshDashboard, status, token]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void PreferencesService.getHideBalances()
      .then((hidden) => { if (active) setBalanceHidden(hidden); })
      .catch((error: unknown) => {
        Alert.alert(
          'Could not load preferences',
          error instanceof Error ? error.message : 'Dashboard privacy preferences are unavailable.',
        );
      });
    return () => { active = false; };
  }, []));

  const activeAccountId = selectedAccountId ?? accounts[0]?.id;

  const chartData = useMemo(() => {
    if (isGuest) return GUEST_CHART;
    return (analytics?.byCategory ?? []).map((item, index) => ({
      name: item.category,
      amount: item.amount,
      color: CHART_COLORS[index % CHART_COLORS.length],
      legendFontColor: '#a1a1b3',
      legendFontSize: 11,
    }));
  }, [analytics?.byCategory, isGuest]);

  const requireLogin = (): void => router.push('/login');

  const parseAndSaveSms = async (sms: string): Promise<void> => {
    if (isGuest || !token) {
      requireLogin();
      return;
    }
    const normalizedSms = sms.trim();
    if (!normalizedSms) {
      Alert.alert('SMS required', 'Paste a bank transaction message first.');
      return;
    }
    setIsParsing(true);
    try {
      const result: unknown = await FinanceService.parseSms(
        token,
        normalizedSms,
        activeAccountId,
      );
      if (!isSuccessfulParse(result)) {
        throw new Error('The parser returned incomplete transaction details.');
      }
      setSmsText('');
      await refreshDashboard(token);
      Alert.alert(
        'Transaction added',
        `${result.data.merchant} · ${formatINR(result.data.amount)}`,
      );
    } catch (error) {
      Alert.alert(
        'Could not parse SMS',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleParseSms = async (): Promise<void> => parseAndSaveSms(smsText);

  const handleClipboardParse = async (): Promise<void> => {
    if (isGuest || !token) {
      requireLogin();
      return;
    }

    setIsParsing(true);
    try {
      const clipboardText = (await Clipboard.getStringAsync()).trim();
      if (!clipboardText) {
        Alert.alert('Clipboard is empty', 'Copy a bank transaction SMS first, then tap this button again.');
        return;
      }
      setSmsText(clipboardText);
      const result: unknown = await FinanceService.parseSms(token, clipboardText, activeAccountId);
      if (!isSuccessfulParse(result)) {
        throw new Error('The parser returned incomplete transaction details.');
      }
      setSmsText('');
      await refreshDashboard(token);
      Alert.alert('Transaction added', `${result.data.merchant} · ${formatINR(result.data.amount)}`);
    } catch (error) {
      Alert.alert(
        'Could not read or parse clipboard',
        error instanceof Error ? error.message : 'Allow clipboard access and try again.',
      );
    } finally {
      setIsParsing(false);
    }
  };

  const toggleBalanceVisibility = (): void => {
    const nextHidden = !balanceHidden;
    setBalanceHidden(nextHidden);
    void PreferencesService.setHideBalances(nextHidden).catch((error: unknown) => {
      setBalanceHidden(!nextHidden);
      Alert.alert(
        'Could not save preference',
        error instanceof Error ? error.message : 'Please try again.',
      );
    });
  };

  const netWorth = analytics?.trackedBalance ?? 0;
  const currentMonth = analytics?.thisMonth;
  const greetingName = user?.name?.trim().split(/\s+/)[0] || 'there';

  return (
    <FinanceScreen
      title={`Good ${getTimeGreeting()}, ${isGuest ? 'there' : greetingName}`}
      subtitle={isGuest ? 'Explore your personal finance command center.' : 'Your money, clearly understood.'}
      activeTab="home"
      rightAction={(
        <TouchableOpacity
          onPress={() => (isGuest ? requireLogin() : router.push('/profile'))}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel={isGuest ? 'Login' : 'Open profile'}
        >
          <Text style={styles.headerButtonText}>{isGuest ? 'Login' : '◎'}</Text>
        </TouchableOpacity>
      )}
    >
      <View style={styles.balanceCard}>
        <View style={styles.balanceTopRow}>
          <View style={styles.balanceLabelRow}>
            <Text style={styles.balanceLabel}>{isGuest ? 'NET WORTH PREVIEW' : 'TOTAL NET WORTH'}</Text>
            <TouchableOpacity
              onPress={toggleBalanceVisibility}
              accessibilityRole="button"
              accessibilityLabel={balanceHidden ? 'Show balance' : 'Hide balance'}
            >
              <Text style={styles.eyeIcon}>{balanceHidden ? '◉' : '◎'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.previewChip}>
            <Text style={styles.previewChipText}>{isGuest ? 'DEMO' : 'LIVE'}</Text>
          </View>
        </View>
        <Text style={styles.balanceValue}>
          {balanceHidden ? '₹ ••••••' : isGuest ? '₹4,52,380' : formatINR(netWorth)}
        </Text>
        <Text style={styles.balanceCaption}>
          {isGuest
            ? 'Example figures · Your statement data stays yours'
            : `${accounts.length} tracked account${accounts.length === 1 ? '' : 's'} · updated from your ledger`}
        </Text>
        <View style={styles.balanceMetrics}>
          <View style={styles.balanceMetric}>
            <Text style={styles.balanceMetricLabel}>Income this month</Text>
            <Text style={[styles.balanceMetricValue, styles.incomeText]}>
              {isGuest ? '+₹75,000' : `+${formatINR(currentMonth?.income ?? 0)}`}
            </Text>
          </View>
          <View style={styles.balanceMetricDivider} />
          <View style={styles.balanceMetric}>
            <Text style={styles.balanceMetricLabel}>Spent this month</Text>
            <Text style={[styles.balanceMetricValue, styles.expenseText]}>
              {isGuest ? '−₹56,600' : `−${formatINR(currentMonth?.expense ?? 0)}`}
            </Text>
          </View>
        </View>
      </View>

      {!isGuest && dashboardError ? (
        <SurfaceCard style={styles.errorCard}>
          <Text style={styles.errorText}>{dashboardError}</Text>
          <TouchableOpacity onPress={() => token && void refreshDashboard(token)}>
            <Text style={styles.retryText}>Retry loading dashboard</Text>
          </TouchableOpacity>
        </SurfaceCard>
      ) : null}

      <View style={styles.statsGrid}>
        <SurfaceCard style={styles.statCard}>
          <View style={styles.statIconGreen}><Text style={styles.statIconText}>↙</Text></View>
          <Text style={styles.statLabel}>INCOME TODAY</Text>
          <Text style={[styles.statValue, styles.incomeText]}>
            {isGuest ? '₹5,000' : formatINR(analytics?.today.income ?? 0)}
          </Text>
          <Text style={styles.statHint}>{isGuest ? 'Preview data' : 'Across your accounts'}</Text>
        </SurfaceCard>
        <SurfaceCard style={styles.statCard}>
          <View style={styles.statIconRed}><Text style={styles.statIconText}>↗</Text></View>
          <Text style={styles.statLabel}>SPENT TODAY</Text>
          <Text style={[styles.statValue, styles.expenseText]}>
            {isGuest ? '₹1,240' : formatINR(analytics?.today.expense ?? 0)}
          </Text>
          <Text style={styles.statHint}>{isGuest ? 'Preview data' : 'All tracked spending'}</Text>
        </SurfaceCard>
      </View>

      <View>
        <SectionHeader
          title="Linked Accounts"
          actionLabel={isGuest ? 'Login to add' : accounts.length > 0 ? 'Manage' : '＋ Add account'}
          onAction={() => (isGuest ? requireLogin() : router.push('/accounts'))}
        />
        {isGuest ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountStrip}>
            <AccountPreview label="HDFC Bank" suffix="•••• 4521" value="₹2,10,450" color="#2876d2" />
            <AccountPreview label="SBI Savings" suffix="•••• 8832" value="₹1,84,200" color="#4c7ee8" />
            <AccountPreview label="PhonePe Wallet" suffix="UPI Wallet" value="₹12,730" color="#a26aff" />
          </ScrollView>
        ) : accounts.length === 0 ? (
          <SurfaceCard style={styles.addAccountCard}>
            <Text style={styles.accountEmptyTitle}>Start with an account balance</Text>
            <Text style={styles.accountEmptyText}>Add your bank, wallet, cash, or card account before importing a statement.</Text>
            <PrimaryButton label="Add your first account" onPress={() => router.push('/accounts')} />
          </SurfaceCard>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountStrip}>
            {accounts.map((account) => (
              <TouchableOpacity
                key={account.id}
                onPress={() => router.push('/accounts')}
                style={[styles.accountCard, { borderTopColor: account.color }]}
              >
                <View style={styles.accountTitleRow}>
                  <View style={[styles.accountAvatar, { backgroundColor: `${account.color}30` }]}>
                    <Text style={[styles.accountAvatarText, { color: account.color }]}>{account.institution.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.accountTitleContent}>
                    <Text style={styles.accountName} numberOfLines={1}>{account.name}</Text>
                    <Text style={styles.accountSuffix}>{account.accountSuffix ? `•••• ${account.accountSuffix}` : account.type.replace('_', ' ')}</Text>
                  </View>
                </View>
                <Text style={styles.accountBalance}>{formatINR(account.balance)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.addAccountTile} onPress={() => router.push('/accounts')}>
              <Text style={styles.addAccountPlus}>＋</Text>
              <Text style={styles.addAccountTileText}>Add account</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      <View style={styles.quickActions}>
        <QuickAction icon="＋" label="Add transaction" onPress={() => (isGuest ? requireLogin() : router.push('/add-transaction'))} />
        <QuickAction icon="⇧" label="Import statement" onPress={() => (isGuest ? requireLogin() : router.push('/statement-import'))} />
        <QuickAction icon="▤" label="Import PDF" onPress={() => (isGuest ? requireLogin() : router.push('/parse-statement'))} />
      </View>

      <View>
        <SectionHeader title="AI SMS Assistant" />
        <SurfaceCard style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <View style={styles.aiIcon}><Text style={styles.aiIconText}>✦</Text></View>
            <View style={styles.aiTitleBlock}>
              <Text style={styles.aiTitle}>Parse a bank message</Text>
              <Text style={styles.aiDescription}>Extract amount, payee, category and ledger balance.</Text>
            </View>
            {isGuest ? <Text style={styles.lockIcon}>▣</Text> : null}
          </View>
          <TextInput
            value={smsText}
            onChangeText={setSmsText}
            placeholder="Paste a bank SMS here…"
            placeholderTextColor={FinanceTheme.colors.subtle}
            multiline
            editable={!isParsing}
            style={styles.smsInput}
            accessibilityLabel="Bank SMS text"
          />
          {!isGuest && accounts.length > 0 ? (
            <View style={styles.accountSelectRow}>
              <Text style={styles.accountSelectLabel}>Save to:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {accounts.map((account) => (
                  <TouchableOpacity
                    key={account.id}
                    onPress={() => setSelectedAccountId(account.id)}
                    style={[styles.accountChip, activeAccountId === account.id && styles.accountChipActive]}
                  >
                    <Text style={[styles.accountChipText, activeAccountId === account.id && styles.accountChipTextActive]}>{account.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <PrimaryButton
            label={isGuest ? '🔒 Login to save transactions' : 'Parse with AI'}
            onPress={() => void handleParseSms()}
            loading={isParsing}
            disabled={!isGuest && !smsText.trim()}
          />
          {!isGuest ? (
            <PrimaryButton
              label="Read copied SMS and parse"
              onPress={() => void handleClipboardParse()}
              disabled={isParsing}
              secondary
            />
          ) : null}
          {!isGuest ? (
            <Text style={styles.guestHint}>
              Clipboard access starts only when you tap. The SMS is sent to your API and retained with the transaction as a source record.
            </Text>
          ) : null}
          {isGuest ? <Text style={styles.guestHint}>Guest preview is read-only. Sign in to parse and save.</Text> : null}
        </SurfaceCard>
      </View>

      <View>
        <SectionHeader
          title={isGuest ? 'Spending by Category · Preview' : 'Spending by Category'}
          actionLabel={isGuest ? undefined : 'See insights'}
          onAction={isGuest ? undefined : () => router.push('/insights')}
        />
        <SurfaceCard style={styles.chartCard}>
          {!isGuest && chartData.length === 0 ? (
            <EmptyState
              title="No spending categories yet"
              description="Import a bank statement or add transactions to build your spending chart."
              action={<PrimaryButton label="Import statement" onPress={() => router.push('/statement-import')} />}
            />
          ) : (
            <>
              {isGuest ? <Text style={styles.chartDemoLabel}>EXAMPLE DATA · NOT YOUR ACCOUNT</Text> : null}
              {Platform.OS === 'web' ? (
                <CategoryBreakdownFallback data={chartData.map(({ name, amount, color }) => ({ name, amount, color }))} />
              ) : (
                <PieChart
                  data={chartData.map(({ amount, ...chartItem }) => ({ ...chartItem, population: amount }))}
                  width={chartWidth}
                  height={190}
                  chartConfig={{
                    backgroundColor: FinanceTheme.colors.surface,
                    backgroundGradientFrom: FinanceTheme.colors.surface,
                    backgroundGradientTo: FinanceTheme.colors.surface,
                    color: (opacity = 1) => `rgba(255,255,255,${opacity})`,
                  }}
                  accessor="population"
                  backgroundColor="transparent"
                  paddingLeft="8"
                  absolute
                  hasLegend
                />
              )}
              {isGuest ? <Text style={styles.chartFootnote}>Sign in and import a statement to see your real breakdown.</Text> : null}
            </>
          )}
        </SurfaceCard>
      </View>

      <View>
        <SectionHeader title="Monthly cash flow" />
        <SurfaceCard style={styles.chartCard}>
          {!isGuest && !analytics?.monthlyTotals.length ? (
            <Text style={styles.chartFootnote}>Add transactions to see your monthly income and spending trend.</Text>
          ) : isGuest ? (
            <CashFlowFallback data={[
              { label: 'Jun', income: 68000, expense: 47200 },
              { label: 'Jul', income: 71000, expense: 51800 },
              { label: 'Aug', income: 75000, expense: 56600 },
              { label: 'Sep', income: 73500, expense: 49300 },
              { label: 'Oct', income: 79000, expense: 57200 },
              { label: 'Nov', income: 75000, expense: 56600 },
            ]} />
          ) : Platform.OS === 'web' ? (
            <CashFlowFallback
              data={(analytics?.monthlyTotals ?? []).slice(-6).map((month) => ({
                label: new Date(month.year, month.month - 1).toLocaleDateString('en-IN', { month: 'short' }),
                income: month.income,
                expense: month.expense,
              }))}
            />
          ) : (
            <LineChart
              data={{
                labels: (analytics?.monthlyTotals ?? []).slice(-6).map((month) =>
                  new Date(month.year, month.month - 1).toLocaleDateString('en-IN', { month: 'short' }),
                ),
                datasets: [
                  {
                    data: (analytics?.monthlyTotals ?? []).slice(-6).map((month) => month.expense),
                    color: () => FinanceTheme.colors.red,
                    strokeWidth: 3,
                  },
                  {
                    data: (analytics?.monthlyTotals ?? []).slice(-6).map((month) => month.income),
                    color: () => FinanceTheme.colors.green,
                    strokeWidth: 3,
                  },
                ],
                legend: ['Spent', 'Income'],
              }}
              width={chartWidth}
              height={220}
              chartConfig={{
                backgroundColor: FinanceTheme.colors.surface,
                backgroundGradientFrom: FinanceTheme.colors.surface,
                backgroundGradientTo: FinanceTheme.colors.surface,
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(255,255,255,${opacity})`,
                labelColor: () => FinanceTheme.colors.muted,
                propsForDots: { r: '3', strokeWidth: '2', stroke: FinanceTheme.colors.surface },
                propsForBackgroundLines: { stroke: FinanceTheme.colors.border },
              }}
              bezier
              withInnerLines
              withOuterLines={false}
              style={styles.lineChart}
            />
          )}
          {isGuest ? <Text style={styles.chartFootnote}>Illustrative preview · sign in to see your own cash flow.</Text> : null}
          {!isGuest ? <Text style={styles.chartLegend}>Spent  ·  Income</Text> : null}
        </SurfaceCard>
      </View>

      <View>
        <SectionHeader
          title="Recent Activity"
          actionLabel={isGuest ? 'Explore' : 'View all'}
          onAction={() => router.push('/transactions')}
        />
        <SurfaceCard style={styles.activityCard}>
          {isGuest ? (
            <>
              <TransactionRow transaction={createPreviewTransaction('preview-food', 'Swiggy', 450, 'debit', 'Food')} />
              <TransactionRow transaction={createPreviewTransaction('preview-salary', 'Salary · TCS Ltd', 75000, 'credit', 'Income')} />
              <TransactionRow transaction={createPreviewTransaction('preview-fuel', 'Indian Oil', 1200, 'debit', 'Fuel')} />
              <Text style={styles.chartFootnote}>Sample transactions · Login to see your own activity.</Text>
            </>
          ) : loading ? (
            <ActivityIndicator color={FinanceTheme.colors.primarySoft} style={styles.activityLoader} />
          ) : transactions.length === 0 ? (
            <EmptyState
              title="Your ledger starts here"
              description="Import a statement or add a transaction. We will keep each date, account and balance together."
              action={<PrimaryButton label="Import bank statement" onPress={() => router.push('/statement-import')} />}
            />
          ) : (
            transactions.slice(0, 5).map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                accountName={accounts.find((account) => account.id === transaction.accountId)?.name}
                expanded={expandedTransactionId === transaction.id}
                onPress={() => setExpandedTransactionId((current) => current === transaction.id ? null : transaction.id)}
              />
            ))
          )}
        </SurfaceCard>
      </View>

      <View>
        <SectionHeader title="AI Money Signals" actionLabel={isGuest ? undefined : 'Open insights'} onAction={isGuest ? undefined : () => router.push('/insights')} />
        <InsightCard
          tone="amber"
          icon="⚠"
          title={isGuest ? 'Spending signals' : getSpendingSignal(analytics?.byCategory ?? []).title}
          description={isGuest ? 'Humaixo can spot changing spend, recurring charges and unusual activity in your statements.' : getSpendingSignal(analytics?.byCategory ?? []).description}
        />
        <InsightCard
          tone="green"
          icon="✦"
          title={isGuest ? 'Smarter money habits' : 'Your savings rate, made visible'}
          description={isGuest ? 'See monthly income versus expenses, then use history to understand how your balance changed.' : getSavingsSignal(analytics)}
        />
      </View>
    </FinanceScreen>
  );
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function getSpendingSignal(categories: { category: string; amount: number; count: number }[]): { title: string; description: string } {
  const top = categories[0];
  if (!top) return { title: 'Add a statement to unlock insights', description: 'Your statement data will power category trends, recipient totals and recurring-spend alerts.' };
  return {
    title: `${top.category} is your highest tracked category`,
    description: `${formatINR(top.amount)} across ${top.count} transaction${top.count === 1 ? '' : 's'} in the last 12 months.`,
  };
}

function getSavingsSignal(analytics: ReturnType<typeof useFinanceStore.getState>['analytics']): string {
  if (!analytics || analytics.totals.income <= 0) return 'Import an account statement to calculate your income, expenses and savings rate.';
  const savingsRate = Math.round(((analytics.totals.income - analytics.totals.expense) / analytics.totals.income) * 100);
  return `Across the selected period, income was ${formatINR(analytics.totals.income)} and expenses were ${formatINR(analytics.totals.expense)}. Tracked savings rate: ${savingsRate}%.`;
}

function createPreviewTransaction(
  id: string,
  merchant: string,
  amount: number,
  type: 'credit' | 'debit',
  category: string,
): FinanceTransaction {
  return {
    id,
    accountId: null,
    merchant,
    amount,
    type,
    category,
    counterparty: null,
    counterpartyKey: null,
    counterpartyType: null,
    paymentMethod: type === 'credit' ? 'BANK CREDIT' : 'UPI',
    date: new Date().toISOString(),
    balanceBefore: null,
    balanceAfter: null,
    referenceNumber: null,
    note: null,
    source: 'manual',
    confidence: 1,
    description: null,
  };
}

function AccountPreview({ label, suffix, value, color }: { label: string; suffix: string; value: string; color: string }): React.JSX.Element {
  return (
    <View style={[styles.accountCard, { borderTopColor: color }]}>
      <View style={styles.accountTitleRow}>
        <View style={[styles.accountAvatar, { backgroundColor: `${color}30` }]}><Text style={[styles.accountAvatarText, { color }]}>{label.slice(0, 1)}</Text></View>
        <View style={styles.accountTitleContent}>
          <Text style={styles.accountName} numberOfLines={1}>{label}</Text>
          <Text style={styles.accountSuffix}>{suffix}</Text>
        </View>
      </View>
      <Text style={styles.accountBalance}>{value}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }): React.JSX.Element {
  return (
    <TouchableOpacity onPress={onPress} style={styles.quickAction} accessibilityRole="button">
      <View style={styles.quickActionIcon}><Text style={styles.quickActionIconText}>{icon}</Text></View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function InsightCard({
  tone,
  icon,
  title,
  description,
}: {
  tone: 'amber' | 'green';
  icon: string;
  title: string;
  description: string;
}): React.JSX.Element {
  return (
    <SurfaceCard style={[styles.insightCard, tone === 'amber' ? styles.insightAmber : styles.insightGreen]}>
      <View style={[styles.insightIcon, tone === 'amber' ? styles.insightIconAmber : styles.insightIconGreen]}>
        <Text style={[styles.insightIconText, tone === 'amber' ? styles.insightAmberText : styles.insightGreenText]}>{icon}</Text>
      </View>
      <View style={styles.insightContent}>
        <Text style={styles.insightTitle}>{title}</Text>
        <Text style={styles.insightDescription}>{description}</Text>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  headerButton: { minWidth: 42, paddingHorizontal: 12, height: 36, borderRadius: 12, backgroundColor: FinanceTheme.colors.surfaceRaised, borderWidth: 1, borderColor: FinanceTheme.colors.border, alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: FinanceTheme.colors.primarySoft, fontSize: 12, fontWeight: '800' },
  balanceCard: { padding: 20, borderRadius: 23, backgroundColor: '#21143d', borderWidth: 1, borderColor: 'rgba(139,108,255,0.34)', overflow: 'hidden' },
  balanceTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  balanceLabel: { color: '#c3bbda', fontSize: 10, letterSpacing: 0.9, fontWeight: '800' },
  eyeIcon: { color: '#b5a4ff', fontSize: 14, fontWeight: '800' },
  previewChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(181,164,255,0.15)' },
  previewChipText: { color: '#d1c5ff', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  balanceValue: { color: '#ffffff', fontSize: 35, fontWeight: '900', letterSpacing: -1, marginTop: 9 },
  balanceCaption: { color: '#a89cbe', fontSize: 10, marginTop: 4 },
  balanceMetrics: { marginTop: 19, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center' },
  balanceMetric: { flex: 1, gap: 5 },
  balanceMetricLabel: { color: '#aaa0be', fontSize: 9 },
  balanceMetricValue: { fontSize: 14, fontWeight: '800' },
  balanceMetricDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.13)', marginHorizontal: 14 },
  incomeText: { color: FinanceTheme.colors.green },
  expenseText: { color: FinanceTheme.colors.red },
  errorCard: { borderColor: 'rgba(255,99,117,0.4)' },
  errorText: { color: FinanceTheme.colors.red, fontSize: 11 },
  retryText: { color: FinanceTheme.colors.primarySoft, fontSize: 11, fontWeight: '700', marginTop: 9 },
  statsGrid: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, padding: 14, minHeight: 120 },
  statIconGreen: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(33,201,151,0.13)', marginBottom: 10 },
  statIconRed: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,99,117,0.13)', marginBottom: 10 },
  statIconText: { color: FinanceTheme.colors.muted, fontWeight: '900', fontSize: 15 },
  statLabel: { color: FinanceTheme.colors.subtle, fontSize: 8, letterSpacing: 0.5, fontWeight: '800' },
  statValue: { fontSize: 17, fontWeight: '900', marginTop: 5 },
  statHint: { color: FinanceTheme.colors.subtle, fontSize: 9, marginTop: 3 },
  accountStrip: { gap: 10, paddingRight: 4 },
  accountCard: { width: 190, padding: 13, borderRadius: 16, backgroundColor: FinanceTheme.colors.surface, borderWidth: 1, borderColor: FinanceTheme.colors.border, borderTopWidth: 3 },
  accountTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountAvatar: { width: 29, height: 29, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  accountAvatarText: { fontSize: 13, fontWeight: '900' },
  accountTitleContent: { flex: 1, minWidth: 0 },
  accountName: { color: FinanceTheme.colors.text, fontSize: 11, fontWeight: '700' },
  accountSuffix: { color: FinanceTheme.colors.subtle, fontSize: 9, marginTop: 2, textTransform: 'capitalize' },
  accountBalance: { color: FinanceTheme.colors.text, fontSize: 16, fontWeight: '800', marginTop: 15 },
  addAccountTile: { width: 112, minHeight: 90, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#4a4268', alignItems: 'center', justifyContent: 'center', gap: 5 },
  addAccountPlus: { color: FinanceTheme.colors.primarySoft, fontSize: 21, fontWeight: '600' },
  addAccountTileText: { color: FinanceTheme.colors.muted, fontSize: 9, fontWeight: '700' },
  addAccountCard: { gap: 12 },
  accountEmptyTitle: { color: FinanceTheme.colors.text, fontSize: 13, fontWeight: '700' },
  accountEmptyText: { color: FinanceTheme.colors.muted, fontSize: 10, lineHeight: 15 },
  quickActions: { flexDirection: 'row', gap: 10 },
  quickAction: { flex: 1, backgroundColor: FinanceTheme.colors.surface, borderWidth: 1, borderColor: FinanceTheme.colors.border, borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  quickActionIcon: { width: 30, height: 30, backgroundColor: 'rgba(128,92,255,0.17)', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickActionIconText: { color: FinanceTheme.colors.primarySoft, fontSize: 17, fontWeight: '800' },
  quickActionLabel: { color: FinanceTheme.colors.text, fontSize: 10, fontWeight: '700', flexShrink: 1 },
  aiCard: { padding: 14, gap: 12 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(128,92,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  aiIconText: { color: FinanceTheme.colors.primarySoft, fontSize: 18, fontWeight: '900' },
  aiTitleBlock: { flex: 1 },
  aiTitle: { color: FinanceTheme.colors.text, fontSize: 12, fontWeight: '800' },
  aiDescription: { color: FinanceTheme.colors.muted, fontSize: 9, marginTop: 3 },
  lockIcon: { color: FinanceTheme.colors.muted, fontSize: 15 },
  smsInput: { minHeight: 72, maxHeight: 150, borderRadius: 12, backgroundColor: FinanceTheme.colors.background, borderColor: FinanceTheme.colors.border, borderWidth: 1, color: FinanceTheme.colors.text, textAlignVertical: 'top', padding: 12, fontSize: 11, lineHeight: 16 },
  accountSelectRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountSelectLabel: { color: FinanceTheme.colors.muted, fontSize: 10, fontWeight: '700' },
  accountChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: FinanceTheme.colors.surfaceRaised, marginRight: 7, borderWidth: 1, borderColor: FinanceTheme.colors.border },
  accountChipActive: { backgroundColor: 'rgba(128,92,255,0.22)', borderColor: FinanceTheme.colors.primary },
  accountChipText: { color: FinanceTheme.colors.muted, fontSize: 9 },
  accountChipTextActive: { color: FinanceTheme.colors.primarySoft, fontWeight: '700' },
  guestHint: { color: FinanceTheme.colors.subtle, fontSize: 9, textAlign: 'center', marginTop: -4 },
  chartCard: { paddingHorizontal: 7, alignItems: 'center', minHeight: 205 },
  lineChart: { marginVertical: 8, borderRadius: 16 },
  chartLegend: { color: FinanceTheme.colors.muted, fontSize: 12, marginBottom: 8 },
  chartDemoLabel: { color: FinanceTheme.colors.amber, fontSize: 8, fontWeight: '800', letterSpacing: 0.6, alignSelf: 'flex-start', marginLeft: 9, marginTop: 6 },
  chartFootnote: { color: FinanceTheme.colors.subtle, fontSize: 9, textAlign: 'center', marginVertical: 8, lineHeight: 14 },
  activityCard: { paddingHorizontal: 13, paddingVertical: 4 },
  activityLoader: { paddingVertical: 24 },
  insightCard: { padding: 13, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  insightAmber: { borderColor: 'rgba(245,184,75,0.25)', backgroundColor: '#1c1a20' },
  insightGreen: { borderColor: 'rgba(33,201,151,0.2)', backgroundColor: '#141d1b' },
  insightIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  insightIconAmber: { backgroundColor: 'rgba(245,184,75,0.14)' },
  insightIconGreen: { backgroundColor: 'rgba(33,201,151,0.13)' },
  insightIconText: { fontSize: 15, fontWeight: '900' },
  insightAmberText: { color: FinanceTheme.colors.amber },
  insightGreenText: { color: FinanceTheme.colors.green },
  insightContent: { flex: 1 },
  insightTitle: { color: FinanceTheme.colors.text, fontSize: 11, fontWeight: '800' },
  insightDescription: { color: FinanceTheme.colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
});
