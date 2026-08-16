import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useOnboarding } from '@/context/onboarding';
import { useBackend } from '@/context/backend';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { AppIcon } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/button';
import { GradientView } from '@/components/ui/gradient';
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { DataFreshness } from '@/components/ui/data-freshness';
import { SPORTS, SPORT_BY_ID, type SportId } from '@/data/mock/sports';
import { useMomentumAnalysis } from '@/data/live/momentum';
import { useRecentGames } from '@/data/live/games';

const PLAIN_EXPLANATION: Record<string, string> = {
  real: 'Momentum is real here — after a scoring run, that team is measurably more likely to score again. The numbers back it up.',
  inconclusive: 'The numbers hint at momentum, but the effect is too weak to call it real. Treat it as a story for now.',
  myth: 'Scoring runs do not actually change who scores next. In this sport, momentum is a story fans tell — not a real effect.',
};

export default function MomentumOverviewScreen() {
  const router = useRouter();
  const { sport: sportParam } = useLocalSearchParams<{ sport?: string }>();
  const { activeSport, role, storyLanguage } = useOnboarding();
  const { status } = useBackend();
  const [sport, setSport] = useState<SportId>((sportParam as SportId) ?? activeSport);
  const [statsOpen, setStatsOpen] = useState(role === 'analyst');
  const { data: verdictData, loading, error, refetch: refetchMomentum } = useMomentumAnalysis(sport);
  const verdict = verdictData as unknown as (typeof import('@/data/mock/sports').MOMENTUM_VERDICTS)[number];
  const isReal = verdict.verdict === 'real';
  const isAnalystDepth = role === 'analyst' || storyLanguage === 'technical';

  // Backend confirmed offline → skip skeletons, show fallback data immediately.
  const backendOffline = status === 'offline';
  const showSkeleton = loading && !backendOffline;
  const { refreshControl } = usePullRefresh(refetchMomentum);
  // Game replay opens on a real recent game (numeric backend id) so the
  // timeline loads; with no games yet it falls back to the replay picker.
  const recentGames = useRecentGames(sport, 5);
  const firstGame = recentGames.data[0];

  const stats = [
    { label: 'Hazard Coefficient', value: verdict.hazardCoefficient.toFixed(2), note: '> 1 means scoring increases opponent hazard' },
    { label: 'P-Value', value: verdict.pValue < 0.001 ? '< 0.001' : verdict.pValue.toFixed(3), note: isReal ? 'Statistically significant' : 'Not significant' },
    { label: 'Confidence Interval', value: `${verdict.ciLow.toFixed(2)} – ${verdict.ciHigh.toFixed(2)}`, note: '95% interval for the hazard ratio' },
    { label: 'Effect Size', value: verdict.effectSize.toFixed(2), note: 'Strength of the momentum effect' },
  ];

  return (
    <Screen refreshControl={refreshControl}>
      <StackHeader title="Momentum" subtitle="Is momentum real?" />

      {/* Sport selector */}
      <View style={styles.sportRow}>
        {SPORTS.map(s => (
          <Chip key={s.id} label={s.short} small selected={sport === s.id} onPress={() => setSport(s.id)} />
        ))}
      </View>

      {error != null && !backendOffline ? (
        <ErrorState message={`Could not load momentum analysis for ${sport}`} onRetry={refetchMomentum} />
      ) : showSkeleton ? (
        <>
          {/* Verdict banner skeleton */}
          <View style={[styles.verdictBanner, styles.verdictSkeleton]}>
            <Skeleton width={84} height={12} radius={6} />
            <Skeleton width={220} height={26} radius={8} />
            <Skeleton width={150} height={13} radius={6} />
          </View>
          <SkeletonCard lines={3} />
          <View>
            <Skeleton width={110} height={16} radius={6} />
            <View style={styles.statsGrid}>
              {[0, 1, 2, 3].map(i => (
                <Card key={i} style={styles.statCard}>
                  <Skeleton width="50%" height={18} radius={6} />
                  <Skeleton width="70%" height={11} radius={6} />
                  <Skeleton width="90%" height={10} radius={5} />
                </Card>
              ))}
            </View>
          </View>
        </>
      ) : (
        <>
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
            <Text style={styles.explainText}>
              {isAnalystDepth ? verdict.explanation : PLAIN_EXPLANATION[verdict.verdict]}
            </Text>
            <Text style={styles.explainDepth}>
              {isAnalystDepth
                ? 'Full statistical depth shown — switch to Simple in Settings for a plainer read.'
                : 'Simplified for your role — switch to Technical in Settings for the full numbers.'}
            </Text>
          </Card>

          {/* Statistics (collapsible for non-analysts) */}
          <View>
            <Pressable style={styles.collapseHeader} onPress={() => setStatsOpen(prev => !prev)}>
              <Text style={styles.sectionTitle}>The Numbers</Text>
              <AppIcon name={statsOpen ? 'chevron.down' : 'chevron.right'} size={16} color="#6E7280" />
            </Pressable>
            {statsOpen ? (
              <View style={styles.statsGrid}>
                {stats.map(stat => (
                  <Card key={stat.label} style={styles.statCard}>
                    <Text style={styles.statValue}>{stat.value}</Text>
                    <Text style={styles.statLabel}>{stat.label}</Text>
                    <Text style={styles.statNote}>{stat.note}</Text>
                  </Card>
                ))}
              </View>
            ) : null}
            <Text style={styles.gamesContext}>
              Based on analysis of {verdict.gamesAnalyzed.toLocaleString()} games from the {verdict.season} {verdict.sport} season
            </Text>
            {/* Data freshness — the plan's tiers (note for 1-6h, banner for 6h+) */}
            {verdictData.computedAt ? <DataFreshness timestamp={verdictData.computedAt} onRefresh={refetchMomentum} /> : null}
          </View>
        </>
      )}

      {/* Quick access */}
      <View>
        <Text style={styles.sectionTitle}>Dive deeper</Text>
        <View style={styles.quickGrid}>
          <QuickLink
            icon="play.fill"
            label="Game replay"
            color="#5856D6"
            onPress={() =>
              router.push(
                firstGame
                  ? { pathname: '/momentum/replay', params: { gameId: firstGame.id } }
                  : '/momentum/replay'
              )
            }
          />
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
  verdictSkeleton: {
    backgroundColor: '#E8E9F0',
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
  explainDepth: {
    fontSize: 11.5,
    color: '#9AA0B5',
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
  },
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
