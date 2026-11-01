// src/app/_layout.tsx
import '../global.css';
import { Stack } from 'expo-router';
import { AuthProvider } from '@/auth/auth-context';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </AuthProvider>
  );
}
