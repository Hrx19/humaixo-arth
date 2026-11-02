import AsyncStorage from '@react-native-async-storage/async-storage';

const HIDE_BALANCES_KEY = 'humaixo.preferences.hideBalances.v1';

export const PreferencesService = {
  async getHideBalances(): Promise<boolean> {
    return (await AsyncStorage.getItem(HIDE_BALANCES_KEY)) === 'true';
  },

  async setHideBalances(hidden: boolean): Promise<void> {
    await AsyncStorage.setItem(HIDE_BALANCES_KEY, String(hidden));
  },
};
