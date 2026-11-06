import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FinanceScreen } from '@/components/finance-screen';
import {
  ToolBadge,
  ToolButton,
  ToolCard,
  ToolEmptyState,
  ToolError,
  ToolLoading,
  ToolSectionTitle,
} from '@/components/money-tools-ui';
import { formatINR, formatShortDate, useFinanceColors } from '@/constants/finance-theme';
import { useAuth } from '@/auth/auth-context';
import { MoneyToolsService, type TransferSuggestion } from '@/services/money-tools-service';

export default function TransfersScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { token, status } = useAuth();
  const queryClient = useQueryClient();
  const suggestionsQuery = useQuery({
    queryKey: ['money-tools', 'suggested-transfers', token],
    queryFn: () => MoneyToolsService.getSuggestedTransfers(token!),
    enabled: Boolean(token && status === 'authenticated'),
  });
  const confirmMutation = useMutation({
    mutationFn: (pair: TransferSuggestion) => {
      if (!token) throw new Error('Sign in to confirm this transfer.');
      return MoneyToolsService.confirmTransfer(token, {
        debitTransactionId: pair.debit.id,
        creditTransactionId: pair.credit.id,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['money-tools', 'suggested-transfers', token] }),
        queryClient.invalidateQueries({ queryKey: ['transaction-intelligence'] }),
      ]);
    },
  });

  if (status === 'loading') {
    return <FinanceScreen title="Transfers" activeTab="tools"><ToolLoading /></FinanceScreen>;
  }
  if (!token) {
    return (
      <FinanceScreen title="Internal transfers" subtitle="Review matching debits and credits before classifying them." activeTab="tools">
        <ToolEmptyState title="Sign in to review transfers" description="Your transfer suggestions are based on your private transaction history." action={<ToolButton label="Sign in" onPress={() => router.push('/login')} />} />
      </FinanceScreen>
    );
  }

  const suggestions = suggestionsQuery.data ?? [];
  return (
    <FinanceScreen title="Internal transfers" subtitle="Confirm matching account movements so they don’t distort your spending." activeTab="tools">
      {suggestionsQuery.isLoading ? <ToolLoading /> : null}
      {suggestionsQuery.isError ? <ToolError message={suggestionsQuery.error.message} onRetry={() => void suggestionsQuery.refetch()} /> : null}
      {confirmMutation.isError ? (
        <ToolError
          message={confirmMutation.error.message}
          onRetry={() => {
            if (confirmMutation.variables) confirmMutation.mutate(confirmMutation.variables);
          }}
        />
      ) : null}
      {!suggestionsQuery.isLoading && !suggestionsQuery.isError && suggestions.length === 0 ? (
        <ToolEmptyState
          title="No transfer matches to review"
          description="When a matching debit and credit appear across your accounts, you’ll be able to confirm them here."
          action={<ToolButton label="View activity" onPress={() => router.push('/transactions')} secondary />}
        />
      ) : null}
      {suggestions.length > 0 ? (
        <>
          <ToolSectionTitle>{suggestions.length} suggested {suggestions.length === 1 ? 'match' : 'matches'}</ToolSectionTitle>
          {suggestions.map((pair) => {
            const confirming = confirmMutation.isPending
              && confirmMutation.variables?.debit.id === pair.debit.id;
            return (
              <ToolCard key={`${pair.debit.id}-${pair.credit.id}`} style={styles.pairCard}>
                <View style={styles.pairHeading}>
                  <View style={styles.pairCopy}>
                    <Text style={[styles.pairTitle, { color: colors.text }]}>Possible account transfer</Text>
                    <Text style={[styles.pairMeta, { color: colors.muted }]}>
                      {pair.confidence >= 0.85 ? 'High' : pair.confidence >= 0.65 ? 'Medium' : 'Low'} match confidence · {pair.hoursApart}h apart
                    </Text>
                  </View>
                  <ToolBadge label={`${Math.round(pair.confidence * 100)}% match`} tone={pair.confidence >= 0.85 ? 'green' : 'amber'} />
                </View>
                <TransactionLeg
                  label="DEBIT FROM"
                  name={pair.debit.accountName ?? 'Source account'}
                  description={pair.debit.description}
                  amount={pair.debit.amount}
                  date={pair.debit.date}
                  color={colors.red}
                />
                <View style={[styles.divider, { borderColor: colors.border }]} />
                <TransactionLeg
                  label="CREDIT TO"
                  name={pair.credit.accountName ?? 'Destination account'}
                  description={pair.credit.description}
                  amount={pair.credit.amount}
                  date={pair.credit.date}
                  color={colors.green}
                />
                {pair.debit.amount !== pair.credit.amount ? (
                  <Text style={[styles.warning, { color: colors.amber }]}>Amounts differ. The server will verify this pair before confirming.</Text>
                ) : null}
                <ToolButton
                  label="Confirm as transfer"
                  onPress={() => confirmMutation.mutate(pair)}
                  loading={confirming}
                  disabled={confirmMutation.isPending && !confirming}
                />
              </ToolCard>
            );
          })}
        </>
      ) : null}
    </FinanceScreen>
  );
}

function TransactionLeg({
  label,
  name,
  description,
  amount,
  date,
  color,
}: {
  label: string;
  name: string;
  description: string;
  amount: string;
  date: string;
  color: string;
}): React.JSX.Element {
  const colors = useFinanceColors();
  return (
    <View style={styles.leg}>
      <View style={styles.legCopy}>
        <Text style={[styles.legLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.legName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
        <Text style={[styles.legDescription, { color: colors.muted }]} numberOfLines={2}>{description} · {formatShortDate(date)}</Text>
      </View>
      <Text style={[styles.legAmount, { color }]}>{formatINR(amount)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pairCard: { gap: 14 },
  pairHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  pairCopy: { flex: 1, gap: 4 },
  pairTitle: { fontSize: 15, fontWeight: '800' },
  pairMeta: { fontSize: 11 },
  leg: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  legCopy: { flex: 1, minWidth: 0, gap: 3 },
  legLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  legName: { fontSize: 13, fontWeight: '800' },
  legDescription: { fontSize: 11, lineHeight: 16 },
  legAmount: { fontSize: 14, fontWeight: '800' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  warning: { fontSize: 12, lineHeight: 17 },
});
