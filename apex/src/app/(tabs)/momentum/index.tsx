import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useOnboarding } from '@/context/onboarding';
import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { AppIcon } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/button';
import { GradientView } from '@/components/ui/gradient';
import { SPORTS, MOMENTUM_VERDICTS, SPORT_BY_ID, type SportId } from '@/data/mock/sports';

export default function MomentumOverviewScreen() {
  const router = useRouter();
  const { sport: sportParam } = useLocalSearchParams<{ sport?: string }>();
  const { activeSport } = useOnboarding();
  const [sport, setSport] = useState<SportId>((sportParam as SportId) ?? activeSport);
  const verdict = MOMENTUM_VERDICTS.find(v => v.sport === sport)!;
  const isReal = verdict.verdict === 'real';

  const stats = [
    { label: 'Hazard Coefficient', value: verdict.hazardCoefficient.toFixed(2), note: '> 1 means scoring increases opponent hazard' },
    { label: 'P-Value', value: verdict.pValue < 0.001 ? '< 0.001' : verdict.pValue.toFixed(3), note: isReal ? 'Statistically significant' : 'Not significant' },
    { label: 'Confidence Interval', value: `${verdict.ciLow.toFixed(2)} – ${verdict.ciHigh.toFixed(2)}`, note: '95% interval for the hazard ratio' },
    { label: 'Effect Size', value: verdict.effectSize.toFixed(2), note: 'Strength of the momentum effect' },
  ];

  return (
    <Screen>
      <StackHeader title="Momentum" subtitle="Is momentum real?" />

      {/* Sport selector */}
      <View style={styles.sportRow}>
        {SPORTS.map(s => (
          <Chip key={s.id} label={s.short} small selected={sport === s.id} onPress={() => setSport(s.id)} />
        ))}
      </View>

      {/* Verdict banner */}
      <GradientView
        colors={isReal ? ['#2FA36B', '#4CC38A'] : verdict.verdict === 'inconclusive' ? ['#F5A623', '#FFB86C'] : ['#8A8FA3', '#B0B5C6']}
        style={styles.verdictBanner}>
        <Text style={styles.verdictSport}>{SPORT_BY_ID[sport].name}</Text>
        <Text style={styles.verdictText}>
          {isReal ? 'Momentum is Real' : verdict.verdict === 'inconclusive' ? 'Momentum is Inconclusive' : 'Momentum is a Myth'}
        </Text>
        <Text style={styles.verdictMeta}>
          p = {verdict.pValue < 0.001 ? '< 0.001' : verdict.pValue.toFixed(3)} · {Math.round(verdict.effectSize * 100)}% effect size
        </Text>
      </GradientView>

      {/* Explanation */}
      <Card style={styles.explainCard}>
        <View style={styles.explainHeader}>
          <AppIcon name="sparkles" size={15} color="#5856D6" />
          <Text style={styles.explainTitle}>In plain English</Text>
        </View>
        <Text style={styles.explainText}>{verdict.explanation}</Text>
      </Card>

      {/* Statistics */}
      <View>
        <Text style={styles.sectionTitle}>The Numbers</Text>
        <View style={styles.statsGrid}>
          {stats.map(stat => (
            <Card key={stat.label} style={styles.statCard}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statNote}>{stat.note}</Text>
            </Card>
          ))}
        </View>
        <Text style={styles.gamesContext}>
          Based on analysis of {verdict.gamesAnalyzed.toLocaleString()} games from the {verdict.season} {verdict.sport} season
        </Text>
      </View>

      {/* Quick access */}
      <View>
        <Text style={styles.sectionTitle}>Dive deeper</Text>
        <View style={styles.quickGrid}>
          <QuickLink icon="play.fill" label="Game replay" color="#5856D6" onPress={() => router.push('/momentum/replay')} />
          <QuickLink icon="chart.bar.fill" label="Compare sports" color="#FF5C8A" onPress={() => router.push('/momentum/comparison')} />
          <QuickLink icon="timer" label="Timeout optimizer" color="#FFA058" onPress={() => router.push('/momentum/timeout')} />
        </View>
      </View>

      <PillButton
        label="Explain this to me simply"
        variant="outline"
        onPress={() => router.push({ pathname: '/story', params: { module: 'momentum', sport } })}
        icon={<AppIcon name="wand.and.stars" size={16} color="#5856D6" />}
      />
    </Screen>
  );
}

function QuickLink({ icon, label, color, onPress }: { icon: 'play.fill' | 'chart.bar.fill' | 'timer'; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.8 }]}>
      <View style={[styles.quickIcon, { backgroundColor: `${color}18` }]}>
        <AppIcon name={icon} size={18} color={color} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
      <AppIcon name="chevron.right" size={14} color="#9AA0B5" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sportRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  verdictBanner: {
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    gap: 6,
  },
  verdictSport: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  verdictText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
  },
  verdictMeta: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
  explainCard: {
    gap: 8,
    backgroundColor: '#EFEEFB',
  },
  explainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  explainTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5856D6',
  },
  explainText: {
    fontSize: 14,
    color: '#3A3852',
    lineHeight: 21,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  statCard: {
    width: '48%',
    padding: 14,
    gap: 3,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#14121F',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5856D6',
  },
  statNote: {
    fontSize: 11,
    color: '#9AA0B5',
    lineHeight: 15,
  },
  gamesContext: {
    fontSize: 11.5,
    color: '#9AA0B5',
    marginTop: 10,
    textAlign: 'center',
  },
  quickGrid: {
    gap: 10,
  },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
  },
  quickIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
    color: '#14121F',
  },
});
