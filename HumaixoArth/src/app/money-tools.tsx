import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FinanceScreen } from '@/components/finance-screen';
import { ToolCard, ToolSectionTitle } from '@/components/money-tools-ui';
import { useFinanceColors } from '@/constants/finance-theme';

const FEATURES = [
  { route: '/budgets' as const, title: 'Budgets', description: 'Set category limits and keep spending on track.', icon: '◔' },
  { route: '/transfers' as const, title: 'Internal transfers', description: 'Review account-to-account movements.', icon: '⇄' },
  { route: '/recurring' as const, title: 'Recurring transactions', description: 'Confirm regular income and payments.', icon: '↻' },
  { route: '/loans' as const, title: 'Loans & lending', description: 'Track outstanding balances and repayments.', icon: '₹' },
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
              <Text style={[styles.icon, { color: colors.primarySoft }]}>{feature.icon}</Text>
            </View>
            <View style={styles.featureCopy}>
              <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
              <Text style={[styles.featureDescription, { color: colors.muted }]}>{feature.description}</Text>
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
  iconBox: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22, fontWeight: '800' },
  featureCopy: { flex: 1, minWidth: 0, gap: 4 },
  featureTitle: { fontSize: 14, fontWeight: '800' },
  featureDescription: { fontSize: 11, lineHeight: 16 },
  chevron: { fontSize: 24, fontWeight: '700' },
});
