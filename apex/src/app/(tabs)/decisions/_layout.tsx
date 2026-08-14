import { Stack } from 'expo-router';

export default function DecisionsStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0F1F5' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="coach" />
      <Stack.Screen name="decision" />
      <Stack.Screen name="game" />
    </Stack>
  );
}
