import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GradientView } from '@/components/ui/gradient';
import { AppIcon } from '@/components/ui/icon';
import type { Sport } from '@/data/mock/sports';

interface SportCardProps {
  sport: Sport;
  selected: boolean;
  onPress: () => void;
}

/** Selectable sport card — purple border + check when selected. */
export function SportCard({ sport, selected, onPress }: SportCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && { opacity: 0.85 },
      ]}>
      <View style={styles.topRow}>
        <GradientView colors={sport.gradient} style={styles.logo}>
          <Text style={styles.logoText}>{sport.short.slice(0, 1)}</Text>
        </GradientView>
        {selected ? (
          <View style={styles.check}>
            <AppIcon name="checkmark" size={12} color="#FFFFFF" weight="bold" />
          </View>
        ) : null}
      </View>
      <Text style={styles.name}>{sport.name}</Text>
      <Text style={styles.hook}>{sport.hook}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#9AA0B5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardSelected: {
    borderColor: '#5856D6',
    backgroundColor: '#FBFAFF',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#5856D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
    marginTop: 4,
  },
  hook: {
    fontSize: 12,
    color: '#6E7280',
    lineHeight: 16,
  },
});
