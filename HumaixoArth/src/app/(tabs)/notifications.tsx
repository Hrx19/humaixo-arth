import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FinanceScreen } from '@/components/finance-screen';
import { useAuth } from '@/auth/auth-context';
import { useFinanceColors } from '@/constants/finance-theme';
import { Phase6Service, type UserNotification } from '@/services/phase6-service';
import { ScalePressable } from '@/components/scale-pressable';
import { ToolLoading } from '@/components/money-tools-ui';
import { triggerSuccessHaptic } from '@/utils/haptics';

function notificationIcon(type: UserNotification['type']): keyof typeof Ionicons.glyphMap {
  if (type === 'anomaly') return 'warning-outline';
  if (type === 'import_completed') return 'checkmark-circle-outline';
  return 'pie-chart-outline';
}

function notificationTitle(type: UserNotification['type']): string {
  if (type === 'anomaly') return 'Anomaly alert';
  if (type === 'import_completed') return 'Import completed';
  return 'Budget alert';
}

export default function NotificationsScreen(): React.JSX.Element {
  const router = useRouter();
  const colors = useFinanceColors();
  const { token, status } = useAuth();
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ['phase6', 'notifications', token],
    queryFn: () => Phase6Service.listNotifications(token!),
    enabled: Boolean(token && status === 'authenticated'),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => Phase6Service.markNotificationRead(token!, id),
    onSuccess: async () => {
      triggerSuccessHaptic();
      await queryClient.invalidateQueries({ queryKey: ['phase6', 'notifications', token] });
    },
  });
  const markAllRead = useMutation({
    mutationFn: () => Phase6Service.markAllNotificationsRead(token!),
    onSuccess: async () => {
      triggerSuccessHaptic();
      await queryClient.invalidateQueries({ queryKey: ['phase6', 'notifications', token] });
    },
  });

  if (status === 'loading') {
    return <FinanceScreen title="Notifications"><ToolLoading /></FinanceScreen>;
  }
  if (!token) {
    return (
      <FinanceScreen title="Notifications" subtitle="Sign in to review alerts tied to your financial records.">
        <ScalePressable onPress={() => router.push('/login')} style={[styles.emptyAction, { backgroundColor: colors.primary }]}>
          <Text style={styles.emptyActionText}>Sign in</Text>
        </ScalePressable>
      </FinanceScreen>
    );
  }

  const unreadCount = (notifications.data ?? []).filter((item) => !item.is_read).length;
  const renderItem = ({ item }: { item: UserNotification }): React.JSX.Element => (
    <Swipeable
      overshootRight={false}
      renderRightActions={() => (
        <View style={[styles.swipeAction, { backgroundColor: colors.primary }]}>
          <Ionicons name="checkmark" size={20} color="#ffffff" />
          <Text style={styles.swipeActionText}>Mark read</Text>
        </View>
      )}
      onSwipeableOpen={() => {
        if (!item.is_read) markRead.mutate(item.id);
      }}
    >
      <View style={[
        styles.notificationCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        !item.is_read && { borderLeftColor: colors.primarySoft, borderLeftWidth: 3 },
      ]}>
        <View style={[styles.iconBox, { backgroundColor: `${colors.primary}1b` }]}>
          <Ionicons name={notificationIcon(item.type)} size={21} color={item.type === 'anomaly' ? colors.amber : colors.primarySoft} />
        </View>
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]}>{notificationTitle(item.type)}</Text>
            {!item.is_read ? <View style={[styles.unreadDot, { backgroundColor: colors.primarySoft }]} /> : null}
          </View>
          <Text style={[styles.message, { color: colors.muted }]}>{item.message}</Text>
          <Text style={[styles.date, { color: colors.subtle }]}>
            {new Date(item.created_at).toLocaleString('en-IN')}
          </Text>
          {item.type === 'anomaly' && item.related_entity_id ? (
            <ScalePressable
              onPress={() => router.push(`/(tabs)/transactions/${item.related_entity_id}`)}
              accessibilityRole="link"
            >
              <Text style={[styles.link, { color: colors.primarySoft }]}>Review transaction</Text>
            </ScalePressable>
          ) : null}
        </View>
      </View>
    </Swipeable>
  );

  return (
    <FinanceScreen
      title="Notifications"
      subtitle={unreadCount ? `${unreadCount} unread alert(s). Swipe an alert to mark it as read.` : 'Your budget, anomaly, and import alerts.'}
      rightAction={unreadCount ? (
        <ScalePressable
          onPress={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
          accessibilityRole="button"
          accessibilityLabel="Mark all notifications as read"
          style={[styles.allReadButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.allReadText, { color: colors.primarySoft }]}>
            {markAllRead.isPending ? 'Saving…' : 'Read all'}
          </Text>
        </ScalePressable>
      ) : undefined}
    >
      {notifications.isLoading ? <ToolLoading /> : null}
      {notifications.isError ? (
        <View style={styles.errorBox}>
          <Text style={[styles.errorText, { color: colors.red }]}>{notifications.error.message}</Text>
          <ScalePressable onPress={() => void notifications.refetch()}>
            <Text style={[styles.link, { color: colors.primarySoft }]}>Try again</Text>
          </ScalePressable>
        </View>
      ) : null}
      {notifications.data?.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="notifications-outline" size={26} color={colors.subtle} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications yet</Text>
          <Text style={[styles.message, { color: colors.muted }]}>Alerts will appear here when budgets, anomalies, or imports need your attention.</Text>
        </View>
      ) : null}
      {notifications.data?.length ? (
        <FlatList
          data={notifications.data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      ) : null}
      {markRead.isError || markAllRead.isError ? (
        <Text style={[styles.errorText, { color: colors.red }]}>
          {(markRead.error ?? markAllRead.error)?.message}
        </Text>
      ) : null}
    </FinanceScreen>
  );
}

const styles = StyleSheet.create({
  allReadButton: { borderWidth: 1, borderRadius: 11, minHeight: 38, justifyContent: 'center', paddingHorizontal: 11 },
  allReadText: { fontSize: 12, fontWeight: '800' },
  notificationCard: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 16, padding: 13 },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { flex: 1, fontSize: 13, fontWeight: '800' },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  message: { fontSize: 12, lineHeight: 17 },
  date: { fontSize: 10 },
  link: { fontSize: 11, fontWeight: '700', paddingTop: 3 },
  swipeAction: { width: 95, marginBottom: 10, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 4 },
  swipeActionText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  emptyState: { alignItems: 'center', borderWidth: 1, borderRadius: 18, padding: 22, gap: 9 },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  errorBox: { gap: 8 },
  errorText: { fontSize: 12, lineHeight: 17 },
  emptyAction: { borderRadius: 14, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  emptyActionText: { color: '#ffffff', fontWeight: '800' },
});
