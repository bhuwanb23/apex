import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0F1F5' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="sport-select" />
      <Stack.Screen name="role-select" />
    </Stack>
  );
}
