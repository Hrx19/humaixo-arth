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

let dashboardRequestId = 0;
let activeDashboardRequest: { token: string; promise: Promise<void> } | null = null;
let dashboardDataToken: string | null = null;

export const useFinanceStore = create<FinanceState>((set) => ({
  ...INITIAL_STATE,

  async refreshDashboard(token: string): Promise<void> {
    if (activeDashboardRequest?.token === token) return activeDashboardRequest.promise;

    const requestId = ++dashboardRequestId;
    if (dashboardDataToken !== token) {
      dashboardDataToken = token;
      set({ ...INITIAL_STATE, loading: true });
    } else {
      set({ loading: true, error: null });
    }

    const promise = (async (): Promise<void> => {
      try {
        const [accounts, transactions, analytics] = await Promise.all([
          FinanceService.getAccounts(token),
          FinanceService.getTransactions(token, { page: 1, limit: 30 }),
          FinanceService.getAnalytics(token, 12),
        ]);
        if (requestId === dashboardRequestId) {
          set({ accounts, transactions, analytics, error: null });
        }
      } catch (error) {
        if (requestId === dashboardRequestId) {
          set({
            error: error instanceof Error ? error.message : 'Dashboard data could not be loaded.',
          });
        }
      } finally {
        if (requestId === dashboardRequestId) {
          set({ loading: false });
          activeDashboardRequest = null;
        }
      }
    })();

    activeDashboardRequest = { token, promise };
    return promise;
  },

  clear(): void {
    dashboardRequestId += 1;
    activeDashboardRequest = null;
    dashboardDataToken = null;
    set(INITIAL_STATE);
  },
}));
