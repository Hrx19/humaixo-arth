import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen(): React.JSX.Element {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { status, error: authError, signIn, signUp } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  const handleAuth = async (): Promise<void> => {
    const normalizedEmail = email.trim();
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
    if (!isLogin && password.length > 128) {
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

  const toggleAuthMode = (): void => {
    setFormError(null);
    setIsLogin((current) => !current);
  };

  const handleContinueAsGuest = (): void => {
    setFormError(null);
    router.replace('/');
  };

  const isBusy = isSubmitting || status === 'loading';
  const visibleError = formError || authError;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </Text>
        <Text style={styles.subtitle}>
          {isLogin ? 'Login to Humaixo Arth' : 'Join Humaixo Arth today'}
        </Text>

        {!isLogin && (
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#94a3b8"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            editable={!isBusy}
            returnKeyType="next"
            accessibilityLabel="Full name"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email Address"
          placeholderTextColor="#94a3b8"
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
          placeholderTextColor="#94a3b8"
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
          style={[styles.button, isBusy && styles.buttonDisabled]}
          onPress={() => void handleAuth()}
          disabled={isBusy}
          accessibilityRole="button"
        >
          {isBusy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{isLogin ? 'Login' : 'Sign Up'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={toggleAuthMode}
          style={styles.switchContainer}
          disabled={isBusy}
          accessibilityRole="button"
        >
          <Text style={styles.switchText}>
            {isLogin
              ? "Don't have an account? Sign Up"
              : 'Already have an account? Login'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleContinueAsGuest}
          style={styles.guestButton}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Continue as guest"
        >
          <Text style={styles.guestButtonText}>Continue as Guest</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#1e293b',
    padding: 30,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#475569',
    fontSize: 15,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#6366f1',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    minHeight: 54,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  switchContainer: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchText: {
    color: '#a5b4fc',
    fontSize: 14,
    fontWeight: '600',
  },
  guestButton: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
  },
  guestButtonText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
});
