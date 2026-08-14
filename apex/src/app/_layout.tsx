import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AqxSplashOverlay } from '@/components/aqx-splash';
import { BackendProvider } from '@/context/backend';
import { OnboardingProvider, useOnboarding } from '@/context/onboarding';

SplashScreen.preventAutoHideAsync();

/** Navigation theme locked to the light AQX design (matches the reference). */
const AqxTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#5856D6',
    background: '#F0F1F5',
    card: '#FFFFFF',
    text: '#14121F',
    border: '#E4E5EC',
    notification: '#E5484D',
  },
};

function RootNavigator() {
  const { hasOnboarded } = useOnboarding();

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0F1F5' } }}>
      {hasOnboarded ? <Stack.Screen name="(tabs)" /> : <Stack.Screen name="onboarding" />}
      <Stack.Screen name="search" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      <Stack.Screen name="story" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={AqxTheme}>
      <BackendProvider>
        <OnboardingProvider>
          <StatusBar style="dark" />
          <AqxSplashOverlay />
          <RootNavigator />
        </OnboardingProvider>
      </BackendProvider>
    </ThemeProvider>
  );
}
