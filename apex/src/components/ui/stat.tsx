import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { AppIcon, type IconName } from '@/components/ui/icon';

interface StatTileProps {
  icon: IconName;
  value: string;
  label: string;
  accent?: string;
}

/** Small stat tile for quick-stats rows and stat grids. */
export function StatTile({ icon, value, label, accent = '#5856D6' }: StatTileProps) {
  return (
    <Card style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: `${accent}1A` }]}>
        <AppIcon name={icon} size={17} color={accent} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 132,
    padding: 14,
    gap: 4,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  value: {
    fontSize: 20,
    fontWeight: '800',
    color: '#14121F',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6E7280',
    lineHeight: 16,
  },
});
