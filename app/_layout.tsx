import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { AuthProvider, useAuth } from '@/lib/auth';
import { NotificationsProvider } from '@/lib/notifications';
import { Colors } from '@/lib/theme';
import { View } from 'react-native';

function RootLayoutNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inResetPassword = segments[0] === 'reset-password';
    if (!session && !inAuthGroup && !inResetPassword) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="post/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="user/[id]" />
      <Stack.Screen name="user/[id]/follows" />
      <Stack.Screen name="chat/[userId]" />
      <Stack.Screen name="story/[userId]" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="instant/camera" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="instant/viewer" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="instant/mine"   options={{ presentation: 'modal' }} />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="reel/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <NotificationsProvider>
          <StatusBar style="light" />
          <RootLayoutNav />
        </NotificationsProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
