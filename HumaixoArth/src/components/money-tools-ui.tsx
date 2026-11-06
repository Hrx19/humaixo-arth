import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useFinanceColors } from '@/constants/finance-theme';
import { ScalePressable } from '@/components/scale-pressable';
import { SkeletonBlock } from '@/components/finance-ui';

export function ToolCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}): React.JSX.Element {
  const colors = useFinanceColors();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function ToolButton({
  label,
  onPress,
  secondary = false,
  destructive = false,
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
}): React.JSX.Element {
  const colors = useFinanceColors();
  const backgroundColor = destructive
    ? `${colors.red}18`
    : secondary
      ? colors.surfaceRaised
      : colors.primary;
  const foregroundColor = destructive ? colors.red : secondary ? colors.text : '#ffffff';
  return (
    <ScalePressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[styles.button, { backgroundColor, borderColor: secondary ? colors.border : backgroundColor }, (disabled || loading) && styles.buttonDisabled]}
    >
      {loading ? <ActivityIndicator size="small" color={foregroundColor} /> : <Text style={[styles.buttonText, { color: foregroundColor }]}>{label}</Text>}
    </ScalePressable>
  );
}

export function ToolField({
  label,
  error,
  ...inputProps
}: TextInputProps & { label: string; error?: string }): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      <TextInput
        {...inputProps}
        placeholderTextColor={colors.subtle}
        style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: error ? colors.red : colors.border }, inputProps.style]}
      />
      {error ? <Text style={[styles.errorText, { color: colors.red }]}>{error}</Text> : null}
    </View>
  );
}

export function ToolBadge({
  label,
  tone = 'primary',
}: {
  label: string;
  tone?: 'primary' | 'green' | 'amber' | 'red' | 'muted';
}): React.JSX.Element {
  const colors = useFinanceColors();
  const textColor = {
    primary: colors.primarySoft,
    green: colors.green,
    amber: colors.amber,
    red: colors.red,
    muted: colors.muted,
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: `${textColor}18` }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

export function ToolSectionTitle({ children }: { children: ReactNode }): React.JSX.Element {
  const colors = useFinanceColors();
  return <Text style={[styles.sectionTitle, { color: colors.text }]}>{children}</Text>;
}

export function ToolEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <ToolCard style={styles.empty}>
      <View style={[styles.emptyMark, { backgroundColor: `${colors.primary}20` }]}>
        <Text style={[styles.emptyMarkText, { color: colors.primarySoft }]}>✦</Text>
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.muted }]}>{description}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </ToolCard>
  );
}

export function ToolLoading(): React.JSX.Element {
  return (
    <View style={styles.loadingList} accessibilityLabel="Loading">
      {[0, 1, 2].map((item) => (
        <ToolCard key={item} style={styles.skeletonCard}>
          <SkeletonBlock style={[styles.skeletonLine, styles.skeletonWide]} />
          <SkeletonBlock style={styles.skeletonLine} />
          <SkeletonBlock style={[styles.skeletonLine, styles.skeletonShort]} />
        </ToolCard>
      ))}
    </View>
  );
}

export function ToolError({
  message,
  onRetry,
  actionLabel = 'Try again',
}: {
  message: string;
  onRetry: () => void;
  actionLabel?: string;
}): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <ToolCard style={styles.errorCard}>
      <Text style={[styles.errorTitle, { color: colors.red }]}>We couldn’t load this information</Text>
      <Text style={[styles.body, { color: colors.muted }]}>{message}</Text>
      <ToolButton label={actionLabel} onPress={onRetry} secondary />
    </ToolCard>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  button: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  field: { gap: 7 },
  fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 15 },
  errorText: { fontSize: 12 },
  badge: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  empty: { alignItems: 'center', paddingVertical: 25 },
  emptyMark: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyMarkText: { fontSize: 22, fontWeight: '800' },
  emptyTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  emptyAction: { width: '100%', marginTop: 2 },
  loadingList: { gap: 12 },
  skeletonCard: { minHeight: 130 },
  skeletonLine: { height: 12, width: '65%', borderRadius: 6 },
  skeletonWide: { width: '86%', height: 15 },
  skeletonShort: { width: '42%' },
  errorCard: { alignItems: 'flex-start' },
  errorTitle: { fontSize: 14, fontWeight: '800' },
});
