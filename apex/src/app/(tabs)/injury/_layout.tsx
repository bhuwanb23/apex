import { Stack } from 'expo-router';

export default function InjuryStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0F1F5' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="player" />
      <Stack.Screen name="team" />
      <Stack.Screen name="alerts" />
    </Stack>
  );
}
