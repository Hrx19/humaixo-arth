import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useFinanceColors } from '@/constants/finance-theme';

type MasterCodeModalProps = {
  visible: boolean;
  busy?: boolean;
  mode?: 'verify' | 'enroll';
  error?: string | null;
  onCancel(): void;
  onSubmit(code: string): Promise<void>;
};

const KEYS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫',
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
];

export function MasterCodeModal({
  visible,
  busy = false,
  mode = 'verify',
  error,
  onCancel,
  onSubmit,
}: MasterCodeModalProps): React.JSX.Element {
  const colors = useFinanceColors();
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const pressKey = (key: string): void => {
    setLocalError(null);
    if (key === '⌫') setCode((value) => value.slice(0, -1));
    else setCode((value) => (value.length < 128 ? `${value}${key}` : value));
  };

  const close = (): void => {
    setCode('');
    setLocalError(null);
    onCancel();
  };

  const submit = async (): Promise<void> => {
    if (code.length < 12) {
      setLocalError('Enter at least 12 characters.');
      return;
    }
    try {
      await onSubmit(code);
      setCode('');
      setLocalError(null);
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Master Code verification failed.');
      setCode('');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close Master Code dialog" />
        <View style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{mode === 'enroll' ? 'Set Master Code' : 'Owner verification'}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Enter your Master Code. It is never stored in the app.</Text>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.slice(0, 128))}
            editable={!busy}
            secureTextEntry
            autoCapitalize="characters"
            autoCorrect={false}
            textContentType="none"
            autoComplete="off"
            showSoftInputOnFocus={false}
            contextMenuHidden
            accessibilityLabel="Master Code"
            style={[styles.codeInput, { color: colors.text, borderColor: colors.border }]}
          />
          <ScrollView style={styles.keyScroll} contentContainerStyle={styles.keypad}>
            {KEYS.map((key) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={key === '⌫' ? 'Delete character' : `Enter ${key}`}
                disabled={busy}
                key={key}
                onPress={() => pressKey(key)}
                style={[styles.key, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                <Text style={[styles.keyText, { color: colors.text }]}>{key}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {error || localError ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error ?? localError}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={close} disabled={busy} style={[styles.action, { borderColor: colors.border }]}>
              <Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => void submit()} disabled={busy} style={[styles.action, styles.primary, { backgroundColor: colors.primary }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{mode === 'enroll' ? 'Set code' : 'Verify'}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.68)' },
  dialog: { width: '100%', maxWidth: 420, maxHeight: '90%', borderWidth: 1, borderRadius: 22, padding: 20, gap: 12, overflow: 'hidden' },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 19 },
  codeInput: { borderWidth: 1, borderRadius: 12, minHeight: 48, paddingHorizontal: 12, fontSize: 18, letterSpacing: 4 },
  keyScroll: { maxHeight: 220 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  key: { width: '13%', minWidth: 42, aspectRatio: 1, maxHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 15, fontWeight: '700' },
  error: { fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  action: { minHeight: 44, minWidth: 92, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primary: { borderWidth: 0 },
  primaryText: { color: '#fff', fontWeight: '800' },
});
