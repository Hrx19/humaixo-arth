/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useThemeStore } from '@/store/themeStore';

export function useTheme() {
  const mode = useThemeStore((state) => state.mode);
  return Colors[mode];
}
