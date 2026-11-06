/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#172a33',
    background: '#f3f7f7',
    backgroundElement: '#ffffff',
    backgroundSelected: '#eaf1f1',
    textSecondary: '#526a73',
    border: '#d8e3e4',
    primary: '#0b7774',
    primarySoft: '#0e726f',
    green: '#087e5d',
    red: '#b9364f',
    amber: '#875900',
    blue: '#226b9b',
    subtle: '#73858c',
  },
  dark: {
    text: '#eaf3f5',
    background: '#05090f',
    backgroundElement: '#0c1722',
    backgroundSelected: '#142434',
    textSecondary: '#a3b5bf',
    border: '#243747',
    primary: '#0b827e',
    primarySoft: '#52d3c3',
    green: '#38c89b',
    red: '#f16c72',
    amber: '#efb957',
    blue: '#58a9dd',
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
