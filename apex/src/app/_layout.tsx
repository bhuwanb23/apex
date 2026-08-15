import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AqxSplashOverlay } from '@/components/aqx-splash';
import { BackendProvider } from '@/context/backend';
import { AuthProvider, useAuth } from '@/context/auth';
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

/**
 * Auth + onboarding gating (the plan's "auth before onboarding" flow):
 *
 *   not signed in  → auth stack (mock login)
 *   signed in, not onboarded → onboarding stack (shown once, on first launch)
 *   signed in, onboarded     → the app tabs
 *
 * Both providers hydrate from device storage before we decide which stack to
 * mount — previously the gate read `hasOnboarded` before hydration finished,
 * so a fresh install could render the wrong stack. Waiting on hydration makes
 * the first-run onboarding deterministic ("shows once to a fresh user").
 */
function RootNavigator() {
  const { isAuthenticated, hydrated: authHydrated } = useAuth();
  const { hasOnboarded, hydrated: onboardingHydrated } = useOnboarding();

  // Storage not yet read — keep the splash up (AqxSplashOverlay is on top).
  if (!authHydrated || !onboardingHydrated) return null;

  // The search/settings/story modals are only reachable from inside the app,
  // so they're registered alongside the tabs — never for login/onboarding.
  const inApp = isAuthenticated && hasOnboarded;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0F1F5' } }}>
      <Stack.Screen name={inApp ? '(tabs)' : isAuthenticated ? 'onboarding' : 'auth'} />
      {inApp ? (
        <>
          <Stack.Screen name="search" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="story" options={{ presentation: 'modal' }} />
        </>
      ) : null}
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={AqxTheme}>
      <BackendProvider>
        <AuthProvider>
          <OnboardingProvider>
            <StatusBar style="dark" />
            <AqxSplashOverlay />
            <RootNavigator />
          </OnboardingProvider>
        </AuthProvider>
      </BackendProvider>
    </ThemeProvider>
  );
}
