import { DefaultTheme, Redirect, Stack, ThemeProvider, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { ApexSplashOverlay } from '@/components/apex-splash';
import { BackendProvider } from '@/context/backend';
import { AuthProvider, useAuth } from '@/context/auth';
import { OnboardingProvider, useOnboarding } from '@/context/onboarding';

SplashScreen.preventAutoHideAsync();

/** Navigation theme locked to the light Apex design (matches the reference). */
const ApexTheme = {
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
 * Auth gating. The onboarding flow is currently unreachable: real auth (and
 * "new account → onboarding") isn't implemented yet, so after the mock login
 * the user lands straight on the app tabs with the default preferences.
 *
 *   not signed in → auth stack (mock login)
 *   signed in     → the app tabs
 *
 * Both providers hydrate from device storage before we decide which stack to
 * mount, so a fresh install renders the right stack deterministically.
 */
function RootNavigator() {
  const { isAuthenticated, hydrated: authHydrated } = useAuth();
  const { hydrated: onboardingHydrated } = useOnboarding();
  const segments = useSegments();
  const top = segments[0];

  // Storage not yet read — keep the splash up (ApexSplashOverlay is on top).
  if (!authHydrated || !onboardingHydrated) return null;

  // URL-aware gate. On web the URL drives routing — redirect to the auth stack
  // when signed out, back to the app when signed in.
  if (!isAuthenticated && top !== 'auth') return <Redirect href="/auth" />;
  if (isAuthenticated && top === 'auth') return <Redirect href="/" />;

  // The search/settings/story modals are only reachable from inside the app,
  // so they're registered alongside the tabs — never for login.
  const inApp = isAuthenticated;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0F1F5' } }}>
      <Stack.Screen name={inApp ? '(tabs)' : 'auth'} />
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
            // Story renders as a bottom sheet over the app: transparentModal keeps
            // the screen behind it mounted and visible, so Home shows through the
            // dim overlay instead of being replaced by an opaque card (the plan:
            // "story mode overlaps the current screen, which is disabled behind it").
            <Stack.Screen key="story" name="story" options={{ presentation: 'transparentModal' }} />,
          ]
        : null}
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={ApexTheme}>
      <BackendProvider>
        <AuthProvider>
          <OnboardingProvider>
            <StatusBar style="dark" />
            <ApexSplashOverlay />
            <RootNavigator />
          </OnboardingProvider>
        </AuthProvider>
      </BackendProvider>
    </ThemeProvider>
  );
}
