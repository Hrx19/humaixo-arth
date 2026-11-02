import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { ThemeMode } from '@/constants/theme';

const THEME_STORAGE_KEY = 'humaixo.preferences.theme.v1';

type ThemeState = {
  mode: ThemeMode;
  hydrated: boolean;
  initialize(): Promise<void>;
  setMode(mode: ThemeMode): Promise<void>;
};

let initialization: Promise<void> | null = null;

function updateNativeAppearance(mode: ThemeMode): void {
  if (Platform.OS !== 'web') {
    Appearance.setColorScheme(mode);
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'dark',
  hydrated: false,

  async initialize(): Promise<void> {
    if (get().hydrated) return;
    if (initialization) return initialization;

    initialization = (async () => {
      try {
        const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        const mode: ThemeMode = savedMode === 'light' ? 'light' : 'dark';
        updateNativeAppearance(mode);
        set({ mode });
      } finally {
        set({ hydrated: true });
        initialization = null;
      }
    })();

    return initialization;
  },

  async setMode(mode: ThemeMode): Promise<void> {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    updateNativeAppearance(mode);
    set({ mode, hydrated: true });
  },
}));
