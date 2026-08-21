import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RoleCard } from '@/components/role-card';
import { StackHeader } from '@/components/stack-header';
import { StepIndicator } from '@/components/step-indicator';
import { PillButton } from '@/components/ui/button';
import { useOnboarding, type RoleId } from '@/context/onboarding';
import type { IconName } from '@/components/ui/icon';
import type { SportId } from '@/data/mock/sports';

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

export default function RoleSelectScreen() {
  const router = useRouter();
  const { sports: sportsParam } = useLocalSearchParams<{ sports?: string }>();
  const { completeOnboarding } = useOnboarding();
  const [role, setRole] = useState<RoleId | null>(null);

  const sportIds = (sportsParam ?? 'NBA,NFL,MLB,NHL').split(',') as SportId[];
  const roleLabel = ROLE_OPTIONS.find(r => r.id === role)?.title;

  const finish = () => {
    if (!role) return;
    completeOnboarding(sportIds, role);
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <StackHeader title="" onBack={() => router.back()} />
      <StepIndicator step={2} total={2} />

      <View style={styles.header}>
        <Text style={styles.title}>How will you use Apex?</Text>
        <Text style={styles.subtitle}>This personalizes your dashboard</Text>
      </View>

      <View style={styles.list}>
        {ROLE_OPTIONS.map(option => (
          <RoleCard
            key={option.id}
            icon={option.icon}
            title={option.title}
            description={option.description}
            highlight={option.highlight}
            selected={role === option.id}
            onPress={() => setRole(option.id)}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <PillButton
          label={role ? `Continue as ${roleLabel}` : 'Continue'}
          size="lg"
          disabled={!role}
          onPress={finish}
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
  list: {
    gap: 12,
  },
  footer: {
    paddingVertical: 16,
  },
});
