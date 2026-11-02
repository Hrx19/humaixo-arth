import { create } from 'zustand';
import { AuthStorage, AuthStorageError } from '@/auth/auth-storage';
import {
  AuthService,
  AuthServiceError,
  type AuthSession,
  type AuthUser,
} from '@/services/auth-service';

const SESSION_STORAGE_KEY = 'humaixo.auth.session.v1';
const LEGACY_TOKEN_KEY = 'userToken';
const LEGACY_NAME_KEY = 'userName';

export interface AuthStoreState {
  user: AuthUser | null;
  token: string | null;
  isGuest: boolean;
  isLoading: boolean;
  /** True after the first attempt to restore a saved session completes. */
  hasHydrated: boolean;
  /** Safe to show in the UI; storage payloads and tokens are never included. */
  storageError: string | null;
  login(user: AuthUser, token: string): Promise<void>;
  updateUser(user: AuthUser): Promise<void>;
  logout(): Promise<void>;
  setGuestMode(): Promise<void>;
  checkAuth(): Promise<void>;
}

const INITIAL_STATE = {
  user: null,
  token: null,
  isGuest: true,
  isLoading: true,
  hasHydrated: false,
  storageError: null,
} satisfies Pick<
  AuthStoreState,
  'user' | 'token' | 'isGuest' | 'isLoading' | 'hasHydrated' | 'storageError'
>;

let authCheckPromise: Promise<void> | null = null;
let authOperationVersion = 0;
let storageOperationQueue: Promise<void> = Promise.resolve();

function serializeStorageOperation<T>(operation: () => Promise<T>): Promise<T> {
  const currentOperation = storageOperationQueue.then(operation, operation);
  storageOperationQueue = currentOperation.then(
    () => undefined,
    () => undefined,
  );
  return currentOperation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!isRecord(value)) return false;

  return (
    (typeof value.id === 'string' || value.id === null) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    typeof value.email === 'string'
  );
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!isRecord(value)) return false;

  return (
    typeof value.token === 'string' &&
    value.token.trim().length > 0 &&
    isAuthUser(value.user)
  );
}

function getStorageErrorMessage(
  error: unknown,
  operation: 'restore' | 'save' | 'clear',
): string {
  if (error instanceof AuthStorageError) return error.message;
  if (operation === 'restore') return 'Could not restore your saved sign-in session.';
  if (operation === 'save') return 'Could not securely save your sign-in session.';
  return 'Could not fully clear the saved sign-in session.';
}

async function saveSession(session: AuthSession): Promise<void> {
  // Persist the canonical session first so an interrupted migration never loses
  // an existing sign-in before the replacement has been safely written.
  await AuthStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

  await Promise.allSettled([
    AuthStorage.removeItem(LEGACY_TOKEN_KEY),
    AuthStorage.removeItem(LEGACY_NAME_KEY),
  ]);
}

async function clearPersistedSession(): Promise<void> {
  const results = await Promise.allSettled([
    AuthStorage.removeItem(SESSION_STORAGE_KEY),
    AuthStorage.removeItem(LEGACY_TOKEN_KEY),
    AuthStorage.removeItem(LEGACY_NAME_KEY),
  ]);

  if (results.some((result) => result.status === 'rejected')) {
    throw new AuthStorageError('Could not fully clear the saved sign-in session.');
  }
}

async function restoreSession(): Promise<AuthSession | null> {
  const serializedSession = await AuthStorage.getItem(SESSION_STORAGE_KEY);

  if (serializedSession) {
    try {
      const parsed: unknown = JSON.parse(serializedSession);
      if (isAuthSession(parsed)) return parsed;
    } catch {
      // Invalid stored JSON is removed before checking keys from older releases.
    }

    await AuthStorage.removeItem(SESSION_STORAGE_KEY);
  }

  // Preserve sessions created by the earlier login flow and migrate them once.
  const [legacyToken, legacyName] = await Promise.all([
    AuthStorage.getItem(LEGACY_TOKEN_KEY),
    AuthStorage.getItem(LEGACY_NAME_KEY),
  ]);

  const normalizedToken = legacyToken?.trim();
  if (!normalizedToken) return null;

  const migratedSession: AuthSession = {
    token: normalizedToken,
    user: {
      id: null,
      name: legacyName?.trim() || 'User',
      email: '',
    },
  };

  await saveSession(migratedSession);
  return migratedSession;
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  ...INITIAL_STATE,

  async login(user: AuthUser, token: string): Promise<void> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new Error('A valid authentication token is required.');
    }
    if (!isAuthUser(user)) {
      throw new Error('A valid user profile is required to sign in.');
    }

    const operationVersion = ++authOperationVersion;
    const session: AuthSession = { user, token: normalizedToken };
    set({ isLoading: true, storageError: null });

    try {
      await serializeStorageOperation(() => saveSession(session));
      if (operationVersion !== authOperationVersion) return;

      set({
        user,
        token: normalizedToken,
        isGuest: false,
        isLoading: false,
        hasHydrated: true,
        storageError: null,
      });
    } catch (error) {
      if (operationVersion === authOperationVersion) {
        set({
          user: null,
          token: null,
          isGuest: true,
          isLoading: false,
          hasHydrated: true,
          storageError: getStorageErrorMessage(error, 'save'),
        });
      }

      throw new Error(getStorageErrorMessage(error, 'save'));
    }
  },

  async updateUser(user: AuthUser): Promise<void> {
    const token = get().token;
    if (!token) throw new Error('Sign in before updating your profile.');
    if (!isAuthUser(user)) throw new Error('A valid user profile is required.');

    const operationVersion = ++authOperationVersion;
    try {
      await serializeStorageOperation(() => saveSession({ user, token }));
      if (operationVersion === authOperationVersion) set({ user, storageError: null });
    } catch (error) {
      throw new Error(getStorageErrorMessage(error, 'save'));
    }
  },

  async logout(): Promise<void> {
    const operationVersion = ++authOperationVersion;
    set({ isLoading: true, storageError: null });

    try {
      await serializeStorageOperation(clearPersistedSession);
      if (operationVersion !== authOperationVersion) return;

      set({
        user: null,
        token: null,
        isGuest: true,
        isLoading: false,
        hasHydrated: true,
        storageError: null,
      });
    } catch (error) {
      if (operationVersion === authOperationVersion) {
        // Remove in-memory credentials even if a platform storage operation
        // fails, so the current app session immediately becomes a guest session.
        set({
          user: null,
          token: null,
          isGuest: true,
          isLoading: false,
          hasHydrated: true,
          storageError: getStorageErrorMessage(error, 'clear'),
        });
      }

      throw new Error(getStorageErrorMessage(error, 'clear'));
    }
  },

  async setGuestMode(): Promise<void> {
    await get().logout();
  },

  async checkAuth(): Promise<void> {
    if (get().hasHydrated) return;
    if (authCheckPromise) return authCheckPromise;

    const operationVersion = authOperationVersion;
    set({ isLoading: true, storageError: null });

    authCheckPromise = (async () => {
      try {
        let session = await serializeStorageOperation(restoreSession);
        if (operationVersion !== authOperationVersion) return;

        if (session) {
          try {
            const currentUser = await AuthService.getMe(session.token);
            const refreshedSession: AuthSession = { ...session, user: currentUser };
            session = refreshedSession;
            await serializeStorageOperation(() => saveSession(refreshedSession));
          } catch (error) {
            if (
              error instanceof AuthServiceError &&
              (error.statusCode === 401 || error.statusCode === 403 || error.statusCode === 404)
            ) {
              session = null;
              try {
                await serializeStorageOperation(clearPersistedSession);
              } catch {
                // Invalid in-memory credentials must be discarded even if the
                // browser or device refuses to remove the stale disk entry.
              }
            } else {
              // A network outage should not destroy a valid session. Protected
              // APIs will still enforce the server token on every request.
              set({ storageError: 'Could not verify the saved session. Reconnect to sync account data.' });
            }
          }
        }

        if (operationVersion !== authOperationVersion) return;

        set({
          user: session?.user ?? null,
          token: session?.token ?? null,
          isGuest: session === null,
          storageError: get().storageError,
        });
      } catch (error) {
        if (operationVersion === authOperationVersion) {
          set({
            user: null,
            token: null,
            isGuest: true,
            storageError: getStorageErrorMessage(error, 'restore'),
          });
        }
      } finally {
        if (operationVersion === authOperationVersion) {
          set({ isLoading: false, hasHydrated: true });
        }
        authCheckPromise = null;
      }
    })();

    return authCheckPromise;
  },
}));
