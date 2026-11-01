import { create } from 'zustand';
import { FinanceService } from '@/services/finance-service';
import type { FinanceAccount, FinanceAnalytics, FinanceTransaction } from '@/types/finance';

type FinanceState = {
  accounts: FinanceAccount[];
  transactions: FinanceTransaction[];
  analytics: FinanceAnalytics | null;
  loading: boolean;
  error: string | null;
  refreshDashboard(token: string): Promise<void>;
  clear(): void;
};

const INITIAL_STATE = {
  accounts: [] as FinanceAccount[],
  transactions: [] as FinanceTransaction[],
  analytics: null as FinanceAnalytics | null,
  loading: false,
  error: null as string | null,
};

export const useFinanceStore = create<FinanceState>((set) => ({
  ...INITIAL_STATE,

  async refreshDashboard(token: string): Promise<void> {
    set({
      accounts: [],
      transactions: [],
      analytics: null,
      loading: true,
      error: null,
    });

    try {
      const [accounts, transactions, analytics] = await Promise.all([
        FinanceService.getAccounts(token),
        FinanceService.getTransactions(token, { page: 1, limit: 30 }),
        FinanceService.getAnalytics(token, 12),
      ]);
      set({ accounts, transactions, analytics, error: null });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Dashboard data could not be loaded.',
      });
    } finally {
      set({ loading: false });
    }
  },

  clear(): void {
    set(INITIAL_STATE);
  },
}));
