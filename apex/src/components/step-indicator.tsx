import { StyleSheet, Text, View } from 'react-native';

interface StepIndicatorProps {
  step: number;
  total: number;
}

/** Segmented progress bar + "Step X of Y" label for the onboarding flow. */
export function StepIndicator({ step, total }: StepIndicatorProps) {
  return (
    <View style={styles.row}>
      <View style={styles.bar}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.segment, i < step && styles.segmentActive]} />
        ))}
      </View>
      <Text style={styles.label}>
        Step {step} of {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bar: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E1E8',
  },
  segmentActive: {
    backgroundColor: '#5856D6',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6E7280',
  },
});
