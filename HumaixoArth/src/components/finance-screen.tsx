import React, { type ReactNode } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FinanceTheme } from '@/constants/finance-theme';

export type FinanceTab = 'home' | 'transactions' | 'people' | 'history' | 'insights';

type FinanceScreenProps = {
  title: string;
  subtitle?: string;
  activeTab?: FinanceTab;
  children: ReactNode;
  rightAction?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

const NAV_ITEMS: { key: FinanceTab; label: string; icon: string; route: Href }[] = [
  { key: 'home', label: 'Home', icon: '⌂', route: '/' },
  { key: 'transactions', label: 'Activity', icon: '▤', route: '/transactions' },
  { key: 'people', label: 'People', icon: '♧', route: '/people' },
  { key: 'history', label: 'History', icon: '◷', route: '/history' },
  { key: 'insights', label: 'Insights', icon: '✦', route: '/insights' },
];

export function FinanceScreen({
  title,
  subtitle,
  activeTab,
  children,
  rightAction,
  contentStyle,
}: FinanceScreenProps): React.JSX.Element {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-[#090910]" style={styles.safeArea}>
      <StatusBar style="light" />
      <View className="flex-1 bg-[#090910]" style={styles.root}>
        <View className="flex-row items-center justify-between" style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.logoMark}><Text style={styles.logoText}>H</Text></View>
            <Text style={styles.brandName}>Humaixo <Text style={styles.brandAccent}>Arth</Text></Text>
          </View>
          <View style={styles.topAction}>
            {rightAction ?? (
              <TouchableOpacity
                onPress={() => router.push('/profile')}
                style={styles.profileButton}
                accessibilityRole="button"
                accessibilityLabel="Open profile and settings"
              >
                <Text style={styles.profileButtonText}>◉</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageHeading}>
            <Text style={styles.pageTitle}>{title}</Text>
            {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
          </View>
          {children}
        </ScrollView>

        <View style={styles.bottomNav}>
          {NAV_ITEMS.map((item) => {
            const active = item.key === activeTab;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => router.push(item.route)}
                style={styles.navItem}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={item.label}
              >
                <Text style={[styles.navIcon, active && styles.navIconActive]}>{item.icon}</Text>
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
                {active ? <View style={styles.navIndicator} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: FinanceTheme.colors.background },
  root: { flex: 1, backgroundColor: FinanceTheme.colors.background },
  topBar: {
    minHeight: 54,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: FinanceTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: FinanceTheme.colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  logoText: { color: '#ffffff', fontSize: 17, fontWeight: '900' },
  brandName: { color: FinanceTheme.colors.text, fontSize: 16, fontWeight: '700' },
  brandAccent: { color: FinanceTheme.colors.primarySoft },
  topAction: { minWidth: 38, alignItems: 'flex-end' },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: FinanceTheme.colors.surface,
    borderColor: FinanceTheme.colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileButtonText: { color: FinanceTheme.colors.primarySoft, fontSize: 17, fontWeight: '800' },
  scrollView: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 16 },
  pageHeading: { marginBottom: 2 },
  pageTitle: { color: FinanceTheme.colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
  pageSubtitle: { color: FinanceTheme.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  bottomNav: {
    minHeight: 66,
    backgroundColor: '#101019',
    borderTopColor: FinanceTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingTop: 7,
    paddingBottom: 5,
  },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, position: 'relative' },
  navIcon: { color: FinanceTheme.colors.subtle, fontSize: 21, lineHeight: 24, fontWeight: '700' },
  navIconActive: { color: FinanceTheme.colors.primarySoft },
  navLabel: { color: FinanceTheme.colors.subtle, fontSize: 9, fontWeight: '600' },
  navLabelActive: { color: FinanceTheme.colors.primarySoft },
  navIndicator: {
    position: 'absolute',
    top: -7,
    width: 26,
    height: 2,
    borderRadius: 2,
    backgroundColor: FinanceTheme.colors.primary,
  },
});
