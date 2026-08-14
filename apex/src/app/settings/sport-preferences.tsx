import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SportCard } from '@/components/sport-card';
import { StackHeader } from '@/components/stack-header';
import { PillButton } from '@/components/ui/button';
import { SPORTS, type SportId } from '@/data/mock/sports';
import { useOnboarding } from '@/context/onboarding';

export default function SportPreferencesScreen() {
  const router = useRouter();
  const { sports, setSports } = useOnboarding();
  const [selected, setSelected] = useState<SportId[]>(sports);

  const toggle = (id: SportId) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]));
  };

  const save = () => {
    setSports(selected);
    router.back();
  };

  return (
    <View style={styles.container}>
      <StackHeader title="Sport Preferences" onBack={() => router.back()} />
      <Text style={styles.subtitle}>Choose which sports are active — this updates your dashboard everywhere.</Text>

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

      <PillButton label="Save changes" size="lg" disabled={selected.length === 0} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F1F5',
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
    paddingBottom: 40,
  },
  subtitle: {
    fontSize: 13.5,
    color: '#6E7280',
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
});
