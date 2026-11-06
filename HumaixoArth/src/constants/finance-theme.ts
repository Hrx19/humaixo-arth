import { useThemeStore } from '@/store/themeStore';
import Decimal from 'decimal.js';

const DARK_COLORS = {
  background: '#05090f',
  surface: '#0c1722',
  surfaceRaised: '#142434',
  border: '#243747',
  text: '#eaf3f5',
  muted: '#a3b5bf',
  subtle: '#71838e',
  primary: '#0b827e',
  primarySoft: '#52d3c3',
  green: '#38c89b',
  red: '#f16c72',
  amber: '#efb957',
  blue: '#58a9dd',
} as const;

const LIGHT_COLORS = {
  background: '#f3f7f7',
  surface: '#ffffff',
  surfaceRaised: '#eaf1f1',
  border: '#d8e3e4',
  text: '#172a33',
  muted: '#526a73',
  subtle: '#73858c',
  primary: '#0b7774',
  primarySoft: '#0e726f',
  green: '#087e5d',
  red: '#b9364f',
  amber: '#875900',
  blue: '#226b9b',
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

export function formatINR(amount: string | number, includeSign = false): string {
  const decimal = new Decimal(String(amount));
  const absolute = decimal.abs().toFixed(2).replace(/\.?0+$/, '');
  const [whole = '0', fraction] = absolute.split('.');
  const grouped = whole.length <= 3
    ? whole
    : `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${whole.slice(-3)}`;
  const sign = includeSign ? (decimal.isNegative() ? '−' : '+') : decimal.isNegative() ? '−' : '';
  return `${sign}₹${grouped}${fraction ? `.${fraction}` : ''}`;
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
