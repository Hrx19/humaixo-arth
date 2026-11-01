import React, { memo, type ReactNode } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { FinanceTheme, formatDate, formatINR, formatShortDate } from '@/constants/finance-theme';
import type { FinanceTransaction } from '@/types/finance';

type SurfaceCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SurfaceCard({ children, style }: SurfaceCardProps): React.JSX.Element {
  return (
    <Animated.View entering={FadeInDown.duration(240)} style={[styles.card, style]}>
      {children}
    </Animated.View>
  );
}

type SectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps): React.JSX.Element {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button">
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  secondary?: boolean;
};

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  secondary = false,
}: PrimaryButtonProps): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.button, secondary && styles.secondaryButton, (disabled || loading) && styles.buttonDisabled]}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </TouchableOpacity>
  );
}

type InfoPillProps = { label: string; tone?: 'purple' | 'green' | 'red' | 'amber' };

export function InfoPill({ label, tone = 'purple' }: InfoPillProps): React.JSX.Element {
  const toneStyles: Record<NonNullable<InfoPillProps['tone']>, { container: ViewStyle; text: TextStyle }> = {
    purple: { container: styles.pill_purple, text: styles.pillText_purple },
    green: { container: styles.pill_green, text: styles.pillText_green },
    red: { container: styles.pill_red, text: styles.pillText_red },
    amber: { container: styles.pill_amber, text: styles.pillText_amber },
  };

  return (
    <View style={[styles.pill, toneStyles[tone].container]}>
      <Text style={[styles.pillText, toneStyles[tone].text]}>{label}</Text>
    </View>
  );
}

type TransactionRowProps = {
  transaction: FinanceTransaction;
  accountName?: string;
  expanded?: boolean;
  onPress?: () => void;
};

function getTransactionIcon(transaction: FinanceTransaction): string {
  if (transaction.type === 'credit') return '↙';
  switch (transaction.category.toLowerCase()) {
    case 'food': return '🍽';
    case 'shopping': return '🛍';
    case 'travel':
    case 'fuel': return '🚕';
    case 'transfer': return '↗';
    case 'bills': return '▤';
    case 'healthcare': return '✚';
    default: return '₹';
  }
}

function TransactionRowComponent({
  transaction,
  accountName,
  expanded = false,
  onPress,
}: TransactionRowProps): React.JSX.Element {
  const isCredit = transaction.type === 'credit';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.78 : 1}
      style={styles.transactionRow}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${transaction.merchant}, ${isCredit ? 'received' : 'spent'} ${formatINR(transaction.amount)}`}
    >
      <View style={[styles.transactionIcon, isCredit ? styles.transactionIconCredit : styles.transactionIconDebit]}>
        <Text style={[styles.transactionIconText, isCredit && styles.transactionIconTextCredit]}>
          {getTransactionIcon(transaction)}
        </Text>
      </View>
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionName} numberOfLines={1}>{transaction.counterparty ?? transaction.merchant}</Text>
        <Text style={styles.transactionMeta} numberOfLines={1}>
          {transaction.category} · {transaction.paymentMethod ?? accountName ?? formatShortDate(transaction.date)}
        </Text>
        {expanded ? (
          <View style={styles.transactionDetails}>
            <Text style={styles.detailLine}>When: {formatDate(transaction.date)}</Text>
            {accountName ? <Text style={styles.detailLine}>Account: {accountName}</Text> : null}
            {transaction.paymentMethod ? <Text style={styles.detailLine}>Method: {transaction.paymentMethod}</Text> : null}
            {transaction.referenceNumber ? <Text style={styles.detailLine}>Reference: {transaction.referenceNumber}</Text> : null}
            {transaction.balanceBefore !== null ? <Text style={styles.detailLine}>Balance before: {formatINR(transaction.balanceBefore)}</Text> : null}
            {transaction.balanceAfter !== null ? <Text style={styles.detailLine}>Balance after: {formatINR(transaction.balanceAfter)}</Text> : null}
            {transaction.note ? <Text style={styles.detailLine}>Note: {transaction.note}</Text> : null}
            <Text style={styles.detailLine}>Source: {transaction.source}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.transactionAmount, isCredit ? styles.amountCredit : styles.amountDebit]}>
        {isCredit ? '+' : '−'}{formatINR(transaction.amount)}
      </Text>
    </TouchableOpacity>
  );
}

export const TransactionRow = memo(TransactionRowComponent);

type EmptyStateProps = { title: string; description: string; action?: ReactNode };

export function EmptyState({ title, description, action }: EmptyStateProps): React.JSX.Element {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>✦</Text></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: FinanceTheme.colors.surface,
    borderColor: FinanceTheme.colors.border,
    borderWidth: 1,
    borderRadius: FinanceTheme.radius.card,
    padding: 16,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { color: FinanceTheme.colors.muted, fontSize: 13, fontWeight: '700' },
  sectionAction: { color: FinanceTheme.colors.primarySoft, fontSize: 11, fontWeight: '700' },
  button: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: FinanceTheme.colors.primary,
  },
  secondaryButton: { backgroundColor: FinanceTheme.colors.surfaceRaised, borderWidth: 1, borderColor: FinanceTheme.colors.border },
  buttonDisabled: { opacity: 0.58 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  pill_purple: { backgroundColor: 'rgba(128,92,255,0.16)' },
  pill_green: { backgroundColor: 'rgba(33,201,151,0.13)' },
  pill_red: { backgroundColor: 'rgba(255,99,117,0.13)' },
  pill_amber: { backgroundColor: 'rgba(245,184,75,0.13)' },
  pillText: { fontSize: 10, fontWeight: '700' },
  pillText_purple: { color: FinanceTheme.colors.primarySoft },
  pillText_green: { color: FinanceTheme.colors.green },
  pillText_red: { color: FinanceTheme.colors.red },
  pillText_amber: { color: FinanceTheme.colors.amber },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  transactionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  transactionIconCredit: { backgroundColor: 'rgba(33,201,151,0.12)' },
  transactionIconDebit: { backgroundColor: 'rgba(128,92,255,0.14)' },
  transactionIconText: { color: FinanceTheme.colors.primarySoft, fontSize: 17, fontWeight: '800' },
  transactionIconTextCredit: { color: FinanceTheme.colors.green },
  transactionInfo: { flex: 1, minWidth: 0 },
  transactionName: { color: FinanceTheme.colors.text, fontSize: 13, fontWeight: '700' },
  transactionMeta: { color: FinanceTheme.colors.subtle, fontSize: 10, marginTop: 4 },
  transactionAmount: { fontSize: 13, fontWeight: '800', marginLeft: 2 },
  amountCredit: { color: FinanceTheme.colors.green },
  amountDebit: { color: FinanceTheme.colors.red },
  transactionDetails: { marginTop: 10, gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: FinanceTheme.colors.border },
  detailLine: { color: FinanceTheme.colors.muted, fontSize: 10, lineHeight: 15 },
  emptyState: { alignItems: 'center', padding: 24, borderWidth: 1, borderColor: FinanceTheme.colors.border, borderRadius: 18, backgroundColor: FinanceTheme.colors.surface },
  emptyIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: 'rgba(128,92,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  emptyIconText: { color: FinanceTheme.colors.primarySoft, fontSize: 20 },
  emptyTitle: { color: FinanceTheme.colors.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: FinanceTheme.colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6 },
  emptyAction: { alignSelf: 'stretch', marginTop: 14 },
});
