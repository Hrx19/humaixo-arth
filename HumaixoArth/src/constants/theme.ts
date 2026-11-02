/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#171525',
    background: '#f5f4fa',
    backgroundElement: '#ffffff',
    backgroundSelected: '#eeeaf8',
    textSecondary: '#625f70',
    border: '#e2dfeb',
    primary: '#6844df',
    primarySoft: '#5536c5',
    green: '#087e5d',
    red: '#c5344d',
    amber: '#986000',
    blue: '#2267ad',
    subtle: '#777386',
  },
  dark: {
    text: '#f8fafc',
    background: '#090910',
    backgroundElement: '#151520',
    backgroundSelected: '#1d1d2a',
    textSecondary: '#a1a1b3',
    border: '#2b2b3a',
    primary: '#805cff',
    primarySoft: '#b5a4ff',
    green: '#21c997',
    red: '#ff6375',
    amber: '#f5b84b',
    blue: '#58a6ff',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type ThemeMode = keyof typeof Colors;
export type ThemePalette = (typeof Colors)[ThemeMode];

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
