import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0F1F5' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="sport-preferences" />
      <Stack.Screen name="role-preferences" />
    </Stack>
  );
}
