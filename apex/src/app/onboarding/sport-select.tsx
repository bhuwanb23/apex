import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SportCard } from '@/components/sport-card';
import { StackHeader } from '@/components/stack-header';
import { StepIndicator } from '@/components/step-indicator';
import { PillButton } from '@/components/ui/button';
import { SPORTS, type SportId } from '@/data/mock/sports';

export default function SportSelectScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<SportId[]>([]);

  const toggle = (id: SportId) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]));
  };

  const continueLabel =
    selected.length === 0 ? 'Continue' : selected.length === 1 ? 'Continue' : `Continue · ${selected.length} selected`;

  return (
    <View style={styles.container}>
      <StackHeader title="" onBack={() => router.back()} />
      <StepIndicator step={1} total={2} />

      <View style={styles.header}>
        <Text style={styles.title}>Which sport do you follow?</Text>
        <Text style={styles.subtitle}>You can change this anytime in settings</Text>
      </View>

      <View style={styles.grid}>
        {SPORTS.map(sport => (
          <SportCard
            key={sport.id}
            sport={sport}
            selected={selected.includes(sport.id)}
            onPress={() => toggle(sport.id)}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <PillButton
          label={continueLabel}
          size="lg"
          disabled={selected.length === 0}
          onPress={() =>
            router.push({
              pathname: '/onboarding/role-select',
              params: { sports: selected.join(',') },
            })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F1F5',
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#14121F',
  },
  subtitle: {
    fontSize: 14,
    color: '#6E7280',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  footer: {
    paddingVertical: 16,
  },
});
