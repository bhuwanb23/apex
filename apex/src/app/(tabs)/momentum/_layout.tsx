import { Stack } from 'expo-router';

export default function MomentumStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0F1F5' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="replay" />
      <Stack.Screen name="comparison" />
      <Stack.Screen name="timeout" />
    </Stack>
  );
}
