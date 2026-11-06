import { Decimal } from 'decimal.js';
import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFinanceColors } from '@/constants/finance-theme';
import { ScalePressable } from '@/components/scale-pressable';
import { SkeletonBlock } from '@/components/finance-ui';
import { triggerLightImpact } from '@/utils/haptics';
import {
  AiApiService,
  type FinancialAnomaly,
} from '@/services/ai-api-service';
import type { GroundedAiAnswer } from '@/services/phase6-service';
import {
  formatDecimalINR,
  TransactionIntelligenceService,
} from '@/services/transaction-intelligence-service';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  answer?: GroundedAiAnswer;
  transactionIds?: string[];
};

type AIChatInterfaceProps = { token: string };

type WeeklySpendingComparison = {
  current: string;
  previous: string;
};

async function loadWeeklySpending(token: string): Promise<WeeklySpendingComparison> {
  const now = new Date();
  const currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  currentStart.setUTCDate(currentStart.getUTCDate() - 6);
  const previousStart = new Date(currentStart);
  previousStart.setUTCDate(previousStart.getUTCDate() - 7);
  const previousEnd = new Date(currentStart.getTime() - 1);

  const [current, previous] = await Promise.all([
    TransactionIntelligenceService.dashboardSummary(token, currentStart.toISOString(), now.toISOString()),
    TransactionIntelligenceService.dashboardSummary(token, previousStart.toISOString(), previousEnd.toISOString()),
  ]);
  return { current: current.totalExpenses, previous: previous.totalExpenses };
}

function spendingComparisonText(comparison: WeeklySpendingComparison): string {
  const current = new Decimal(comparison.current);
  const previous = new Decimal(comparison.previous);
  const currentLabel = formatDecimalINR(current.toString());

  if (previous.isZero()) {
    return current.isZero()
      ? 'No recorded spending was found in the last 7 days or the 7 days before that.'
      : `Recorded spending in the last 7 days was ${currentLabel}. There was no spending in the previous 7-day period, so a percentage comparison is not available.`;
  }

  const change = current.minus(previous).div(previous).mul(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
  const direction = change.isNegative() ? 'lower' : 'higher';
  return `Recorded spending in the last 7 days was ${currentLabel}, ${change.abs().toString()}% ${direction} than the 7 days before. This comparison uses your recorded transactions and excludes internal transfers and loan repayments.`;
}

export function AIChatInterface({ token }: AIChatInterfaceProps): React.JSX.Element {
  const colors = useFinanceColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const nextMessageId = useRef(0);
  const [question, setQuestion] = useState('');
  const [proposalText, setProposalText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const anomalyQueryKey = ['ai-proactive-anomalies', token] as const;
  const anomaliesQuery = useQuery({
    queryKey: anomalyQueryKey,
    queryFn: () => AiApiService.listAnomalies(token),
    enabled: Boolean(token),
    staleTime: 60_000,
  });

  const appendMessage = (message: Omit<Message, 'id'>): void => {
    const id = `message-${nextMessageId.current}`;
    nextMessageId.current += 1;
    setMessages((items) => [...items, { ...message, id }]);
  };

  const query = useMutation({
    mutationFn: (value: string) => AiApiService.submitChatQuery(token, value),
    onSuccess: (answer) => appendMessage({
      role: 'assistant',
      text: answer.direct_answer,
      answer,
    }),
    onError: (error: Error) => appendMessage({ role: 'assistant', text: error.message }),
  });
  const spendingAnalysis = useMutation({
    mutationFn: () => loadWeeklySpending(token),
    onSuccess: (comparison) => appendMessage({
      role: 'assistant',
      text: spendingComparisonText(comparison),
    }),
    onError: (error: Error) => appendMessage({ role: 'assistant', text: error.message }),
  });
  const duplicateScan = useMutation({
    mutationFn: () => AiApiService.listAnomalies(token),
    onSuccess: (anomalies) => {
      queryClient.setQueryData(anomalyQueryKey, anomalies);
      const duplicates = anomalies.filter((anomaly) => anomaly.type === 'possible_duplicate');
      const transactionIds = [...new Set(duplicates.flatMap((anomaly) => anomaly.transaction_ids))];
      appendMessage({
        role: 'assistant',
        text: duplicates.length
          ? `I found ${duplicates.length} possible duplicate match(es):\n${duplicates.map((item) => item.message).join('\n')}`
          : 'I did not find any possible duplicate candidates in the transactions checked.',
        ...(transactionIds.length ? { transactionIds } : {}),
      });
    },
    onError: (error: Error) => appendMessage({ role: 'assistant', text: error.message }),
  });
  const proposal = useMutation({
    mutationFn: (summary: string) => AiApiService.createProposal(token, summary),
  });

  const isBusy = query.isPending || spendingAnalysis.isPending || duplicateScan.isPending;

  const ask = (): void => {
    const text = question.trim();
    if (!text || isBusy) return;
    triggerLightImpact();
    appendMessage({ role: 'user', text });
    setQuestion('');
    query.mutate(text);
  };

  const analyzeSpending = (): void => {
    if (isBusy) return;
    triggerLightImpact();
    appendMessage({ role: 'user', text: 'Analyze my spending' });
    spendingAnalysis.mutate();
  };

  const findDuplicates = (): void => {
    if (isBusy) return;
    triggerLightImpact();
    appendMessage({ role: 'user', text: 'Find duplicate transactions' });
    duplicateScan.mutate();
  };

  const proactiveAnomaly: FinancialAnomaly | undefined = anomaliesQuery.data?.find(
    (anomaly) => !anomaly.reviewed,
  );

  return (
    <View style={styles.container}>
      {anomaliesQuery.isLoading ? (
        <View style={[styles.proactiveCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SkeletonBlock style={styles.proactiveSkeletonHeading} />
          <SkeletonBlock style={styles.proactiveSkeletonBody} />
        </View>
      ) : anomaliesQuery.isError ? (
        <View style={[styles.proactiveCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.small, { color: colors.muted }]}>Proactive alerts could not be loaded.</Text>
          <ScalePressable onPress={() => void anomaliesQuery.refetch()} accessibilityRole="button">
            <Text style={[styles.link, { color: colors.primarySoft }]}>Try again</Text>
          </ScalePressable>
        </View>
      ) : proactiveAnomaly ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          style={[styles.proactiveCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.proactiveHeading}>
            <Text style={[styles.recordHeading, { color: colors.primarySoft }]}>A heads-up from your activity</Text>
            <Text style={[styles.small, { color: colors.muted }]}>{proactiveAnomaly.message}</Text>
          </View>
          {proactiveAnomaly.transaction_ids[0] ? (
            <ScalePressable
              onPress={() => router.push(`/(tabs)/transactions/${proactiveAnomaly.transaction_ids[0]}`)}
              accessibilityRole="link"
            >
              <Text style={[styles.link, { color: colors.primarySoft }]}>Review transaction</Text>
            </ScalePressable>
          ) : null}
        </Animated.View>
      ) : null}

      {messages.length === 0 ? (
        <View style={[styles.intro, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Ask about your records</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            Answers use your recorded transactions and accounts. Spending comparisons are calculated from your ledger; unsupported questions are not turned into financial facts.
          </Text>
        </View>
      ) : null}

      {messages.map((message) => {
        const supportingIds = message.answer?.supporting_transaction_ids ?? message.transactionIds ?? [];
        return (
          <Animated.View
            key={message.id}
            entering={FadeInDown.duration(220)}
            style={[
              styles.message,
              message.role === 'user'
                ? [styles.userMessage, { backgroundColor: colors.primary }]
                : [styles.assistantMessage, { backgroundColor: colors.surface, borderColor: colors.border }],
            ]}
          >
            <Text style={[styles.body, { color: message.role === 'user' ? '#fff' : colors.text }]}>{message.text}</Text>
            {message.answer ? (
              <View style={[styles.records, { borderTopColor: colors.border }]}>
                <Text style={[styles.recordHeading, { color: colors.primarySoft }]}>Supporting records</Text>
                <Text style={[styles.small, { color: colors.muted }]}>
                  {message.answer.period} · {message.answer.transaction_count} record(s) · {message.answer.calculation_explanation}
                </Text>
              </View>
            ) : null}
            {supportingIds.map((id) => (
              <ScalePressable
                accessibilityRole="link"
                key={id}
                onPress={() => router.push(`/(tabs)/transactions/${id}`)}
              >
                <Text style={[styles.link, { color: colors.primarySoft }]}>Open transaction · {id.slice(0, 8)}</Text>
              </ScalePressable>
            ))}
          </Animated.View>
        );
      })}

      {isBusy ? (
        <Animated.View
          entering={FadeInDown.duration(180)}
          style={[styles.typingIndicator, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel="Humaixo is reviewing your financial records"
        >
          <View style={[styles.typingDots, { backgroundColor: colors.primarySoft }]} />
          <View style={[styles.typingDots, { backgroundColor: colors.primarySoft }]} />
          <View style={[styles.typingDots, { backgroundColor: colors.primarySoft }]} />
          <Text style={[styles.small, { color: colors.muted }]}>Humaixo is thinking…</Text>
        </Animated.View>
      ) : null}

      <View style={styles.quickActions}>
        <Text style={[styles.quickActionsLabel, { color: colors.subtle }]}>QUICK ACTIONS</Text>
        <View style={styles.quickActionRow}>
          <ScalePressable
            onPress={analyzeSpending}
            disabled={isBusy}
            accessibilityRole="button"
            style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.quickActionText, { color: colors.primarySoft }]}>Analyze my spending</Text>
          </ScalePressable>
          <ScalePressable
            onPress={findDuplicates}
            disabled={isBusy}
            accessibilityRole="button"
            style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.quickActionText, { color: colors.primarySoft }]}>Find duplicate transactions</Text>
          </ScalePressable>
        </View>
      </View>

      <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask a question about your finances"
          placeholderTextColor={colors.subtle}
          maxLength={500}
          multiline
          accessibilityLabel="Ask a question about your financial records"
          style={[styles.input, { color: colors.text }]}
        />
        <ScalePressable
          onPress={ask}
          disabled={!question.trim() || isBusy}
          accessibilityRole="button"
          accessibilityLabel="Send question"
          style={[styles.sendButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.sendText}>Ask</Text>
        </ScalePressable>
      </View>

      <View style={[styles.proposalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.recordHeading, { color: colors.text }]}>Tier 2 · Request Approval</Text>
        <Text style={[styles.small, { color: colors.muted }]}>Submit a settings proposal for a configured human owner. Approval does not execute it automatically.</Text>
        <TextInput
          value={proposalText}
          onChangeText={setProposalText}
          placeholder="Describe the requested settings change"
          placeholderTextColor={colors.subtle}
          maxLength={1000}
          multiline
          style={[styles.input, styles.proposalInput, { color: colors.text, borderColor: colors.border }]}
        />
        <ScalePressable
          onPress={() => proposal.mutate(proposalText.trim(), { onSuccess: () => setProposalText('') })}
          disabled={!proposalText.trim() || proposal.isPending}
          accessibilityRole="button"
          style={[styles.sendButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.sendText}>{proposal.isPending ? 'Submitting…' : 'Request Approval'}</Text>
        </ScalePressable>
        {proposal.isError ? <Text style={[styles.small, { color: colors.red }]}>{proposal.error.message}</Text> : null}
        {proposal.isSuccess ? <Text style={[styles.small, { color: colors.green }]}>Proposal submitted: {proposal.data.id}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  proactiveCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  proactiveHeading: { gap: 5 },
  proactiveSkeletonHeading: { width: '62%', height: 13, borderRadius: 6 },
  proactiveSkeletonBody: { width: '92%', height: 32, borderRadius: 7 },
  intro: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 7 },
  title: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19 },
  message: { maxWidth: '94%', borderRadius: 16, padding: 13, gap: 9 },
  userMessage: { alignSelf: 'flex-end' },
  assistantMessage: { alignSelf: 'flex-start', borderWidth: 1 },
  records: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 6 },
  recordHeading: { fontSize: 13, fontWeight: '800' },
  small: { fontSize: 11, lineHeight: 16 },
  link: { fontSize: 12, fontWeight: '700', paddingVertical: 3 },
  typingIndicator: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  typingDots: { width: 5, height: 5, borderRadius: 3 },
  quickActions: { gap: 7 },
  quickActionsLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  quickActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  quickAction: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 9 },
  quickActionText: { fontSize: 11, fontWeight: '700' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderRadius: 14, padding: 8 },
  input: { flex: 1, minHeight: 42, maxHeight: 110, padding: 9, fontSize: 13 },
  sendButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 13 },
  sendText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  proposalCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 9 },
  proposalInput: { borderWidth: 1, borderRadius: 10 },
});
