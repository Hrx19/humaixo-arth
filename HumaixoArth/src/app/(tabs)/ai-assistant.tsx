import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FinanceScreen } from '@/components/finance-screen';
import { useAuth } from '@/auth/auth-context';
import { useFinanceColors } from '@/constants/finance-theme';
import { Phase6Service, type GroundedAiAnswer } from '@/services/phase6-service';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  answer?: GroundedAiAnswer;
};

function displayAmount(amount: string): string {
  return amount;
}

export default function AiAssistantScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { token, status } = useAuth();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const query = useMutation({
    mutationFn: (value: string) => Phase6Service.ask(token!, value),
    onSuccess: (answer) => setMessages((items) => [
      ...items,
      { id: `assistant-${Date.now()}`, role: 'assistant', text: answer.direct_answer, answer },
    ]),
    onError: (error: Error) => setMessages((items) => [
      ...items,
      { id: `error-${Date.now()}`, role: 'assistant', text: error.message },
    ]),
  });

  const ask = (): void => {
    const value = question.trim();
    if (!value || !token || query.isPending) return;
    setMessages((items) => [...items, { id: `user-${Date.now()}`, role: 'user', text: value }]);
    setQuestion('');
    query.mutate(value);
  };

  if (status === 'loading') {
    return <FinanceScreen title="Humaixo AI"><ActivityIndicator color={colors.primarySoft} /></FinanceScreen>;
  }
  if (!token) {
    return (
      <FinanceScreen title="Humaixo AI" subtitle="Sign in to ask questions about your private financial records.">
        <TouchableOpacity onPress={() => router.push('/login')} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.primaryButtonText}>Sign in</Text>
        </TouchableOpacity>
      </FinanceScreen>
    );
  }

  return (
    <FinanceScreen
      title="Humaixo AI"
      subtitle="Answers use only your recorded transactions and accounts. Every result shows its calculation and evidence."
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {messages.length === 0 ? (
          <View style={[styles.introCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.introTitle, { color: colors.text }]}>Ask about your records</Text>
            <Text style={[styles.introText, { color: colors.muted }]}>
              Try “How much did I spend on food last month?” or “What is my balance in Savings?”
            </Text>
            <Text style={[styles.privacyNote, { color: colors.subtle }]}>
              No statement files, account numbers, or transaction descriptions are sent to an external AI provider.
            </Text>
          </View>
        ) : null}
        <ScrollView
          style={styles.chat}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.message,
                message.role === 'user'
                  ? [styles.userMessage, { backgroundColor: colors.primary }]
                  : [styles.assistantMessage, { backgroundColor: colors.surface, borderColor: colors.border }],
              ]}
            >
              <Text style={[
                styles.messageText,
                { color: message.role === 'user' ? '#ffffff' : colors.text },
              ]}>
                {message.text}
              </Text>
              {message.answer ? (
                <View style={[styles.answerDetails, { borderTopColor: colors.border }]}>
                  <Text style={[styles.answerAmount, { color: colors.primarySoft }]}>
                    {displayAmount(message.answer.amount)}
                  </Text>
                  <Text style={[styles.answerMeta, { color: colors.muted }]}>
                    Period: {message.answer.period} · {message.answer.transaction_count} transaction(s)
                  </Text>
                  <Text style={[styles.explanation, { color: colors.muted }]}>
                    {message.answer.calculation_explanation}
                  </Text>
                  {message.answer.supporting_transaction_ids.map((id) => (
                    <TouchableOpacity
                      key={id}
                      onPress={() => router.push(`/(tabs)/transactions/${id}`)}
                      accessibilityRole="link"
                      style={styles.evidenceLink}
                    >
                      <Text style={[styles.evidenceText, { color: colors.primarySoft }]}>
                        Review transaction · {id.slice(0, 8)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          {query.isPending ? (
            <View style={[styles.pending, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.primarySoft} />
              <Text style={[styles.pendingText, { color: colors.muted }]}>Checking your records…</Text>
            </View>
          ) : null}
        </ScrollView>
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
            onSubmitEditing={ask}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={ask}
            disabled={!question.trim() || query.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send question"
            style={[styles.sendButton, { backgroundColor: colors.primary, opacity: !question.trim() || query.isPending ? 0.55 : 1 }]}
          >
            <Text style={styles.sendButtonText}>{query.isPending ? '…' : 'Ask'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </FinanceScreen>
  );
}

const styles = StyleSheet.create({
  introCard: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 8, marginBottom: 16 },
  introTitle: { fontSize: 16, fontWeight: '800' },
  introText: { fontSize: 13, lineHeight: 19 },
  privacyNote: { fontSize: 11, lineHeight: 16, marginTop: 5 },
  chat: { maxHeight: 420 },
  messageList: { gap: 12, paddingVertical: 8 },
  message: { maxWidth: '92%', borderRadius: 18, padding: 14, gap: 9 },
  userMessage: { alignSelf: 'flex-end' },
  assistantMessage: { alignSelf: 'flex-start', borderWidth: 1 },
  messageText: { fontSize: 14, lineHeight: 20 },
  answerDetails: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, gap: 6 },
  answerAmount: { fontSize: 19, fontWeight: '800' },
  answerMeta: { fontSize: 11, lineHeight: 16 },
  explanation: { fontSize: 12, lineHeight: 17 },
  evidenceLink: { paddingTop: 3, minHeight: 28, justifyContent: 'center' },
  evidenceText: { fontSize: 12, fontWeight: '700' },
  pending: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 14, padding: 12 },
  pendingText: { fontSize: 12 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, borderWidth: 1, borderRadius: 16, padding: 8, marginTop: 8 },
  input: { flex: 1, minHeight: 42, maxHeight: 120, paddingHorizontal: 8, paddingVertical: 9, fontSize: 14 },
  sendButton: { minWidth: 56, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  sendButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  primaryButton: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
});
