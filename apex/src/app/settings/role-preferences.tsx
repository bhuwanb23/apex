import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RoleCard } from '@/components/role-card';
import { StackHeader } from '@/components/stack-header';
import { PillButton } from '@/components/ui/button';
import { useOnboarding, type RoleId } from '@/context/onboarding';
import type { IconName } from '@/components/ui/icon';

const ROLE_OPTIONS: { id: RoleId; icon: IconName; title: string; description: string; highlight: string }[] = [
  {
    id: 'trainer',
    icon: 'cross.case.fill',
    title: 'Athletic Trainer',
    description: 'Monitor player workload and injury risk',
    highlight: 'Injury module',
  },
  {
    id: 'coach',
    icon: 'flag.checkered',
    title: 'Coach',
    description: 'Analyze decisions and momentum',
    highlight: 'Decisions & Momentum',
  },
  {
    id: 'analyst',
    icon: 'chart.bar.fill',
    title: 'Front Office Analyst',
    description: 'Full access to all analytics',
    highlight: 'All three modules',
  },
  {
    id: 'fan',
    icon: 'newspaper.fill',
    title: 'Fan / Journalist',
    description: 'Plain English explanations, no jargon',
    highlight: 'Simplified views',
  },
];

export default function RolePreferencesScreen() {
  const router = useRouter();
  const { role, setRole } = useOnboarding();
  const [selected, setSelected] = useState<RoleId>(role ?? 'analyst');

  const save = () => {
    setRole(selected);
    router.back();
  };

  return (
    <View style={styles.container}>
      <StackHeader title="Role Preferences" onBack={() => router.back()} />
      <Text style={styles.subtitle}>Your role changes what the app emphasizes. The app reconfigures on save.</Text>

      <View style={styles.list}>
        {ROLE_OPTIONS.map(option => (
          <RoleCard
            key={option.id}
            icon={option.icon}
            title={option.title}
            description={option.description}
            highlight={option.highlight}
            selected={selected === option.id}
            onPress={() => setSelected(option.id)}
          />
        ))}
      </View>

      <PillButton label="Save changes" size="lg" onPress={save} />
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
  list: {
    gap: 12,
  },
});
