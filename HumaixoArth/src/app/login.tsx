import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { OAuthSignInButtons } from '@/components/auth/OAuthSignInButtons';
import type {
  OAuthCodeExchange,
  OAuthProvider,
} from '@/services/auth-service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen(): React.JSX.Element {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const {
    status,
    error: authError,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithGoogleIdToken,
    signInWithGitHub,
    continueAsGuest,
  } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  const handleAuth = async (): Promise<void> => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    if (!isLogin && !normalizedName) {
      setFormError('Please enter your full name.');
      return;
    }
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setFormError('Please enter your password.');
      return;
    }
    if (!isLogin && password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (password.length > 128) {
      setFormError('Password must be 128 characters or fewer.');
      return;
    }
    if (!isLogin && normalizedName.length > 100) {
      setFormError('Name must be 100 characters or fewer.');
      return;
    }
    if (normalizedEmail.length > 254) {
      setFormError('Email address must be 254 characters or fewer.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      if (isLogin) {
        await signIn({ email: normalizedEmail, password });
      } else {
        await signUp({ name: normalizedName, email: normalizedEmail, password });
      }
      router.replace('/');
    } catch (authFailure) {
      setFormError(
        authFailure instanceof Error
          ? authFailure.message
          : 'Authentication failed. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuthSignIn = useCallback(
    async (provider: OAuthProvider, exchange: OAuthCodeExchange): Promise<void> => {
      setFormError(null);
      if (provider === 'google') {
        await signInWithGoogle(exchange);
      } else {
        await signInWithGitHub(exchange);
      }
      router.replace('/');
    },
    [router, signInWithGitHub, signInWithGoogle],
  );

  const handleGoogleIdToken = useCallback(
    async (idToken: string): Promise<void> => {
      setFormError(null);
      await signInWithGoogleIdToken(idToken);
      router.replace('/');
    },
    [router, signInWithGoogleIdToken],
  );

  const handleContinueAsGuest = async (): Promise<void> => {
    setFormError(null);
    setIsSubmitting(true);
    try {
      await continueAsGuest();
      router.replace('/');
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Could not switch to guest mode.',
      );
      router.replace('/');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAuthMode = (): void => {
    setFormError(null);
    setIsLogin((current) => !current);
  };

  const isBusy = isSubmitting || status === 'loading';
  const visibleError = formError || authError;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: width < 360 ? 16 : 22 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formColumn}>
        <View style={styles.brandMark}>
          <Text style={styles.brandSymbol}>H</Text>
        </View>
        <Text style={styles.eyebrow}>HUMAIXO ARTH</Text>
        <Text style={styles.title}>{isLogin ? 'Welcome back' : 'Create your account'}</Text>
        <Text style={styles.subtitle}>
          {isLogin
            ? 'Sign in to see your money clearly.'
            : 'A clearer picture of every rupee starts here.'}
        </Text>

        <View style={styles.card}>
          <OAuthSignInButtons
            disabled={isBusy}
            onBusyChange={setIsSubmitting}
            onAuthenticate={handleOAuthSignIn}
            onAuthenticateGoogleIdToken={handleGoogleIdToken}
            onError={setFormError}
          />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR CONTINUE WITH EMAIL</Text>
            <View style={styles.dividerLine} />
          </View>

          {!isLogin ? (
            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor="#8190a5"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
              editable={!isBusy}
              returnKeyType="next"
              accessibilityLabel="Full name"
            />
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor="#8190a5"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            editable={!isBusy}
            returnKeyType="next"
            accessibilityLabel="Email address"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#8190a5"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            textContentType={isLogin ? 'password' : 'newPassword'}
            editable={!isBusy}
            returnKeyType="done"
            onSubmitEditing={() => void handleAuth()}
            accessibilityLabel="Password"
          />

          {visibleError ? (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {visibleError}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, isBusy && styles.buttonDisabled]}
            onPress={() => void handleAuth()}
            disabled={isBusy}
            accessibilityRole="button"
          >
            {isBusy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isLogin ? 'Sign in' : 'Create account'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={toggleAuthMode}
            style={styles.switchButton}
            disabled={isBusy}
            accessibilityRole="button"
          >
            <Text style={styles.switchText}>
              {isLogin
                ? "New to Humaixo Arth? Create an account"
                : 'Already have an account? Sign in'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => void handleContinueAsGuest()}
          style={styles.guestButton}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityLabel="Continue as guest"
        >
          <Text style={styles.guestButtonText}>Explore as a guest</Text>
        </TouchableOpacity>
        <Text style={styles.privacyText}>
          Your financial data stays private and belongs to your account.
        </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080c17',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 30,
  },
  formColumn: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#625cf5',
    marginBottom: 15,
  },
  brandSymbol: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
  },
  eyebrow: {
    textAlign: 'center',
    letterSpacing: 2.6,
    color: '#a5b4fc',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 8,
  },
  title: {
    color: '#f8fafc',
    fontSize: 29,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9aa8bd',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 25,
  },
  card: {
    backgroundColor: '#111827',
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#263349',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 20,
  },
  dividerLine: {
    height: 1,
    flex: 1,
    backgroundColor: '#2a3548',
  },
  dividerText: {
    color: '#75849a',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  input: {
    backgroundColor: '#0b1220',
    color: '#f8fafc',
    borderRadius: 13,
    paddingHorizontal: 15,
    height: 52,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: '#344258',
    fontSize: 14,
  },
  errorText: {
    color: '#fda4af',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: '#625cf5',
    paddingHorizontal: 16,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 3,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  switchButton: {
    alignItems: 'center',
    paddingTop: 17,
    paddingBottom: 2,
  },
  switchText: {
    color: '#b7bcff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  guestButton: {
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 8,
  },
  guestButtonText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  privacyText: {
    color: '#64748b',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});
