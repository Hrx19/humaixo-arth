import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FinanceTheme, useFinanceColors } from '@/constants/finance-theme';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('A screen crashed and was caught by the application error boundary.', error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return <ErrorFallback onRestart={() => this.setState({ hasError: false })} />;
    }

    return this.props.children;
  }
}

function ErrorFallback({ onRestart }: { onRestart: () => void }): React.JSX.Element {
  const colors = useFinanceColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={styles.icon}>!</Text>
        <Text style={[styles.title, { color: colors.text }]}>Something went wrong</Text>
        <Text style={[styles.description, { color: colors.muted }]}>
          An unexpected error interrupted this screen. Restart it to continue using Humaixo Arth.
        </Text>
        <TouchableOpacity onPress={onRestart} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>Restart app</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 460, alignItems: 'center', gap: 14, padding: 24, borderWidth: 1, borderRadius: 22 },
  icon: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', color: '#ffffff', backgroundColor: FinanceTheme.colors.red, fontSize: 30, fontWeight: '800' },
  title: { fontSize: 23, fontWeight: '800', textAlign: 'center' },
  description: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: { minHeight: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 13, backgroundColor: FinanceTheme.colors.primary },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
