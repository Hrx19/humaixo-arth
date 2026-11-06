import React, { type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter, useSegments, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FinanceTheme, useFinanceColors } from '@/constants/finance-theme';
import { Typography } from '@/theme/typography';
import { useThemeStore } from '@/store/themeStore';
import { ScalePressable } from '@/components/scale-pressable';
import { triggerLightImpact } from '@/utils/haptics';

export type FinanceTab = 'home' | 'transactions' | 'people' | 'history' | 'insights' | 'tools' | 'ai' | 'accounts';

type FinanceScreenProps = {
  title: string;
  subtitle?: string;
  activeTab?: FinanceTab;
  children: ReactNode;
  rightAction?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scrollable?: boolean;
};

const NAV_ITEMS: { key: FinanceTab; label: string; icon: string; route: Href }[] = [
  { key: 'home', label: 'Home', icon: '\u2302', route: '/' },
  { key: 'transactions', label: 'Activity', icon: '\u25a4', route: '/transactions' },
  { key: 'people', label: 'People', icon: '\u2659', route: '/people' },
  { key: 'history', label: 'History', icon: '\u25f7', route: '/history' },
  { key: 'insights', label: 'Insights', icon: '\u2726', route: '/insights' },
  { key: 'tools', label: 'Tools', icon: '\u2699', route: '/money-tools' },
];

const MOBILE_NAV_ITEMS: { key: FinanceTab; label: string; icon: string; route: Href }[] = [
  { key: 'home', label: 'Dashboard', icon: '\u2302', route: '/' },
  { key: 'transactions', label: 'Transactions', icon: '\u25a4', route: '/transactions' },
  { key: 'ai', label: 'Humaixo AI', icon: '\u2726', route: '/ai-assistant' },
  { key: 'accounts', label: 'Accounts', icon: '\u25a3', route: '/accounts' },
];

export function FinanceScreen({
  title,
  subtitle,
  activeTab,
  children,
  rightAction,
  contentStyle,
  scrollable = true,
}: FinanceScreenProps): React.JSX.Element {
  const router = useRouter();
  const segments = useSegments();
  const isInMainTabs = segments[0] === '(tabs)';
  const colors = useFinanceColors();
  const themeMode = useThemeStore((state) => state.mode);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;
  const horizontalPadding = width < 360 ? 14 : width < 768 ? 18 : isDesktop ? 30 : 24;

  const renderNavigation = (desktop: boolean): React.JSX.Element => {
    const items = desktop ? NAV_ITEMS : MOBILE_NAV_ITEMS;
    const renderItem = (item: (typeof items)[number]): React.JSX.Element => {
        const active = item.key === activeTab;
        return (
          <ScalePressable
            key={item.key}
            onPress={() => {
              triggerLightImpact();
              router.push(item.route);
            }}
            style={[
              desktop ? styles.sidebarNavItem : styles.navItem,
              active && (desktop ? styles.sidebarNavItemActive : styles.navItemActive),
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
          >
            <Text style={[
              desktop ? styles.sidebarNavIcon : styles.navIcon,
              { color: colors.subtle },
              active && styles.navIconActive,
              active && { color: colors.primarySoft },
            ]}>{item.icon}</Text>
            <Text style={[
              desktop ? styles.sidebarNavLabel : styles.navLabel,
              { color: colors.muted },
              active && styles.navLabelActive,
              active && { color: colors.primarySoft },
            ]}>{item.label}</Text>
            {desktop && active ? <View style={styles.sidebarIndicator} /> : null}
            {!desktop && active ? <View style={styles.navIndicator} /> : null}
          </ScalePressable>
        );
    };

    return (
      <View style={[
        desktop ? styles.sidebarNavigation : styles.bottomNav,
        !desktop && { backgroundColor: colors.surface, borderTopColor: colors.border },
      ]}>
        {desktop ? <Text style={[styles.sidebarSectionLabel, { color: colors.subtle }]}>WORKSPACE</Text> : null}
        {(desktop ? items : items.slice(0, 2)).map(renderItem)}
        {!desktop ? (
          <ScalePressable
            onPress={() => {
              triggerLightImpact();
              router.push('/add-transaction');
            }}
            style={[styles.mobileAddButton, { backgroundColor: colors.primary, borderColor: colors.surface }]}
            accessibilityRole="button"
            accessibilityLabel="Add transaction"
          >
            <Text style={styles.mobileAddLabel}>+</Text>
          </ScalePressable>
        ) : null}
        {!desktop ? items.slice(2).map(renderItem) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.root, { backgroundColor: colors.background }, isDesktop && styles.desktopRoot]}>
        {isDesktop ? (
          <View style={[styles.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
            <View style={styles.brand}>
              <View style={[styles.logoMark, { backgroundColor: colors.primary }]}><Text style={styles.logoText}>H</Text></View>
              <Text style={[styles.brandName, { color: colors.text }]}>Humaixo <Text style={[styles.brandAccent, { color: colors.primarySoft }]}>Arth</Text></Text>
            </View>
            {!isInMainTabs ? renderNavigation(true) : null}
            <View style={[styles.sidebarFooter, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sidebarFooterTitle, { color: colors.text }]}>Your money, clearly understood.</Text>
              <Text style={[styles.sidebarFooterText, { color: colors.subtle }]}>Private finance tools for everyday decisions.</Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.mainColumn, { backgroundColor: colors.background }]}>
          <View style={[styles.topBar, { paddingHorizontal: horizontalPadding }]}>
            {!isDesktop ? (
              <View style={styles.brand}>
                <View style={[styles.logoMark, { backgroundColor: colors.primary }]}><Text style={styles.logoText}>H</Text></View>
                <Text style={[styles.brandName, { color: colors.text }]}>Humaixo <Text style={[styles.brandAccent, { color: colors.primarySoft }]}>Arth</Text></Text>
              </View>
            ) : <View style={styles.desktopTopSpacer} />}
            <View style={styles.topAction}>
              {rightAction ?? (
                <ScalePressable
                  onPress={() => {
                    triggerLightImpact();
                    router.push('/profile');
                  }}
                  style={[styles.profileButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Open profile and settings"
                >
                  <Text style={[styles.profileButtonText, { color: colors.primarySoft }]}>H</Text>
                </ScalePressable>
              )}
            </View>
          </View>

          {scrollable ? (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingHorizontal: horizontalPadding },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.content, contentStyle, isDesktop && styles.desktopContent]}>
                <View style={styles.pageHeading}>
                  <Text style={[styles.pageTitle, { color: colors.text }]}>{title}</Text>
                  {subtitle ? <Text style={[styles.pageSubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
                </View>
                {children}
              </View>
            </ScrollView>
          ) : (
            <View style={[styles.scrollContent, styles.nonScrollableContent, { paddingHorizontal: horizontalPadding }]}>
              <View style={[styles.content, styles.nonScrollableContent, contentStyle, isDesktop && styles.desktopContent]}>
                <View style={styles.pageHeading}>
                  <Text style={[styles.pageTitle, { color: colors.text }]}>{title}</Text>
                  {subtitle ? <Text style={[styles.pageSubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
                </View>
                {children}
              </View>
            </View>
          )}

          {!isDesktop && !isInMainTabs ? renderNavigation(false) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: FinanceTheme.colors.background },
  root: { flex: 1, backgroundColor: FinanceTheme.colors.background },
  desktopRoot: { flexDirection: 'row' },
  mainColumn: { flex: 1, minWidth: 0, backgroundColor: FinanceTheme.colors.background },
  sidebar: {
    width: 236,
    flexShrink: 0,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 18,
    backgroundColor: '#0d0d17',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: FinanceTheme.colors.border,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  logoMark: {
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: 12,
    backgroundColor: FinanceTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: FinanceTheme.colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  logoText: { color: '#ffffff', fontSize: 17, fontWeight: '900' },
  brandName: { color: FinanceTheme.colors.text, fontSize: 18, fontWeight: '700', flexShrink: 1 },
  brandAccent: { color: FinanceTheme.colors.primarySoft },
  sidebarNavigation: { gap: 7, marginTop: 42 },
  sidebarSectionLabel: { color: FinanceTheme.colors.subtle, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6, paddingHorizontal: 11 },
  sidebarNavItem: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 13, position: 'relative' },
  sidebarNavItemActive: { backgroundColor: 'rgba(11,130,126,0.15)' },
  sidebarNavIcon: { width: 22, textAlign: 'center', color: FinanceTheme.colors.subtle, fontSize: 19, fontWeight: '700' },
  sidebarNavLabel: { color: FinanceTheme.colors.muted, fontSize: 12, fontWeight: '600' },
  sidebarIndicator: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, backgroundColor: FinanceTheme.colors.primary },
  sidebarFooter: { marginTop: 'auto', borderRadius: 15, padding: 13, backgroundColor: FinanceTheme.colors.surface, borderWidth: 1, borderColor: FinanceTheme.colors.border },
  sidebarFooterTitle: { color: FinanceTheme.colors.text, fontSize: 10, fontWeight: '800' },
  sidebarFooterText: { color: FinanceTheme.colors.subtle, fontSize: 9, lineHeight: 14, marginTop: 5 },
  topBar: {
    width: '100%',
    maxWidth: 1320,
    alignSelf: 'center',
    minHeight: 58,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  desktopTopSpacer: { flex: 1 },
  topAction: { minWidth: 38, alignItems: 'flex-end' },
  profileButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: FinanceTheme.colors.surface,
    borderColor: FinanceTheme.colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileButtonText: { color: FinanceTheme.colors.primarySoft, fontSize: 13, fontWeight: '800' },
  scrollView: { flex: 1, minWidth: 0 },
  scrollContent: { width: '100%', alignItems: 'center', paddingTop: 12, paddingBottom: 28 },
  nonScrollableContent: { flex: 1, minHeight: 0 },
  content: { width: '100%', maxWidth: 760, gap: 16 },
  desktopContent: { maxWidth: 1120, gap: 20 },
  pageHeading: { marginBottom: 2 },
  pageTitle: { color: FinanceTheme.colors.text, fontSize: Typography.size.title, lineHeight: Typography.lineHeight.title, fontWeight: '800', letterSpacing: -0.5, flexShrink: 1 },
  pageSubtitle: { color: FinanceTheme.colors.muted, fontSize: Typography.size.subtext, lineHeight: Typography.lineHeight.subtext, marginTop: 5, maxWidth: 760 },
  bottomNav: {
    width: '100%',
    minHeight: 65,
    backgroundColor: FinanceTheme.colors.surface,
    borderTopColor: FinanceTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 5,
    paddingTop: 6,
    paddingBottom: 4,
  },
  navItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 1, position: 'relative', borderRadius: 10 },
  navItemActive: { backgroundColor: 'rgba(11,130,126,0.07)' },
  navIcon: { color: FinanceTheme.colors.subtle, fontSize: 20, lineHeight: 24, fontWeight: '700' },
  navIconActive: { color: FinanceTheme.colors.primarySoft },
  navLabel: { color: FinanceTheme.colors.subtle, fontSize: Typography.size.caption, fontWeight: '600' },
  navLabelActive: { color: FinanceTheme.colors.primarySoft },
  navIndicator: { position: 'absolute', top: 0, width: 24, height: 2, borderRadius: 2, backgroundColor: FinanceTheme.colors.primary },
  mobileAddButton: {
    width: 46,
    height: 46,
    marginHorizontal: 7,
    marginTop: -16,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    elevation: 5,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  mobileAddLabel: { color: '#ffffff', fontSize: 28, lineHeight: 32, fontWeight: '400' },
});
