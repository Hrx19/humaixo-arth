import { useThemeStore } from '@/store/themeStore';

const DARK_COLORS = {
  background: '#090910',
  surface: '#151520',
  surfaceRaised: '#1d1d2a',
  border: '#2b2b3a',
  text: '#f8fafc',
  muted: '#a1a1b3',
  subtle: '#686879',
  primary: '#805cff',
  primarySoft: '#b5a4ff',
  green: '#21c997',
  red: '#ff6375',
  amber: '#f5b84b',
  blue: '#58a6ff',
} as const;

const LIGHT_COLORS = {
  background: '#f5f4fa',
  surface: '#ffffff',
  surfaceRaised: '#eeeaf8',
  border: '#e2dfeb',
  text: '#171525',
  muted: '#625f70',
  subtle: '#777386',
  primary: '#6844df',
  primarySoft: '#5536c5',
  green: '#087e5d',
  red: '#c5344d',
  amber: '#986000',
  blue: '#2267ad',
} as const;

export type FinanceColorPalette = typeof DARK_COLORS | typeof LIGHT_COLORS;

export function useFinanceColors(): FinanceColorPalette {
  const mode = useThemeStore((state) => state.mode);
  return mode === 'light' ? LIGHT_COLORS : DARK_COLORS;
}

export const FinanceTheme = {
  colors: DARK_COLORS,
  radius: {
    card: 18,
    panel: 22,
    pill: 999,
  },
  spacing: {
    page: 20,
  },
} as const;

export function formatINR(amount: number, includeSign = false): string {
  const formatted = Math.abs(amount).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  const sign = includeSign ? (amount < 0 ? '−' : '+') : '';
  return `${sign}₹${formatted}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
