import React from 'react';
import { Tabs } from 'expo-router';
import { ArrowLeftRight, Briefcase, CreditCard, Home, MoreHorizontal, RefreshCw, Wallet } from 'lucide-react-native';
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
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Accounts',
          tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="loans"
        options={{
          title: 'Loans',
          tabBarIcon: ({ color, size }) => <Briefcase color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="recurring"
        options={{
          title: 'Recurring',
          tabBarIcon: ({ color, size }) => <RefreshCw color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="transfers"
        options={{
          title: 'Transfers',
          tabBarIcon: ({ color, size }) => <ArrowLeftRight color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="money-tools"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="people" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="insights" options={{ href: null }} />
      <Tabs.Screen name="accounts/add" options={{ href: null }} />
      <Tabs.Screen name="transactions/[id]" options={{ href: null }} />
      <Tabs.Screen name="statements/upload" options={{ href: null }} />
      <Tabs.Screen name="statements/review/[statementId]" options={{ href: null }} />
    </Tabs>
  );
}
