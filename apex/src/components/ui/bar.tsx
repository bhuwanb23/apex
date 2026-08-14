import { StyleSheet, Text, View } from 'react-native';

import { Radius } from '@/constants/theme';

interface MetricBarProps {
  label: string;
  value: number;
  max: number;
  color?: string;
  /** Baseline value to draw as a small gray tick. */
  baseline?: number;
  formatValue?: (v: number) => string;
}

/** Single horizontal metric bar with optional baseline tick (baseline vs recent). */
export function MetricBar({
  label,
  value,
  max,
  color = '#5856D6',
  baseline,
  formatValue = v => String(v),
}: MetricBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const baselinePct = baseline != null ? Math.max(0, Math.min(100, (baseline / max) * 100)) : null;

  return (
    <View style={styles.metricRow}>
      <View style={styles.metricLabelRow}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{formatValue(value)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
        {baselinePct != null ? <View style={[styles.baselineTick, { left: `${baselinePct}%` }]} /> : null}
      </View>
      {baseline != null ? (
        <Text style={styles.baselineLabel}>baseline {formatValue(baseline)}</Text>
      ) : null}
    </View>
  );
}

interface DistributionBarProps {
  segments: { color: string; value: number; label: string }[];
}

/** Stacked distribution bar (e.g. red/yellow/green counts). */
export function DistributionBar({ segments }: DistributionBarProps) {
  const total = Math.max(1, segments.reduce((sum, s) => sum + s.value, 0));
  return (
    <View style={styles.distRow}>
      {segments.map(s => (
        <View
          key={s.label}
          style={{
            flex: Math.max(s.value, 0.001),
            height: 12,
            backgroundColor: s.color,
            opacity: s.value === 0 ? 0.25 : 1,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    gap: 6,
  },
  metricLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#14121F',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5856D6',
  },
  track: {
    height: 10,
    borderRadius: Radius.full,
    backgroundColor: '#F0F1F5',
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  baselineTick: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2.5,
    borderRadius: 2,
    backgroundColor: '#9AA0B5',
  },
  baselineLabel: {
    fontSize: 11,
    color: '#9AA0B5',
    fontWeight: '500',
  },
  distRow: {
    flexDirection: 'row',
    borderRadius: Radius.full,
    overflow: 'hidden',
    height: 12,
    backgroundColor: '#EFEFF4',
  },
});
