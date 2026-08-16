import { Tabs, useRouter } from 'expo-router';
import { Platform, StyleSheet, type ColorValue } from 'react-native';

import { AppIcon, type IconName } from '@/components/ui/icon';
import { useOnboarding } from '@/context/onboarding';

/** Map the stored default module to its tab route name. */
const TAB_ROUTE: Record<string, string> = {
  home: 'index',
  injury: 'injury',
  decisions: 'decisions',
  momentum: 'momentum',
};

const ACTIVE_TINT = '#5856D6';
const INACTIVE_TINT = '#9AA0B5';

/**
 * Instagram-style tab icon: an outline glyph when inactive, a filled glyph when
 * active. iOS uses real SF Symbol pairs (house / house.fill); on Android and
 * web the filled name renders at a heavier weight for a clear active state.
 */
function tabIcon(active: IconName, inactive: IconName) {
  return function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return (
      <AppIcon
        name={focused ? active : inactive}
        size={23}
        color={color}
        weight={focused ? 'semibold' : 'regular'}
      />
    );
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
  const { defaultModule } = useOnboarding();
  // Flat bar in normal flow: the navigator adds the bottom safe-area inset as
  // padding below the fixed height, so content never scrolls under the bar.
  const barHeight = Platform.OS === 'ios' ? 50 : 56;

  return (
    <Tabs
      initialRouteName={TAB_ROUTE[defaultModule] ?? 'index'}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_TINT,
        tabBarInactiveTintColor: INACTIVE_TINT,
        tabBarLabelStyle: styles.label,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: '#E7E8EF',
          height: barHeight,
          paddingTop: 5,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: tabIcon('house.fill', 'house') }}
      />
      <Tabs.Screen
        name="injury"
        options={{ title: 'Injury', tabBarIcon: tabIcon('heart.fill', 'heart') }}
        listeners={{ tabPress: popToTabRoot(router, '/injury') }}
      />
      <Tabs.Screen
        name="decisions"
        options={{ title: 'Decisions', tabBarIcon: tabIcon('checkmark.circle.fill', 'checkmark.circle') }}
        listeners={{ tabPress: popToTabRoot(router, '/decisions') }}
      />
      <Tabs.Screen
        name="momentum"
        options={{ title: 'Momentum', tabBarIcon: tabIcon('bolt.fill', 'bolt') }}
        listeners={{ tabPress: popToTabRoot(router, '/momentum') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
