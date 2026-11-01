import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AuthStorage } from '@/auth/auth-storage';
import {
  AuthService,
  type AuthSession,
  type AuthUser,
  type LoginCredentials,
  type RegistrationDetails,
} from '@/services/auth-service';

const SESSION_STORAGE_KEY = 'humaixo.auth.session.v1';
const LEGACY_TOKEN_KEY = 'userToken';
const LEGACY_NAME_KEY = 'userName';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  token: string | null;
  user: AuthUser | null;
  error: string | null;
  signIn(credentials: LoginCredentials): Promise<void>;
  signUp(details: RegistrationDetails): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isAuthSession(value: unknown): value is AuthSession {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<AuthSession>;
  return (
    typeof candidate.token === 'string' &&
    candidate.token.trim().length > 0 &&
    ((typeof candidate.user?.id === 'string' && candidate.user.id.trim().length > 0) ||
      candidate.user?.id === null) &&
    typeof candidate.user.name === 'string' &&
    candidate.user.name.trim().length > 0 &&
    typeof candidate.user.email === 'string'
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'An unexpected authentication error occurred.';
}

async function persistSession(session: AuthSession): Promise<void> {
  await AuthStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

  await Promise.allSettled([
    AuthStorage.removeItem(LEGACY_TOKEN_KEY),
    AuthStorage.removeItem(LEGACY_NAME_KEY),
  ]);
}

async function restoreSession(): Promise<AuthSession | null> {
  const storedSession = await AuthStorage.getItem(SESSION_STORAGE_KEY);
  if (storedSession) {
    try {
      const parsed: unknown = JSON.parse(storedSession);
      if (isAuthSession(parsed)) return parsed;
    } catch {
      // A damaged session is cleared below and the legacy keys are checked once.
    }

    await AuthStorage.removeItem(SESSION_STORAGE_KEY);
  }

  // Migrate sessions created by the earlier login screen without dropping users.
  const [legacyToken, legacyName] = await Promise.all([
    AuthStorage.getItem(LEGACY_TOKEN_KEY),
    AuthStorage.getItem(LEGACY_NAME_KEY),
  ]);

  if (!legacyToken?.trim()) return null;

  const migratedSession: AuthSession = {
    token: legacyToken,
    user: {
      id: null,
      name: legacyName?.trim() || 'User',
      email: '',
    },
  };

  await persistSession(migratedSession);
  return migratedSession;
}

export function AuthProvider({ children }: React.PropsWithChildren): React.JSX.Element {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void restoreSession()
      .then((restoredSession) => {
        if (!isMounted) return;
        setSession(restoredSession);
        setStatus(restoredSession ? 'authenticated' : 'unauthenticated');
      })
      .catch((restoreError: unknown) => {
        if (!isMounted) return;
        setSession(null);
        setError(getErrorMessage(restoreError));
        setStatus('unauthenticated');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const finishAuthentication = useCallback(async (nextSession: AuthSession) => {
    setError(null);
    await persistSession(nextSession);
    setSession(nextSession);
    setStatus('authenticated');
  }, []);

  const signIn = useCallback(
    async (credentials: LoginCredentials) => {
      setError(null);
      try {
        const nextSession = await AuthService.login(credentials);
        await finishAuthentication(nextSession);
      } catch (authError) {
        const message = getErrorMessage(authError);
        setError(message);
        throw new Error(message);
      }
    },
    [finishAuthentication],
  );

  const signUp = useCallback(
    async (details: RegistrationDetails) => {
      setError(null);
      try {
        const nextSession = await AuthService.register(details);
        await finishAuthentication(nextSession);
      } catch (authError) {
        const message = getErrorMessage(authError);
        setError(message);
        throw new Error(message);
      }
    },
    [finishAuthentication],
  );

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await AuthStorage.removeItem(SESSION_STORAGE_KEY);
      await Promise.allSettled([
        AuthStorage.removeItem(LEGACY_TOKEN_KEY),
        AuthStorage.removeItem(LEGACY_NAME_KEY),
      ]);
      setSession(null);
      setStatus('unauthenticated');
    } catch (storageError) {
      const message = getErrorMessage(storageError);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      token: session?.token ?? null,
      user: session?.user ?? null,
      error,
      signIn,
      signUp,
      signOut,
    }),
    [status, session, error, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return context;
}
