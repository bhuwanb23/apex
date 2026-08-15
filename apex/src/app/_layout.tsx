import { DefaultTheme, Redirect, Stack, ThemeProvider, useSegments } from 'expo-router';
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
  const segments = useSegments();
  const top = segments[0];

  // Storage not yet read — keep the splash up (AqxSplashOverlay is on top).
  if (!authHydrated || !onboardingHydrated) return null;

  // URL-aware gate. On web the URL drives routing — setting Stack.Screen name
  // alone never changed it, so a fresh install landed straight on the Home
  // tabs. Redirecting to the right stack (and only when we're not already
  // there) fixes the "shows once on first launch" flow on every platform.
  if (!isAuthenticated && top !== 'auth') return <Redirect href="/auth" />;
  if (isAuthenticated && !hasOnboarded && top !== 'onboarding') return <Redirect href="/onboarding" />;
  if (isAuthenticated && hasOnboarded && (top === 'auth' || top === 'onboarding')) return <Redirect href="/" />;

  // The search/settings/story modals are only reachable from inside the app,
  // so they're registered alongside the tabs — never for login/onboarding.
  const inApp = isAuthenticated && hasOnboarded;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0F1F5' } }}>
      <Stack.Screen name={inApp ? '(tabs)' : isAuthenticated ? 'onboarding' : 'auth'} />
      {inApp
        ? [
            // Flat array (NOT a Fragment): expo-router's mapProtectedScreen runs
            // Children.toArray over Stack children — a Fragment is not flattened
            // and hits its "unknown child" branch, which template-literals the
            // child type and crashes on a Symbol ("Cannot convert a Symbol
            // value to a string") — a blank screen for every signed-in user on
            // web. An array of Stack.Screen elements is flattened correctly.
            <Stack.Screen key="search" name="search" options={{ presentation: 'modal' }} />,
            <Stack.Screen key="settings" name="settings" options={{ presentation: 'modal' }} />,
            <Stack.Screen key="story" name="story" options={{ presentation: 'modal' }} />,
          ]
        : null}
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
