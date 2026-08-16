import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApexOrb } from '@/components/apex-logo';
import { AppIcon } from '@/components/ui/icon';
import { Chip } from '@/components/ui/chip';
import { SPORTS, type SportId } from '@/data/mock/sports';

interface AppHeaderProps {
  title: string;
  activeSport: SportId;
  onSelectSport: (sport: SportId) => void;
  /** Extra right-side actions (e.g. refresh), shown before search/settings. */
  right?: React.ReactNode;
}

/**
 * Shared header for the three module landing pages (Injury / Decisions /
 * Momentum): the Apex logo + page title on the left, search + settings on the
 * right (no notification bell), and the four-sport selector as its own row
 * below. Mirrors the Home top bar so every main screen feels like one app.
 */
export function AppHeader({ title, activeSport, onSelectSport, right }: AppHeaderProps) {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.brand}>
          <ApexOrb size={34} />
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.actions}>
          {right}
          <Pressable
            style={styles.iconButton}
            onPress={() => router.push('/search')}
            accessibilityRole="button"
            accessibilityLabel="Search">
            <AppIcon name="magnifyingglass" size={20} color="#14121F" />
          </Pressable>
          <Pressable
            style={styles.iconButton}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings">
            <AppIcon name="gearshape.fill" size={20} color="#14121F" />
          </Pressable>
        </View>
      </View>
      <View style={styles.sportRow}>
        {SPORTS.map(s => (
          <Chip key={s.id} label={s.short} small selected={activeSport === s.id} onPress={() => onSelectSport(s.id)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#14121F',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
});
