import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFinanceColors } from '@/constants/finance-theme';

export default function MainTabsLayout(): React.JSX.Element {
  const colors = useFinanceColors();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primarySoft,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 66,
          paddingTop: 7,
          paddingBottom: 7,
        },
        tabBarLabelStyle: { fontSize: 9, fontWeight: '700' },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="accounts/index"
        options={{
          title: 'Accounts',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="ai-assistant"
        options={{
          title: 'AI',
          tabBarAccessibilityLabel: 'Humaixo AI',
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart-outline" color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="money-tools"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" color={String(color)} size={size} />,
        }}
      />
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
