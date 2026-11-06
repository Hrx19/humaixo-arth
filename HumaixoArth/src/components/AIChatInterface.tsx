import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useFinanceColors } from '@/constants/finance-theme';
import { AiApiService } from '@/services/ai-api-service';
import type { GroundedAiAnswer } from '@/services/phase6-service';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  answer?: GroundedAiAnswer;
};

type AIChatInterfaceProps = { token: string };

export function AIChatInterface({ token }: AIChatInterfaceProps): React.JSX.Element {
  const colors = useFinanceColors();
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [proposalText, setProposalText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const query = useMutation({
    mutationFn: (value: string) => AiApiService.submitChatQuery(token, value),
    onSuccess: (answer) => setMessages((items) => [
      ...items,
      { id: `assistant-${Date.now()}`, role: 'assistant', text: answer.direct_answer, answer },
    ]),
    onError: (error: Error) => setMessages((items) => [
      ...items,
      { id: `error-${Date.now()}`, role: 'assistant', text: error.message },
    ]),
  });
  const proposal = useMutation({
    mutationFn: (summary: string) => AiApiService.createProposal(token, summary),
  });

  const ask = (): void => {
    const text = question.trim();
    if (!text || query.isPending) return;
    setMessages((items) => [...items, { id: `user-${Date.now()}`, role: 'user', text }]);
    setQuestion('');
    query.mutate(text);
  };

  return (
    <View style={styles.container}>
      {messages.length === 0 ? (
        <View style={[styles.intro, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Ask about your records</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            Answers use your recorded transactions and accounts only. Unsupported questions are not turned into financial facts.
          </Text>
        </View>
      ) : null}
      {messages.map((message) => (
        <View key={message.id} style={[
          styles.message,
          message.role === 'user'
            ? [styles.userMessage, { backgroundColor: colors.primary }]
            : [styles.assistantMessage, { backgroundColor: colors.surface, borderColor: colors.border }],
        ]}>
          <Text style={[styles.body, { color: message.role === 'user' ? '#fff' : colors.text }]}>{message.text}</Text>
          {message.answer ? (
            <View style={[styles.records, { borderTopColor: colors.border }]}>
              <Text style={[styles.recordHeading, { color: colors.primarySoft }]}>Supporting Records</Text>
              <Text style={[styles.small, { color: colors.muted }]}>
                {message.answer.period} · {message.answer.transaction_count} record(s) · {message.answer.calculation_explanation}
              </Text>
              {message.answer.supporting_transaction_ids.map((id) => (
                <TouchableOpacity
                  accessibilityRole="link"
                  key={id}
                  onPress={() => router.push(`/(tabs)/transactions/${id}`)}
                >
                  <Text style={[styles.link, { color: colors.primarySoft }]}>Open transaction · {id.slice(0, 8)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      {query.isPending ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primarySoft} /><Text style={{ color: colors.muted }}>Checking your records…</Text></View>
      ) : null}
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
        <TouchableOpacity onPress={ask} disabled={!question.trim() || query.isPending} style={[styles.sendButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.sendText}>Ask</Text>
        </TouchableOpacity>
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
        <TouchableOpacity
          onPress={() => proposal.mutate(proposalText.trim(), { onSuccess: () => setProposalText('') })}
          disabled={!proposalText.trim() || proposal.isPending}
          style={[styles.sendButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.sendText}>{proposal.isPending ? 'Submitting…' : 'Request Approval'}</Text>
        </TouchableOpacity>
        {proposal.isError ? <Text style={[styles.small, { color: colors.red }]}>{proposal.error.message}</Text> : null}
        {proposal.isSuccess ? <Text style={[styles.small, { color: colors.green }]}>Proposal submitted: {proposal.data.id}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
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
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderRadius: 14, padding: 8 },
  input: { flex: 1, minHeight: 42, maxHeight: 110, padding: 9, fontSize: 13 },
  sendButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 13 },
  sendText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  proposalCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 9 },
  proposalInput: { borderWidth: 1, borderRadius: 10 },
});
