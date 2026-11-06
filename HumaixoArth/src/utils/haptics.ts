import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function triggerLightImpact(): void {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error: unknown) => {
    console.warn('Light haptic feedback is unavailable.', error);
  });
}

export function triggerSuccessHaptic(): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch((error: unknown) => {
    console.warn('Success haptic feedback is unavailable.', error);
  });
}
