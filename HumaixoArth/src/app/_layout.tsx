// src/app/_layout.tsx
import '../global.css';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { AuthProvider } from '@/auth/auth-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { FinanceTheme } from '@/constants/finance-theme';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useThemeStore } from '@/store/themeStore';

void SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  console.error('Could not keep the native splash screen visible.', error);
});

export default function RootLayout(): React.JSX.Element {
  const [splashVisible, setSplashVisible] = useState(true);
  const initializeTheme = useThemeStore((state) => state.initialize);
  const splashOpacity = useSharedValue(1);
  const splashStyle = useAnimatedStyle(() => ({ opacity: splashOpacity.value }));

  useEffect(() => {
    void initializeTheme().catch((error: unknown) => {
      console.error('Could not restore the saved app theme.', error);
    });

    void SplashScreen.hideAsync().catch((error: unknown) => {
      console.error('Could not dismiss the native splash screen.', error);
    });

    const timer = setTimeout(() => {
      splashOpacity.value = withTiming(0, { duration: 500 }, (finished) => {
        if (finished) runOnJS(setSplashVisible)(false);
      });
    }, 2_000);

    return () => clearTimeout(timer);
  }, [initializeTheme, splashOpacity]);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
          {splashVisible ? (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, splashStyle]}>
              <LinearGradient
                colors={['#241850', '#111329', '#090910']}
                locations={[0, 0.58, 1]}
                style={styles.splash}
              >
                <Animated.View entering={FadeInDown.duration(700).delay(120)} style={styles.brand}>
                  <View style={styles.logoMark}>
                    <Text style={styles.logoText}>H</Text>
                  </View>
                  <Text style={styles.brandName}>Humaixo Arth</Text>
                  <Text style={styles.tagline}>Your money, clearly understood.</Text>
                </Animated.View>
                <Text style={styles.footer}>PRIVATE FINANCE · MADE SIMPLE</Text>
              </LinearGradient>
            </Animated.View>
          ) : null}
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splash: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  brand: { alignItems: 'center', gap: 12 },
  logoMark: {
    width: 76,
    height: 76,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FinanceTheme.colors.primary,
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    shadowColor: FinanceTheme.colors.primary,
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 10,
  },
  logoText: { color: '#ffffff', fontSize: 44, fontWeight: '900' },
  brandName: { color: '#ffffff', fontSize: 28, fontWeight: '800', letterSpacing: 0.2 },
  tagline: { color: '#c4bbeb', fontSize: 14, marginTop: 1 },
  footer: { position: 'absolute', bottom: 42, color: '#9990bd', fontSize: 11, letterSpacing: 2 },
});
