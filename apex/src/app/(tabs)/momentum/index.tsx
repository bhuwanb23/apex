import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useOnboarding } from '@/context/onboarding';
import { useBackend } from '@/context/backend';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { AppHeader } from '@/components/app-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { AppIcon, type IconName } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/button';
import { GradientView } from '@/components/ui/gradient';
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { DataFreshness } from '@/components/ui/data-freshness';
import { SPORT_BY_ID, type SportId } from '@/data/mock/sports';
import { useMomentumAnalysis, type VerdictLabel } from '@/data/live/momentum';
import { useRecentGames } from '@/data/live/games';

const PLAIN_EXPLANATION: Record<string, string> = {
  real: 'Momentum is real here — after a scoring run, that team is measurably more likely to score again. The numbers back it up.',
  inconclusive: 'The numbers hint at momentum, but the effect is too weak to call it real. Treat it as a story for now.',
  myth: 'Scoring runs do not actually change who scores next. In this sport, momentum is a story fans tell — not a real effect.',
};

const VERDICT_UI: Record<VerdictLabel, { title: string; icon: IconName; accent: string }> = {
  real: { title: 'Momentum is Real', icon: 'checkmark', accent: '#1F8A52' },
  inconclusive: { title: 'Momentum is Inconclusive', icon: 'questionmark.circle', accent: '#B7791F' },
  myth: { title: 'Momentum is a Myth', icon: 'xmark', accent: '#6E7280' },
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
  const ui = VERDICT_UI[verdict.verdict];
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
    { label: 'P-Value', value: verdict.pValue < 0.001 ? '< 0.001' : verdict.pValue.toFixed(3), note: verdict.verdict === 'real' ? 'Statistically significant' : 'Not significant' },
    { label: 'Confidence Interval', value: `${verdict.ciLow.toFixed(2)} – ${verdict.ciHigh.toFixed(2)}`, note: '95% interval for the hazard ratio' },
    { label: 'Effect Size', value: verdict.effectSize.toFixed(2), note: 'Strength of the momentum effect' },
  ];

  const heroGradient: readonly [string, string] =
    verdict.verdict === 'real'
      ? ['#2FA36B', '#4CC38A']
      : verdict.verdict === 'inconclusive'
        ? ['#F5A623', '#FFB86C']
        : ['#8A8FA3', '#B0B5C6'];

  return (
    <Screen refreshControl={refreshControl}>
      <AppHeader title="Momentum" activeSport={sport} onSelectSport={setSport} />

      {error != null && !backendOffline ? (
        <ErrorState message={`Could not load momentum analysis for ${sport}`} onRetry={refetchMomentum} />
      ) : showSkeleton ? (
        <>
          {/* Verdict hero skeleton */}
          <View style={[styles.verdictHero, styles.verdictSkeleton]}>
            <Skeleton width={110} height={12} radius={6} />
            <Skeleton width={210} height={26} radius={8} />
            <Skeleton width="90%" height={8} radius={4} />
            <Skeleton width="70%" height={12} radius={6} />
          </View>
          <SkeletonCard lines={3} />
          <View style={styles.section}>
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
          {/* Verdict hero — icon, title, effect-size meter, headline stats */}
          <GradientView colors={heroGradient} style={styles.verdictHero}>
            <View style={styles.heroTop}>
              <View style={styles.heroSportChip}>
                <Text style={styles.heroSportText}>{SPORT_BY_ID[sport].name}</Text>
              </View>
              <Text style={styles.heroSeason}>{verdict.season}</Text>
            </View>

            <View style={styles.heroMain}>
              <View style={styles.heroIconWrap}>
                <AppIcon name={ui.icon} size={20} color="#FFFFFF" weight="bold" />
              </View>
              <View style={styles.heroTextWrap}>
                <Text style={styles.heroEyebrow}>Momentum verdict</Text>
                <Text style={styles.heroTitle}>{ui.title}</Text>
              </View>
            </View>

            {/* Effect-size meter */}
            <View style={styles.heroMeterRow}>
              <View style={styles.heroMeterTrack}>
                <View
                  style={[
                    styles.heroMeterFill,
                    { width: `${Math.min(100, Math.round(Math.abs(verdict.effectSize) * 100))}%` },
                  ]}
                />
              </View>
              <Text style={styles.heroMeterLabel}>
                {Math.round(Math.abs(verdict.effectSize) * 100)}% effect size
              </Text>
            </View>

            {/* Headline stats */}
            <View style={styles.heroStatsRow}>
              <HeroStat value={verdict.pValue < 0.001 ? '< 0.001' : verdict.pValue.toFixed(3)} label="p-value" />
              <View style={styles.heroStatDivider} />
              <HeroStat value={`${Math.round(Math.abs(verdict.effectSize) * 100)}%`} label="effect size" />
              <View style={styles.heroStatDivider} />
              <HeroStat value={verdict.gamesAnalyzed.toLocaleString()} label="games analyzed" />
            </View>
          </GradientView>

          {/* Explanation */}
          <Card style={styles.explainCard}>
            <View style={styles.explainHeader}>
              <AppIcon name="sparkles" size={15} color="#5856D6" />
              <Text style={styles.explainTitle}>In plain English</Text>
              <View style={styles.explainBadge}>
                <Text style={styles.explainBadgeText}>{isAnalystDepth ? 'Depth' : 'Simple'}</Text>
              </View>
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
          <View style={styles.section}>
            <Pressable style={styles.collapseHeader} onPress={() => setStatsOpen(prev => !prev)}>
              <Text style={styles.sectionTitle}>The Numbers</Text>
              <View style={styles.collapseChip}>
                <Text style={styles.collapseChipText}>{statsOpen ? 'Hide' : 'Show'}</Text>
                <AppIcon name={statsOpen ? 'chevron.down' : 'chevron.right'} size={14} color="#5856D6" />
              </View>
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
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dive deeper</Text>
        <View style={styles.quickGrid}>
          <QuickLink
            icon="play.fill"
            label="Game replay"
            description="Watch momentum swings play by play"
            color="#5856D6"
            onPress={() =>
              router.push(
                firstGame
                  ? { pathname: '/momentum/replay', params: { gameId: firstGame.id } }
                  : '/momentum/replay'
              )
            }
          />
          <QuickLink
            icon="chart.bar.fill"
            label="Compare sports"
            description="How momentum stacks up across leagues"
            color="#FF5C8A"
            onPress={() => router.push('/momentum/comparison')}
          />
          <QuickLink
            icon="timer"
            label="Timeout optimizer"
            description="Get the call in crunch time"
            color="#FFA058"
            onPress={() => router.push('/momentum/timeout')}
          />
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

function QuickLink({ icon, label, description, color, onPress }: { icon: IconName; label: string; description: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.8 }]}>
      <View style={[styles.quickIcon, { backgroundColor: `${color}18` }]}>
        <AppIcon name={icon} size={18} color={color} />
      </View>
      <View style={styles.quickBody}>
        <Text style={styles.quickLabel}>{label}</Text>
        <Text style={styles.quickDesc}>{description}</Text>
      </View>
      <AppIcon name="chevron.right" size={14} color="#9AA0B5" />
    </Pressable>
  );
}

/** One stat column inside the verdict hero. */
function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // --- Verdict hero ---
  verdictHero: {
    borderRadius: 20,
    padding: 18,
    gap: 16,
  },
  verdictSkeleton: {
    backgroundColor: '#E8E9F0',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroSportChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  heroSportText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroSeason: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  heroMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextWrap: {
    flex: 1,
    gap: 2,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
  },
  heroMeterRow: {
    gap: 5,
  },
  heroMeterTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  heroMeterFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  heroMeterLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 12,
    paddingVertical: 10,
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  heroStatValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10.5,
    fontWeight: '600',
  },
  heroStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  // --- Explanation ---
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
    flex: 1,
  },
  explainBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  explainBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5856D6',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
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
  // --- Sections ---
  section: {
    gap: 12,
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
  collapseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFEEFB',
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 28,
  },
  collapseChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#5856D6',
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
    textAlign: 'center',
  },
  // --- Quick links ---
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
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBody: {
    flex: 1,
    gap: 2,
  },
  quickLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#14121F',
  },
  quickDesc: {
    fontSize: 12,
    color: '#9AA0B5',
  },
});
