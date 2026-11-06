import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinanceColors } from '@/constants/finance-theme';
import { ScalePressable } from '@/components/scale-pressable';
import { triggerLightImpact } from '@/utils/haptics';

type AppTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const MAIN_TABS = [
  { name: 'index', route: '/', title: 'Dashboard', icon: 'home-outline' },
  { name: 'transactions', route: '/transactions', title: 'Transactions', icon: 'receipt-outline' },
  { name: 'ai-assistant', route: '/ai-assistant', title: 'Humaixo AI', icon: 'sparkles-outline' },
  { name: 'accounts/index', route: '/accounts', title: 'Accounts', icon: 'wallet-outline' },
] as const;

function MainTabBar({ state }: AppTabBarProps): React.JSX.Element {
  const colors = useFinanceColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const renderTab = (tabName: (typeof MAIN_TABS)[number]['name']): React.JSX.Element | null => {
    const tab = MAIN_TABS.find((item) => item.name === tabName);
    const routeIndex = state.routes.findIndex((route) => route.name === tabName);
    const route = state.routes[routeIndex];
    if (!tab || !route) return null;

    const focused = state.index === routeIndex;
    const color = focused ? colors.primarySoft : colors.subtle;

    return (
      <ScalePressable
        key={tab.name}
        accessibilityRole="button"
        accessibilityLabel={tab.title}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          if (!focused) {
            triggerLightImpact();
            router.navigate(tab.route);
          }
        }}
        style={styles.tabButton}
      >
        <Ionicons name={tab.icon} color={color} size={21} />
        <Text numberOfLines={1} style={[styles.tabLabel, { color }]}>{tab.title}</Text>
      </ScalePressable>
    );
  };

  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 6),
          height: 62 + insets.bottom,
        },
      ]}
    >
      {renderTab('index')}
      {renderTab('transactions')}
      <ScalePressable
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        onPress={() => {
          triggerLightImpact();
          router.push('/add-transaction');
        }}
        style={[styles.addButton, { backgroundColor: colors.primary, borderColor: colors.surface }]}
      >
        <Ionicons name="add" color="#ffffff" size={27} />
      </ScalePressable>
      {renderTab('ai-assistant')}
      {renderTab('accounts/index')}
    </View>
  );
}

export default function MainTabsLayout(): React.JSX.Element {
  const colors = useFinanceColors();

  return (
    <Tabs
      tabBar={(props) => <MainTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primarySoft,
        tabBarInactiveTintColor: colors.subtle,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="ai-assistant" options={{ title: 'Humaixo AI' }} />
      <Tabs.Screen name="accounts/index" options={{ title: 'Accounts' }} />
      <Tabs.Screen name="budgets" options={{ href: null }} />
      <Tabs.Screen name="money-tools" options={{ href: null }} />
      <Tabs.Screen name="loans" options={{ href: null }} />
      <Tabs.Screen name="recurring" options={{ href: null }} />
      <Tabs.Screen name="transfers" options={{ href: null }} />
      <Tabs.Screen name="people" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="insights" options={{ href: null }} />
      <Tabs.Screen name="accounts/add" options={{ href: null }} />
      <Tabs.Screen name="transactions/[id]" options={{ href: null }} />
      <Tabs.Screen name="statements/upload" options={{ href: null }} />
      <Tabs.Screen name="statements/review/[statementId]" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 5,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '700',
  },
  addButton: {
    width: 48,
    height: 48,
    marginHorizontal: 8,
    marginTop: -18,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    elevation: 5,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});
