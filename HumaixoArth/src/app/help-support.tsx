import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FinanceScreen } from '@/components/finance-screen';
import { PrimaryButton, SurfaceCard } from '@/components/finance-ui';
import { FinanceTheme } from '@/constants/finance-theme';

const HELP_ITEMS = [
  {
    question: 'How do I add an account?',
    answer: 'Open Linked accounts from your dashboard or profile, then add a bank, wallet, card or cash account.',
  },
  {
    question: 'Why are scanned PDFs not imported?',
    answer: 'The current parser reads selectable text from digital bank statements. Image-only scans need OCR and are not imported to avoid guessing transaction details.',
  },
  {
    question: 'How do I correct a transaction?',
    answer: 'Open Activity to review your ledger. You can remove a transaction and add the corrected details from the Add transaction screen.',
  },
  {
    question: 'Are my statements stored?',
    answer: 'PDF uploads are processed in memory and discarded after extraction. The app stores only the parsed transaction fields in your private account.',
  },
];

export default function HelpSupportScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <FinanceScreen title="Help & support" subtitle="Answers to common questions about your personal finance workspace.">
      {HELP_ITEMS.map((item) => (
        <SurfaceCard key={item.question} style={styles.helpCard}>
          <Text style={styles.question}>{item.question}</Text>
          <Text style={styles.answer}>{item.answer}</Text>
        </SurfaceCard>
      ))}
      <View style={styles.actions}>
        <PrimaryButton label="Open transaction activity" onPress={() => router.push('/transactions')} />
        <PrimaryButton label="Manage linked accounts" onPress={() => router.push('/accounts')} secondary />
      </View>
    </FinanceScreen>
  );
}

const styles = StyleSheet.create({
  helpCard: { gap: 7 },
  question: { color: FinanceTheme.colors.text, fontSize: 16, fontWeight: '700' },
  answer: { color: FinanceTheme.colors.muted, fontSize: 14, lineHeight: 21 },
  actions: { gap: 10 },
});
