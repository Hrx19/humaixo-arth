import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeftRight, Banknote, RefreshCw, Wallet } from 'lucide-react-native';
import { FinanceScreen } from '@/components/finance-screen';
import { ToolCard, ToolSectionTitle } from '@/components/money-tools-ui';
import { useFinanceColors } from '@/constants/finance-theme';

const FEATURES = [
  { route: '/budgets' as const, title: 'Budgets', description: 'Set category limits and keep spending on track.', Icon: Wallet },
  { route: '/transfers' as const, title: 'Transfers', description: 'Review account-to-account movements.', Icon: ArrowLeftRight },
  { route: '/recurring' as const, title: 'Recurring', description: 'Confirm regular income and payments.', Icon: RefreshCw },
  { route: '/loans' as const, title: 'Loans', description: 'Track outstanding balances and repayments.', Icon: Banknote },
];

export default function MoneyToolsScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  return (
    <FinanceScreen title="Money tools" subtitle="Thoughtful tools for the decisions behind your everyday finances." activeTab="tools">
      <ToolSectionTitle>Plan & organise</ToolSectionTitle>
      {FEATURES.map((feature) => (
        <TouchableOpacity key={feature.route} onPress={() => router.push(feature.route)} accessibilityRole="link">
          <ToolCard style={styles.featureCard}>
            <View style={[styles.iconBox, { backgroundColor: `${colors.primary}1b` }]}>
              <feature.Icon size={21} color={colors.primarySoft} strokeWidth={2.2} />
            </View>
            <View style={styles.featureCopy}>
              <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
              <Text style={[styles.featureDescription, { color: colors.muted }]}>{feature.description}</Text>
            </View>
            <Text style={[styles.chevron, { color: colors.subtle }]}>›</Text>
          </ToolCard>
        </TouchableOpacity>
      ))}
      <ToolSectionTitle>More to explore</ToolSectionTitle>
      {([
        { route: '/people', title: 'People', description: 'Review activity connected to people.' },
        { route: '/insights', title: 'Insights', description: 'Explore spending patterns and trends.' },
        { route: '/history', title: 'Balance history', description: 'See account balances over time.' },
        { route: '/ai-assistant', title: 'Humaixo AI', description: 'Ask grounded questions about your financial records.' },
        { route: '/notifications', title: 'Notifications', description: 'Review budget, anomaly, and import alerts.' },
      ] as const).map((item) => (
        <TouchableOpacity key={item.route} onPress={() => router.push(item.route)} accessibilityRole="link">
          <ToolCard style={styles.secondaryCard}>
            <View style={styles.featureCopy}>
              <Text style={[styles.featureTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.featureDescription, { color: colors.muted }]}>{item.description}</Text>
            </View>
            <Text style={[styles.chevron, { color: colors.subtle }]}>›</Text>
          </ToolCard>
        </TouchableOpacity>
      ))}
    </FinanceScreen>
  );
}

const styles = StyleSheet.create({
  featureCard: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  secondaryCard: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  iconBox: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  featureCopy: { flex: 1, minWidth: 0, gap: 4 },
  featureTitle: { fontSize: 14, fontWeight: '800' },
  featureDescription: { fontSize: 11, lineHeight: 16 },
  chevron: { fontSize: 24, fontWeight: '700' },
});
