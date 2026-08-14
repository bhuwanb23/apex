import { Tabs } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type IconName } from '@/components/ui/icon';

function tabIcon(name: IconName) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <AppIcon name={name} size={22} color={color} />;
  };
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 12) : insets.bottom + 8;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#5856D6',
        tabBarInactiveTintColor: '#9AA0B5',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          position: 'absolute',
          marginHorizontal: 18,
          marginBottom: bottomInset,
          height: 62,
          borderRadius: 30,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          paddingTop: 6,
          shadowColor: '#5856D6',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
          elevation: 10,
        },
        tabBarItemStyle: { borderRadius: 22 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: tabIcon('house.fill') }}
      />
      <Tabs.Screen
        name="injury"
        options={{ title: 'Injury', tabBarIcon: tabIcon('heart.text.square.fill') }}
      />
      <Tabs.Screen
        name="decisions"
        options={{ title: 'Decisions', tabBarIcon: tabIcon('checkmark.seal.fill') }}
      />
      <Tabs.Screen
        name="momentum"
        options={{ title: 'Momentum', tabBarIcon: tabIcon('bolt.fill') }}
      />
    </Tabs>
  );
}
