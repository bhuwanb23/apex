import { StyleSheet, Text, View } from 'react-native';

import { ZoneColors } from '@/constants/theme';
import { formatRiskScore } from '@/lib/format';
import type { Zone } from '@/components/ui/badge';

interface RiskCircleProps {
  score: number | null;
  zone: Zone;
  size?: number;
}

/**
 * Risk score ring: colored arc whose sweep matches the score (0-100), with the
 * number in the center. Built from Views so it runs anywhere.
 */
export function RiskCircle({ score, zone, size = 120 }: RiskCircleProps) {
  const ringWidth = 12;
  const inner = size - ringWidth * 2;
  const color = ZoneColors[zone].color;
  const pct = Math.max(0, Math.min(100, score ?? 0));

  return (
    <View style={{ width: size, height: size }}>
      {/* Track */}
      <View style={[styles.ring, { width: size, height: size, borderColor: `${color}30` }]} />
      {/* Value arc — rotated so the sweep starts at 12 o'clock */}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderColor: color,
            borderTopColor: 'transparent',
            borderRightColor: zone === 'insufficient_data' ? `${color}30` : color,
            transform: [{ rotate: `${-90 + pct * 3.6}deg` }],
          },
        ]}
      />
      <View
        style={[
          styles.inner,
          {
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            left: ringWidth,
            top: ringWidth,
            backgroundColor: `${color}12`,
          },
        ]}>
        <Text style={[styles.score, { color: zone === 'insufficient_data' ? '#9AA0B5' : color }]}>
          {formatRiskScore(score)}
        </Text>
        <Text style={styles.caption}>RISK</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 12,
  },
  inner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontSize: 34,
    fontWeight: '800',
  },
  caption: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#6E7280',
    marginTop: -2,
  },
});
