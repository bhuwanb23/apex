import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface LoadingViewProps {
  /** Small caption under the spinner (e.g. \"Loading risk scores…\"). */
  label?: string;
  /** Render inline (no vertical padding) — for sections inside a list. */
  inline?: boolean;
  /** Spinner color. Defaults to the app's primary indigo. */
  color?: string;
}

/** Centered spinner — the baseline loading state for any fetching screen. */
export function LoadingView({ label, inline = false, color = '#5856D6' }: LoadingViewProps) {
  return (
    <View style={[styles.wrap, inline && styles.inline]}>
      <ActivityIndicator size="large" color={color} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

/** Compact spinner row (e.g. inside the timeout optimizer button). */
export function LoadingRow({ label, color = '#5856D6' }: { label?: string; color?: string }) {
  return (
    <View style={styles.row}>
      <ActivityIndicator size="small" color={color} />
      {label ? <Text style={styles.rowLabel}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  inline: {
    paddingVertical: 16,
  },
  label: {
    fontSize: 13,
    color: '#6E7280',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  rowLabel: {
    fontSize: 12.5,
    color: '#6E7280',
    fontWeight: '600',
  },
});
