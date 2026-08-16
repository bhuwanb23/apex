import { Tabs, useRouter } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type IconName } from '@/components/ui/icon';
import { useOnboarding } from '@/context/onboarding';

/** Map the stored default module to its tab route name. */
const TAB_ROUTE: Record<string, string> = {
  home: 'index',
  injury: 'injury',
  decisions: 'decisions',
  momentum: 'momentum',
};

function tabIcon(name: IconName) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <AppIcon name={name} size={22} color={color} />;
  };
}

/**
 * Tapping a tab must land on that tab's home screen, never on a pushed detail
 * screen. Each module tab hosts a Stack (e.g. injury → player/team/alerts), so
 * navigating deep (Home → Injury alerts) then tapping the tab would otherwise
 * re-show the stale pushed screen instead of the tab root.
 */
type TabPressListener = (event: { preventDefault: () => void }) => void;
function popToTabRoot(router: ReturnType<typeof useRouter>, href: `/injury` | `/decisions` | `/momentum`): TabPressListener {
  return event => {
    // Prevent the default "focus existing stack" behavior and navigate to the
    // tab's landing route instead — expo-router pops back to it if it's already
    // in the stack, otherwise opens it fresh.
    event.preventDefault();
    router.navigate(href);
  };
}

export default function TabLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { defaultModule } = useOnboarding();
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 12) : insets.bottom + 8;

  return (
    <Tabs
      initialRouteName={TAB_ROUTE[defaultModule] ?? 'index'}
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
        listeners={{ tabPress: popToTabRoot(router, '/injury') }}
      />
      <Tabs.Screen
        name="decisions"
        options={{ title: 'Decisions', tabBarIcon: tabIcon('checkmark.seal.fill') }}
        listeners={{ tabPress: popToTabRoot(router, '/decisions') }}
      />
      <Tabs.Screen
        name="momentum"
        options={{ title: 'Momentum', tabBarIcon: tabIcon('bolt.fill') }}
        listeners={{ tabPress: popToTabRoot(router, '/momentum') }}
      />
    </Tabs>
  );
}
