import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold, useFonts } from '@expo-google-fonts/ibm-plex-sans-arabic';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { I18nManager, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@/components/overlays';
import { AppProvider, useApp } from '@/store/AppStore';
import { SupportProvider } from '@/store/support';
import { colors } from '@/theme';

// Layout direction is handled by the app itself (per selected language),
// so keep the native layout LTR to avoid double-flipping on RTL devices.
if (Platform.OS !== 'web') {
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
}

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { ready: storeReady, onboarded } = useApp();
  const [fontsLoaded] = useFonts({ IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold });
  const ready = fontsLoaded && storeReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="pitch/[id]" />
          <Stack.Screen name="match/[id]" />
          <Stack.Screen name="match/create" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="tournament/[id]" />
          <Stack.Screen name="player/[id]" />
          <Stack.Screen name="bookings" />
          <Stack.Screen name="leaderboard" />
          <Stack.Screen name="owner" />
          <Stack.Screen name="support/index" />
          <Stack.Screen name="support/new" />
          <Stack.Screen name="support/[id]" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <SupportProvider>
          <ToastProvider>
            <RootNavigator />
          </ToastProvider>
        </SupportProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
