import React, { memo, useEffect, type ReactNode } from 'react';
import Animated, {
  cancelAnimation,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { FinanceTheme, formatDate, formatINR, formatShortDate, useFinanceColors } from '@/constants/finance-theme';
import type { FinanceTransaction } from '@/types/finance';
import { Trash2 } from 'lucide-react-native';
import { Typography } from '@/theme/typography';
import { ScalePressable } from '@/components/scale-pressable';

type SurfaceCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SurfaceCard({ children, style }: SurfaceCardProps): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <Animated.View entering={FadeInDown.duration(240)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </Animated.View>
  );
}

export function SkeletonBlock({
  style,
  label = 'Loading',
}: {
  style?: StyleProp<ViewStyle>;
  label?: string;
}): React.JSX.Element {
  const colors = useFinanceColors();
  const shimmer = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.48 + shimmer.value * 0.3,
  }));

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
    return () => cancelAnimation(shimmer);
  }, [shimmer]);

  return (
    <Animated.View
      accessibilityLabel={label}
      style={[{ backgroundColor: colors.surfaceRaised }, animatedStyle, style]}
    />
  );
}

type SectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {actionLabel && onAction ? (
        <ScalePressable onPress={onAction} accessibilityRole="button">
          <Text style={[styles.sectionAction, { color: colors.primarySoft }]}>{actionLabel}</Text>
        </ScalePressable>
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
  const colors = useFinanceColors();
  return (
    <ScalePressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        {
          backgroundColor: secondary ? colors.surfaceRaised : colors.primary,
          borderColor: secondary ? colors.border : colors.primary,
        },
        (disabled || loading) && styles.buttonDisabled,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colors.text : '#ffffff'} />
      ) : (
        <Text style={[styles.buttonText, { color: secondary ? colors.text : '#ffffff' }]}>{label}</Text>
      )}
    </ScalePressable>
  );
}

type InfoPillProps = { label: string; tone?: 'purple' | 'green' | 'red' | 'amber' };

export function InfoPill({ label, tone = 'purple' }: InfoPillProps): React.JSX.Element {
  const colors = useFinanceColors();
  const toneStyles: Record<NonNullable<InfoPillProps['tone']>, { container: ViewStyle; text: TextStyle }> = {
    purple: { container: { backgroundColor: `${colors.primary}1b` }, text: { color: colors.primarySoft } },
    green: { container: { backgroundColor: `${colors.green}1b` }, text: { color: colors.green } },
    red: { container: { backgroundColor: `${colors.red}1b` }, text: { color: colors.red } },
    amber: { container: { backgroundColor: `${colors.amber}1b` }, text: { color: colors.amber } },
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
  onDelete?: () => void;
};

function getTransactionIcon(transaction: FinanceTransaction): string {
  if (transaction.type === 'credit') return '\u2199';
  switch (transaction.category.toLowerCase()) {
    case 'food': return '\u{1F37D}';
    case 'shopping': return '\u{1F6CD}';
    case 'travel':
    case 'fuel': return '\u{1F695}';
    case 'transfer': return '\u2197';
    case 'bills': return '\u25A4';
    case 'healthcare': return '\u269A';
    default: return '\u20B9';
  }
}

function TransactionRowComponent({
  transaction,
  accountName,
  expanded = false,
  onPress,
  onDelete,
}: TransactionRowProps): React.JSX.Element {
  const isCredit = transaction.type === 'credit';
  const colors = useFinanceColors();
  const transactionSummary = (
    <>
      <View style={[
        styles.transactionIcon,
        isCredit ? styles.transactionIconCredit : styles.transactionIconDebit,
        !isCredit && { backgroundColor: colors.surfaceRaised },
      ]}>
        <Text style={[styles.transactionIconText, { color: isCredit ? colors.green : colors.primarySoft }]}>
          {getTransactionIcon(transaction)}
        </Text>
      </View>
      <View style={styles.transactionInfo}>
        <Text style={[styles.transactionName, { color: colors.text }]} numberOfLines={1}>{transaction.counterparty ?? transaction.merchant}</Text>
        <Text style={[styles.transactionMeta, { color: colors.muted }]} numberOfLines={1}>
          {transaction.category} {'\u00b7'} {transaction.paymentMethod ?? accountName ?? formatShortDate(transaction.date)}
        </Text>
        {expanded ? (
          <View style={styles.transactionDetails}>
            <Text style={[styles.detailLine, { color: colors.muted }]}>When: {formatDate(transaction.date)}</Text>
            {accountName ? <Text style={[styles.detailLine, { color: colors.muted }]}>Account: {accountName}</Text> : null}
            {transaction.paymentMethod ? <Text style={[styles.detailLine, { color: colors.muted }]}>Method: {transaction.paymentMethod}</Text> : null}
            {transaction.referenceNumber ? <Text style={[styles.detailLine, { color: colors.muted }]}>Reference: {transaction.referenceNumber}</Text> : null}
            {transaction.balanceBefore !== null ? <Text style={[styles.detailLine, { color: colors.muted }]}>Balance before: {formatINR(transaction.balanceBefore)}</Text> : null}
            {transaction.balanceAfter !== null ? <Text style={[styles.detailLine, { color: colors.muted }]}>Balance after: {formatINR(transaction.balanceAfter)}</Text> : null}
            {transaction.note ? <Text style={[styles.detailLine, { color: colors.muted }]}>Note: {transaction.note}</Text> : null}
            <Text style={[styles.detailLine, { color: colors.muted }]}>Source: {transaction.source}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.transactionAmount, { color: isCredit ? colors.green : colors.red }]}>
        {isCredit ? '+' : '\u2212'}{formatINR(transaction.amount)}
      </Text>
    </>
  );

  return (
    <View style={[styles.transactionRow, { borderBottomColor: colors.border }]}>
      {onPress ? (
        <ScalePressable
          onPress={onPress}
          style={styles.transactionMain}
          accessibilityRole="button"
          accessibilityLabel={`${transaction.merchant}, ${isCredit ? 'received' : 'spent'} ${formatINR(transaction.amount)}`}
        >
          {transactionSummary}
        </ScalePressable>
      ) : (
        <View style={styles.transactionMain}>{transactionSummary}</View>
      )}
      {onDelete ? (
        <ScalePressable
          onPress={onDelete}
          style={styles.deleteButton}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${transaction.merchant}`}
        >
          <Trash2 size={17} color={colors.red} />
        </ScalePressable>
      ) : null}
    </View>
  );
}
export const TransactionRow = memo(TransactionRowComponent);

type EmptyStateProps = { title: string; description: string; action?: ReactNode };

export function EmptyState({ title, description, action }: EmptyStateProps): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: `${colors.primary}1b` }]}>
        <Text style={[styles.emptyIconText, { color: colors.primarySoft }]}>{'\u2726'}</Text>
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyDescription, { color: colors.muted }]}>{description}</Text>
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
  sectionTitle: { color: FinanceTheme.colors.muted, fontSize: Typography.size.body, fontWeight: '700' },
  sectionAction: { color: FinanceTheme.colors.primarySoft, fontSize: Typography.size.subtext, fontWeight: '700' },
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
  buttonText: { color: '#ffffff', fontSize: Typography.size.body, fontWeight: '700' },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  pillText: { fontSize: Typography.size.caption, fontWeight: '700' },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  transactionMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  transactionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  transactionIconCredit: { backgroundColor: 'rgba(33,201,151,0.12)' },
  transactionIconDebit: { backgroundColor: 'rgba(11,130,126,0.14)' },
  transactionIconText: { color: FinanceTheme.colors.primarySoft, fontSize: 17, fontWeight: '800' },
  transactionIconTextCredit: { color: FinanceTheme.colors.green },
  transactionInfo: { flex: 1, minWidth: 0 },
  transactionName: { color: FinanceTheme.colors.text, fontSize: Typography.size.body, fontWeight: '700' },
  transactionMeta: { color: FinanceTheme.colors.subtle, fontSize: Typography.size.caption, marginTop: 4 },
  transactionAmount: { fontSize: Typography.size.subtext, fontWeight: '800', marginLeft: 2 },
  deleteButton: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  amountCredit: { color: FinanceTheme.colors.green },
  amountDebit: { color: FinanceTheme.colors.red },
  transactionDetails: { marginTop: 10, gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: FinanceTheme.colors.border },
  detailLine: { color: FinanceTheme.colors.muted, fontSize: 10, lineHeight: 15 },
  emptyState: { alignItems: 'center', padding: 24, borderWidth: 1, borderColor: FinanceTheme.colors.border, borderRadius: 18, backgroundColor: FinanceTheme.colors.surface },
  emptyIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: 'rgba(11,130,126,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  emptyIconText: { color: FinanceTheme.colors.primarySoft, fontSize: 20 },
  emptyTitle: { color: FinanceTheme.colors.text, fontSize: Typography.size.body, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: FinanceTheme.colors.muted, fontSize: Typography.size.subtext, lineHeight: 21, textAlign: 'center', marginTop: 6 },
  emptyAction: { alignSelf: 'stretch', marginTop: 14 },
});