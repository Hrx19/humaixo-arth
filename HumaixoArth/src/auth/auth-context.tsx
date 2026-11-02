import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {
  AuthUser,
  LoginCredentials,
  RegistrationDetails,
  AuthSession,
  OAuthCodeExchange,
} from '@/services/auth-service';
import { AuthService } from '@/services/auth-service';
import { useAuthStore } from '@/store/authStore';
import { useFinanceStore } from '@/store/finance-store';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  token: string | null;
  user: AuthUser | null;
  isGuest: boolean;
  error: string | null;
  signIn(credentials: LoginCredentials): Promise<void>;
  signUp(details: RegistrationDetails): Promise<void>;
  signInWithGoogle(exchange: OAuthCodeExchange): Promise<void>;
  signInWithGoogleIdToken(idToken: string): Promise<void>;
  signInWithGitHub(exchange: OAuthCodeExchange): Promise<void>;
  continueAsGuest(): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'An unexpected authentication error occurred.';
}

export function AuthProvider({ children }: React.PropsWithChildren): React.JSX.Element {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const isGuest = useAuthStore((state) => state.isGuest);
  const isLoading = useAuthStore((state) => state.isLoading);
  const storageError = useAuthStore((state) => state.storageError);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const persistLogin = useAuthStore((state) => state.login);
  const clearLogin = useAuthStore((state) => state.logout);
  const clearToGuest = useAuthStore((state) => state.setGuestMode);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const finishAuthentication = useCallback(
    async (request: Promise<AuthSession>): Promise<void> => {
      setIsAuthenticating(true);
      setRequestError(null);

      try {
        const session = await request;
        useFinanceStore.getState().clear();
        await persistLogin(session.user, session.token);
      } catch (error) {
        const message = getErrorMessage(error);
        setRequestError(message);
        throw new Error(message);
      } finally {
        setIsAuthenticating(false);
      }
    },
    [persistLogin],
  );

  const signIn = useCallback(
    async (credentials: LoginCredentials): Promise<void> => {
      await finishAuthentication(AuthService.login(credentials));
    },
    [finishAuthentication],
  );

  const signUp = useCallback(
    async (details: RegistrationDetails): Promise<void> => {
      await finishAuthentication(AuthService.register(details));
    },
    [finishAuthentication],
  );

  const signInWithGoogle = useCallback(
    async (exchange: OAuthCodeExchange): Promise<void> => {
      await finishAuthentication(AuthService.signInWithGoogle(exchange));
    },
    [finishAuthentication],
  );

  const signInWithGoogleIdToken = useCallback(
    async (idToken: string): Promise<void> => {
      await finishAuthentication(AuthService.signInWithGoogleIdToken(idToken));
    },
    [finishAuthentication],
  );

  const signInWithGitHub = useCallback(
    async (exchange: OAuthCodeExchange): Promise<void> => {
      await finishAuthentication(AuthService.signInWithGitHub(exchange));
    },
    [finishAuthentication],
  );

  const continueAsGuest = useCallback(async (): Promise<void> => {
    setRequestError(null);
    try {
      useFinanceStore.getState().clear();
      await clearToGuest();
    } catch (error) {
      const message = getErrorMessage(error);
      setRequestError(message);
      throw new Error(message);
    }
  }, [clearToGuest]);

  const signOut = useCallback(async (): Promise<void> => {
    setRequestError(null);

    try {
      useFinanceStore.getState().clear();
      await clearLogin();
    } catch (error) {
      const message = getErrorMessage(error);
      setRequestError(message);
      throw new Error(message);
    }
  }, [clearLogin]);

  const status: AuthStatus = isLoading || isAuthenticating
    ? 'loading'
    : token
      ? 'authenticated'
      : 'unauthenticated';

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      token,
      user,
      isGuest,
      error: requestError ?? storageError,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithGoogleIdToken,
      signInWithGitHub,
      continueAsGuest,
      signOut,
    }),
    [
      status,
      token,
      user,
      isGuest,
      requestError,
      storageError,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithGoogleIdToken,
      signInWithGitHub,
      continueAsGuest,
      signOut,
    ],
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
