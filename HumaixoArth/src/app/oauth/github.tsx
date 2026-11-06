import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { consumePendingGitHubOAuth } from '@/auth/github-oauth-handoff';

function getSingleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function GitHubOAuthCallbackScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    code?: string | string[];
    state?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();
  const router = useRouter();
  const { signInWithGitHub } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const completionRef = useRef<Promise<void> | null>(null);

  const code = getSingleParam(params.code);
  const state = getSingleParam(params.state);
  const providerError = getSingleParam(params.error);
  const providerErrorDescription = getSingleParam(params.error_description);

  useEffect(() => {
    let active = true;

    if (!completionRef.current) {
      completionRef.current = (async () => {
        if (!state) {
          throw new Error('GitHub returned an invalid sign-in response. Please try again.');
        }

        const pendingRequest = await consumePendingGitHubOAuth(state);
        if (!pendingRequest) {
          throw new Error('GitHub sign-in expired or could not be verified. Please try again.');
        }
        if (providerError) {
          throw new Error(
            providerErrorDescription || 'GitHub sign-in was cancelled or declined.',
          );
        }
        if (!code) {
          throw new Error('GitHub did not return an authorization code. Please try again.');
        }

        await signInWithGitHub({
          code,
          codeVerifier: pendingRequest.codeVerifier,
          clientId: pendingRequest.clientId,
          redirectUri: pendingRequest.redirectUri,
        });
      })();
    }

    void completionRef.current.then(
      () => {
        if (active) router.replace('/');
      },
      (error: unknown) => {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : 'GitHub sign-in could not be completed.',
          );
        }
      },
    );

    return () => {
      active = false;
    };
  }, [code, providerError, providerErrorDescription, router, signInWithGitHub, state]);

  return (
    <View style={styles.container}>
      {errorMessage ? (
        <>
          <Text style={styles.title}>GitHub sign-in failed</Text>
          <Text style={styles.message}>{errorMessage}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.replace('/login')}
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>Back to sign in</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color="#8b6cff" />
          <Text style={styles.message}>Signing in with GitHub...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: '#090910',
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#6d4aff',
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
