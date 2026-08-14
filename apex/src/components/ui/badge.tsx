import { StyleSheet, Text, View } from 'react-native';

import { Radius } from '@/constants/theme';

export type Zone = 'red' | 'yellow' | 'green' | 'insufficient_data';

const ZONE_STYLE: Record<Zone, { bg: string; fg: string; label: string }> = {
  red: { bg: '#FDEBEC', fg: '#E5484D', label: 'HIGH RISK' },
  yellow: { bg: '#FFF4DF', fg: '#B7791F', label: 'ELEVATED' },
  green: { bg: '#E3F6EC', fg: '#1F8A52', label: 'NORMAL' },
  insufficient_data: { bg: '#EFEFF4', fg: '#6E7280', label: 'NO DATA' },
};

/** Colored pill badge for risk zones. */
export function ZoneBadge({ zone, label }: { zone: Zone; label?: string }) {
  const s = ZONE_STYLE[zone];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <View style={[styles.dot, { backgroundColor: s.fg }]} />
      <Text style={[styles.text, { color: s.fg }]}>{label ?? s.label}</Text>
    </View>
  );
}

type Verdict = 'real' | 'myth' | 'inconclusive';

const VERDICT_STYLE: Record<Verdict, { bg: string; fg: string; label: string }> = {
  real: { bg: '#E3F6EC', fg: '#1F8A52', label: 'Momentum is Real' },
  myth: { bg: '#EFEFF4', fg: '#6E7280', label: 'Momentum is a Myth' },
  inconclusive: { bg: '#FFF4DF', fg: '#B7791F', label: 'Inconclusive' },
};

/** Verdict pill for the momentum module. */
export function VerdictBadge({ verdict, label }: { verdict: Verdict; label?: string }) {
  const s = VERDICT_STYLE[verdict];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <View style={[styles.dot, { backgroundColor: s.fg }]} />
      <Text style={[styles.text, { color: s.fg }]}>{label ?? s.label}</Text>
    </View>
  );
}

/** Green/red pill for decision quality. */
export function QualityBadge({ optimal }: { optimal: boolean }) {
  return (
    <View style={[styles.badge, { backgroundColor: optimal ? '#E3F6EC' : '#FDEBEC' }]}>
      <View style={[styles.dot, { backgroundColor: optimal ? '#1F8A52' : '#E5484D' }]} />
      <Text style={[styles.text, { color: optimal ? '#1F8A52' : '#E5484D' }]}>
        {optimal ? 'OPTIMAL' : 'SUBOPTIMAL'}
      </Text>
    </View>
  );
}

/** Small neutral chip for decision types / trigger metrics. */
export function TypeChip({ label, color = '#5856D6' }: { label: string; color?: string }) {
  return (
    <View style={[styles.typeChip, { backgroundColor: `${color}18` }]}>
      <Text style={[styles.typeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
