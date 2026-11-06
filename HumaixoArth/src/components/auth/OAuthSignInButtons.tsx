import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import {
  ResponseType,
  makeRedirectUri,
  useAuthRequest,
  type AuthSessionResult,
  type DiscoveryDocument,
} from 'expo-auth-session';
import type { OAuthCodeExchange, OAuthProvider } from '@/services/auth-service';
import {
  clearPendingGitHubOAuth,
  savePendingGitHubOAuth,
} from '@/auth/github-oauth-handoff';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_DISCOVERY: DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

const GITHUB_DISCOVERY: DiscoveryDocument = {
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
};

type WebProviderButtonProps = {
  provider: OAuthProvider;
  clientId: string;
  redirectUri: string;
  discovery: DiscoveryDocument;
  scopes: string[];
  disabled: boolean;
  onBusyChange(value: boolean): void;
  onAuthenticate(provider: OAuthProvider, exchange: OAuthCodeExchange): Promise<void>;
  onError(message: string): void;
};

type NativeGoogleButtonProps = {
  webClientId: string;
  iosClientId: string;
  disabled: boolean;
  onBusyChange(value: boolean): void;
  onAuthenticate(idToken: string): Promise<void>;
  onError(message: string): void;
};

type NativeGitHubButtonProps = {
  clientId: string;
  callbackUri: string;
  disabled: boolean;
  onBusyChange(value: boolean): void;
  onError(message: string): void;
};

function getGoogleWebClientId(): string {
  const environmentClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (environmentClientId) return environmentClientId;

  const configuredClientId = Constants.expoConfig?.extra?.googleSignIn?.webClientId;
  return typeof configuredClientId === 'string' ? configuredClientId.trim() : '';
}

function getGoogleIosClientId(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? '';
}

function getGitHubClientId(): string {
  const platformClientId = Platform.OS === 'web'
    ? process.env.EXPO_PUBLIC_GITHUB_WEB_CLIENT_ID
    : process.env.EXPO_PUBLIC_GITHUB_NATIVE_CLIENT_ID;

  return platformClientId?.trim() || process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID?.trim() || '';
}

function getWebRedirectUri(provider: OAuthProvider): string {
  const configuredRedirectUri = provider === 'google'
    ? process.env.EXPO_PUBLIC_GOOGLE_WEB_REDIRECT_URI?.trim()
    : process.env.EXPO_PUBLIC_GITHUB_WEB_REDIRECT_URI?.trim();

  return configuredRedirectUri || makeRedirectUri({ path: `oauth/${provider}` });
}

function getGitHubNativeCallbackUri(): string {
  return process.env.EXPO_PUBLIC_GITHUB_NATIVE_REDIRECT_URI?.trim() ?? '';
}

function isGitHubCallbackUrl(value: string): boolean {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!apiUrl) return false;

  try {
    const api = new URL(apiUrl);
    const url = new URL(value);
    return api.protocol === 'https:'
      && url.protocol === 'https:'
      && url.origin === api.origin
      && url.pathname === '/api/auth/callback/github'
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function getGoogleNativeSetupError(): string | null {
  if (!getGoogleWebClientId()) {
    return 'Google sign-in needs the Web client ID to verify accounts securely.';
  }
  if (Platform.OS === 'ios' && !getGoogleIosClientId()) {
    return 'Google iOS sign-in needs an iOS OAuth client ID and URL scheme setup.';
  }
  return null;
}

function getGitHubNativeSetupError(callbackUri: string): string | null {
  if (!callbackUri) {
    return 'GitHub sign-in needs EXPO_PUBLIC_GITHUB_NATIVE_REDIRECT_URI.';
  }
  if (!isGitHubCallbackUrl(callbackUri)) {
    return 'GitHub sign-in must use the HTTPS API callback ending in /api/auth/callback/github.';
  }
  return null;
}

function getGoogleNativeErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
      return 'Google Play Services are unavailable or need an update.';
    }
    if (code === 'IN_PROGRESS') return 'Google sign-in is already in progress.';
    if (code === 'DEVELOPER_ERROR' || code === 10) {
      return 'Google rejected this Android build. Verify the Android OAuth client package name and signing SHA-1, and confirm the configured client ID is a Web application client.';
    }
  }

  if (error instanceof Error && error.message.trim()) {
    if (/DEVELOPER_ERROR|code\s*10|developer console/i.test(error.message)) {
      return 'Google rejected this Android build. Verify the Android OAuth client package name and signing SHA-1, and confirm the configured client ID is a Web application client.';
    }
    if (/native module|RNGoogleSignin|TurboModule/i.test(error.message)) {
      return 'Google sign-in on Android/iOS needs the Humaixo Arth development build. Email login still works in Expo Go.';
    }
    return error.message;
  }
  return 'Google sign-in could not be completed. Please try again.';
}

function getGitHubNativeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'GitHub sign-in could not be completed. Please try again.';
}

function NativeGoogleButton({
  webClientId,
  iosClientId,
  disabled,
  onBusyChange,
  onAuthenticate,
  onError,
}: NativeGoogleButtonProps): React.JSX.Element {
  const [isWorking, setIsWorking] = useState(false);

  const handlePress = async (): Promise<void> => {
    if (disabled || isWorking) return;

    setIsWorking(true);
    onBusyChange(true);
    let stage:
      | 'configuration'
      | 'play_services'
      | 'native_sign_in'
      | 'token_validation'
      | 'backend_authentication' = 'configuration';
    try {
      if (!webClientId) {
        throw new Error('Google sign-in is not configured. Add the Web client ID first.');
      }

      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      GoogleSignin.configure({
        webClientId,
        offlineAccess: false,
        ...(Platform.OS === 'ios' && iosClientId ? { iosClientId } : {}),
      });

      if (Platform.OS === 'android') {
        stage = 'play_services';
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }

      stage = 'native_sign_in';
      const result = await GoogleSignin.signIn();
      if (result.type === 'cancelled') return;

      stage = 'token_validation';
      const idToken = result.data.idToken?.trim();
      if (!idToken) {
        throw new Error('Google did not return an ID token. Check the Web OAuth client ID.');
      }

      stage = 'backend_authentication';
      await onAuthenticate(idToken);
    } catch (error) {
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          && (typeof error.code === 'string' || typeof error.code === 'number')
          ? error.code
          : undefined;
      console.error('[Google Sign-In] Failed', {
        stage,
        code: errorCode,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      onError(getGoogleNativeErrorMessage(error));
    } finally {
      setIsWorking(false);
      onBusyChange(false);
    }
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      disabled={disabled || isWorking}
      onPress={() => void handlePress()}
      style={[styles.providerButton, (disabled || isWorking) && styles.providerButtonDisabled]}
    >
      {isWorking ? <ActivityIndicator size="small" color="#e2e8f0" /> : (
        <><Text style={styles.googleMark}>G</Text><Text style={styles.providerLabel}>Continue with Google</Text></>
      )}
    </TouchableOpacity>
  );
}

function NativeGitHubButton({
  clientId,
  callbackUri,
  disabled,
  onBusyChange,
  onError,
}: NativeGitHubButtonProps): React.JSX.Element {
  const [isWorking, setIsWorking] = useState(false);
  const [request] = useAuthRequest({
    clientId: clientId || 'oauth-client-not-configured',
    // GitHub validates this HTTPS API callback. It is not the app-return URI.
    redirectUri: callbackUri || 'https://oauth.invalid/api/auth/callback/github',
    responseType: ResponseType.Code,
    usePKCE: true,
    scopes: ['read:user', 'user:email'],
    extraParams: { allow_signup: 'true' },
  }, GITHUB_DISCOVERY);

  const handlePress = async (): Promise<void> => {
    if (disabled || isWorking || !request?.url || !request.codeVerifier || !request.state) return;

    setIsWorking(true);
    onBusyChange(true);
    try {
      await savePendingGitHubOAuth({
        state: request.state,
        codeVerifier: request.codeVerifier,
        clientId,
        redirectUri: callbackUri,
      });

      await Linking.openURL(request.url);
    } catch (error) {
      if (request.state) {
        await clearPendingGitHubOAuth(request.state).catch((storageError: unknown) => {
          console.error('[GitHub Sign-In] Could not clear pending OAuth state.', storageError);
        });
      }
      onError(getGitHubNativeErrorMessage(error));
    } finally {
      setIsWorking(false);
      onBusyChange(false);
    }
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Continue with GitHub"
      disabled={disabled || !request || isWorking}
      onPress={() => void handlePress()}
      style={[styles.providerButton, (disabled || !request || isWorking) && styles.providerButtonDisabled]}
    >
      {isWorking ? <ActivityIndicator size="small" color="#e2e8f0" /> : (
        <><Text style={styles.githubMark}>●</Text><Text style={styles.providerLabel}>Continue with GitHub</Text></>
      )}
    </TouchableOpacity>
  );
}

function WebProviderButton({
  provider,
  clientId,
  redirectUri,
  discovery,
  scopes,
  disabled,
  onBusyChange,
  onAuthenticate,
  onError,
}: WebProviderButtonProps): React.JSX.Element {
  const [isPrompting, setIsPrompting] = useState(false);
  const processedResponses = useRef<Set<string>>(new Set());
  const [request, response, promptAsync] = useAuthRequest({
    clientId: clientId || 'oauth-client-not-configured',
    redirectUri,
    responseType: ResponseType.Code,
    usePKCE: true,
    scopes,
    extraParams: provider === 'google' ? { prompt: 'select_account' } : { allow_signup: 'true' },
  }, discovery);

  useEffect(() => {
    if (!response) return;
    if (response.type === 'error') {
      onError(response.error?.message || `Could not connect to ${provider === 'google' ? 'Google' : 'GitHub'}. Try again.`);
      return;
    }
    if (response.type !== 'success') return;

    const code = response.params.code;
    const responseState = response.params.state;
    const responseKey = `${provider}:${responseState ?? 'missing'}:${code ?? 'missing'}`;
    if (processedResponses.current.has(responseKey)) return;
    processedResponses.current.add(responseKey);

    if (!request?.state || responseState !== request.state) {
      onError('The sign-in response could not be verified. Please restart sign-in.');
      return;
    }
    if (!code || !request.codeVerifier) {
      onError('The provider returned an incomplete sign-in response. Please try again.');
      return;
    }

    onBusyChange(true);
    void onAuthenticate(provider, { code, codeVerifier: request.codeVerifier, clientId, redirectUri })
      .catch((error: unknown) => onError(error instanceof Error ? error.message : 'Social sign-in failed. Please try again.'))
      .finally(() => {
        setIsPrompting(false);
        onBusyChange(false);
      });
  }, [clientId, onAuthenticate, onBusyChange, onError, provider, redirectUri, request, response]);

  const label = provider === 'google' ? 'Google' : 'GitHub';
  const handlePress = async (): Promise<void> => {
    if (disabled || !request || isPrompting) return;
    setIsPrompting(true);
    onBusyChange(true);
    try {
      const result: AuthSessionResult = await promptAsync();
      if (result.type !== 'success') {
        setIsPrompting(false);
        onBusyChange(false);
        if (result.type === 'error') onError(result.error?.message || `${label} sign-in could not be completed.`);
      }
    } catch {
      setIsPrompting(false);
      onBusyChange(false);
      onError(`Could not open ${label} sign-in. Please try again.`);
    }
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${label}`}
      disabled={disabled || !request || isPrompting}
      onPress={() => void handlePress()}
      style={[styles.providerButton, (disabled || !request || isPrompting) && styles.providerButtonDisabled]}
    >
      {isPrompting ? <ActivityIndicator size="small" color="#e2e8f0" /> : (
        <><Text style={provider === 'google' ? styles.googleMark : styles.githubMark}>{provider === 'google' ? 'G' : '●'}</Text><Text style={styles.providerLabel}>Continue with {label}</Text></>
      )}
    </TouchableOpacity>
  );
}

export function OAuthSignInButtons({
  disabled,
  onBusyChange,
  onAuthenticate,
  onAuthenticateGoogleIdToken,
  onError,
}: {
  disabled: boolean;
  onBusyChange(value: boolean): void;
  onAuthenticate(provider: OAuthProvider, exchange: OAuthCodeExchange): Promise<void>;
  onAuthenticateGoogleIdToken(idToken: string): Promise<void>;
  onError(message: string): void;
}): React.JSX.Element {
  const googleWebClientId = getGoogleWebClientId();
  const googleIosClientId = getGoogleIosClientId();
  const githubClientId = getGitHubClientId();
  const githubNativeCallbackUri = getGitHubNativeCallbackUri();
  const isNative = Platform.OS !== 'web';
  const googleNativeSetupError = isNative ? getGoogleNativeSetupError() : null;
  const githubNativeSetupError = isNative ? getGitHubNativeSetupError(githubNativeCallbackUri) : null;
  const googleReady = isNative ? googleNativeSetupError === null : googleWebClientId.length > 0;
  const githubReady = Boolean(githubClientId) && (!isNative || githubNativeSetupError === null);
  const googleWebRedirectUri = useMemo(() => getWebRedirectUri('google'), []);
  const githubWebRedirectUri = useMemo(() => getWebRedirectUri('github'), []);
  const missingProviderSetup = useMemo(() => {
    const messages: string[] = [];
    if (!googleReady) messages.push(googleNativeSetupError ?? 'Add the Google Web OAuth client ID to enable Google sign-in.');
    if (!githubClientId) {
      messages.push(`Add the ${Platform.OS === 'web' ? 'GitHub Web' : 'GitHub Native'} OAuth client ID to enable GitHub sign-in.`);
    } else if (githubNativeSetupError) {
      messages.push(githubNativeSetupError);
    }
    return messages;
  }, [githubClientId, githubNativeSetupError, googleNativeSetupError, googleReady]);

  return (
    <View style={styles.container}>
      {isNative ? (
        <NativeGoogleButton webClientId={googleWebClientId} iosClientId={googleIosClientId} disabled={disabled || !googleReady} onBusyChange={onBusyChange} onAuthenticate={onAuthenticateGoogleIdToken} onError={onError} />
      ) : (
        <WebProviderButton provider="google" clientId={googleWebClientId} redirectUri={googleWebRedirectUri} discovery={GOOGLE_DISCOVERY} scopes={['openid', 'email', 'profile']} disabled={disabled || !googleReady} onBusyChange={onBusyChange} onAuthenticate={onAuthenticate} onError={onError} />
      )}
      {isNative ? (
        <NativeGitHubButton clientId={githubClientId} callbackUri={githubNativeCallbackUri} disabled={disabled || !githubReady} onBusyChange={onBusyChange} onError={onError} />
      ) : (
        <WebProviderButton provider="github" clientId={githubClientId} redirectUri={githubWebRedirectUri} discovery={GITHUB_DISCOVERY} scopes={['read:user', 'user:email']} disabled={disabled || !githubReady} onBusyChange={onBusyChange} onAuthenticate={onAuthenticate} onError={onError} />
      )}
      {missingProviderSetup.length > 0 ? <Text style={styles.setupHint}>{missingProviderSetup.join(' ')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  providerButton: { minHeight: 50, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: '#334155', backgroundColor: '#111827', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  providerButtonDisabled: { opacity: 0.48 },
  providerLabel: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  googleMark: { color: '#60a5fa', fontSize: 19, fontWeight: '900' },
  githubMark: { color: '#f8fafc', fontSize: 14 },
  setupHint: { color: '#94a3b8', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 1 },
});
