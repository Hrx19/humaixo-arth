import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

type BrowserStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export class AuthStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthStorageError';
  }
}

function getBrowserStorage(): BrowserStorage {
  try {
    const browserWindow = (
      globalThis as typeof globalThis & {
        window?: { localStorage?: BrowserStorage };
      }
    ).window;
    const storage = browserWindow?.localStorage;

    if (!storage) {
      throw new Error('Browser storage is unavailable.');
    }

    return storage;
  } catch {
    throw new AuthStorageError(
      'Secure session storage is unavailable in this browser. Enable browser storage and try again.',
    );
  }
}

function getStorageFailureMessage(operation: 'read' | 'save' | 'remove'): string {
  if (Platform.OS === 'web') {
    return `Unable to ${operation} the session in browser storage.`;
  }

  return `Unable to ${operation} the session in secure device storage.`;
}

export const AuthStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return getBrowserStorage().getItem(key);
      }

      return await SecureStore.getItemAsync(key);
    } catch (error) {
      if (error instanceof AuthStorageError) throw error;
      throw new AuthStorageError(getStorageFailureMessage('read'));
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        getBrowserStorage().setItem(key, value);
        return;
      }

      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      if (error instanceof AuthStorageError) throw error;
      throw new AuthStorageError(getStorageFailureMessage('save'));
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        getBrowserStorage().removeItem(key);
        return;
      }

      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      if (error instanceof AuthStorageError) throw error;
      throw new AuthStorageError(getStorageFailureMessage('remove'));
    }
  },
};
