import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { VerdictBadge } from '@/components/ui/badge';
import { AppIcon } from '@/components/ui/icon';
import { GradientView } from '@/components/ui/gradient';
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { SPORT_BY_ID } from '@/data/mock/sports';
import { useMomentumComparison } from '@/data/live/momentum';
import { useBackend } from '@/context/backend';
import { usePullRefresh } from '@/hooks/use-pull-refresh';

const SEASONS = ['2025', '2026', '2024-25'];

export default function SportComparisonScreen() {
  const router = useRouter();
  // The comparison is backend-driven; "current" (undefined) matches each
  // sport's own season and shows the strongest effect first.
  const [season, setSeason] = useState<string | undefined>(undefined);
  const { status } = useBackend();

  const { data: rankedData, loading, error, refetch: refetchComparison } = useMomentumComparison(season);

  // Backend confirmed offline → skip skeletons, show fallback data immediately.
  const backendOffline = status === 'offline';
  const showSkeleton = loading && !backendOffline;
  const { refreshControl } = usePullRefresh(refetchComparison);
  const ranked = (rankedData ?? []).map(v => ({
    sport: v.sport,
    verdict: v.verdict,
    effectSize: v.effectSize,
    pValue: v.pValue,
    season,
    explanation: v.shortExplanation,
  }));
  const maxEffect = Math.max(...ranked.map(v => v.effectSize), 0.01);

  return (
    <Screen refreshControl={refreshControl}>
      <StackHeader title="Sport Comparison" subtitle="Is momentum real? Depends on the sport." />

      <View style={styles.seasonRow}>
        <Chip key="current" label="Current" small selected={season === undefined} onPress={() => setSeason(undefined)} />
        {SEASONS.map(s => (
          <Chip key={s} label={s} small selected={season === s} onPress={() => setSeason(s)} />
        ))}
      </View>

      {error != null && !backendOffline ? (
        <ErrorState message="Could not load the sport comparison" onRetry={refetchComparison} />
      ) : showSkeleton ? (
        <>
          {/* Chart skeleton */}
          <Card style={styles.chartCard}>
            <Skeleton width="55%" height={16} radius={6} />
            <Skeleton width="70%" height={11} radius={6} />
            <View style={styles.bars}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={styles.barRow}>
                  <View style={styles.barLabel}>
                    <Skeleton width={28} height={28} radius={14} />
                    <Skeleton width={36} height={13} radius={6} />
                  </View>
                  <View style={styles.barTrack}>
                    <Skeleton width="100%" height={14} radius={7} />
                  </View>
                  <Skeleton width={30} height={13} radius={6} />
                </View>
              ))}
            </View>
          </Card>
          {/* Sport rows skeleton */}
          <View style={styles.listGap}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </View>
        </>
      ) : (
        <>
          {/* Effect size chart */}
          <Card style={styles.chartCard}>
            <Text style={styles.chartTitle}>Momentum effect size by sport</Text>
            <Text style={styles.chartSub}>Cox hazard model · {season ? `${season} season` : 'current seasons'}</Text>
            <View style={styles.bars}>
              {ranked.map(v => {
                const sport = SPORT_BY_ID[v.sport];
                const significant = v.verdict === 'real';
                return (
                  <Pressable
                    key={v.sport}
                    onPress={() => router.push({ pathname: '/momentum', params: { sport: v.sport } })}
                    style={styles.barRow}>
                    <View style={styles.barLabel}>
                      <GradientView colors={sport.gradient} style={styles.barLogo}>
                        <Text style={styles.barLogoText}>{sport.short.slice(0, 1)}</Text>
                      </GradientView>
                      <Text style={styles.barName}>{sport.short}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${(v.effectSize / maxEffect) * 100}%`,
                            backgroundColor: significant ? '#2FA36B' : '#B9BDCC',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barValue}>{v.effectSize.toFixed(2)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.legendRow}>
              <Legend color="#2FA36B" label="Statistically significant" />
              <Legend color="#B9BDCC" label="Not significant" />
            </View>
          </Card>

          {/* Sport rows */}
          <View style={styles.listGap}>
            {ranked.map(v => {
              const sport = SPORT_BY_ID[v.sport];
              return (
                <Pressable key={v.sport} onPress={() => router.push({ pathname: '/momentum', params: { sport: v.sport } })}>
                  <Card style={styles.sportCard}>
                    <GradientView colors={sport.gradient} style={styles.sportLogo}>
                      <Text style={styles.sportLogoText}>{sport.short.slice(0, 1)}</Text>
                    </GradientView>
                    <View style={styles.sportBody}>
                      <View style={styles.sportNameRow}>
                        <Text style={styles.sportName}>{sport.name}</Text>
                        <VerdictBadge verdict={v.verdict} />
                      </View>
                      <Text style={styles.sportMeta}>
                        Effect {v.effectSize.toFixed(2)} · p = {v.pValue < 0.001 ? '< 0.001' : v.pValue.toFixed(3)}
                      </Text>
                    </View>
                    <AppIcon name="chevron.right" size={15} color="#9AA0B5" />
                  </Card>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Insight callout */}
      <Card style={styles.insightCard}>
        <View style={styles.insightHeader}>
          <AppIcon name="sparkles" size={15} color="#5856D6" />
          <Text style={styles.insightTitle}>What this means</Text>
        </View>
        <Text style={styles.insightText}>
          Hockey shows the strongest momentum effect while baseball shows almost none. This matches intuitions about
          sport structure — fast, continuous play lets momentum compound; discrete at-bats interrupt it.
        </Text>
      </Card>
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  seasonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  chartCard: {
    gap: 10,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#14121F',
  },
  chartSub: {
    fontSize: 12,
    color: '#6E7280',
    marginTop: -6,
  },
  bars: {
    gap: 14,
    marginTop: 6,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 92,
  },
  barLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barLogoText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  barName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#14121F',
  },
  barTrack: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F0F1F5',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 7,
  },
  barValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#14121F',
    width: 34,
    textAlign: 'right',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11.5,
    color: '#6E7280',
  },
  listGap: {
    gap: 10,
  },
  sportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  sportLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportLogoText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  sportBody: {
    flex: 1,
    gap: 5,
  },
  sportNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sportName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14121F',
  },
  sportMeta: {
    fontSize: 12,
    color: '#6E7280',
  },
  insightCard: {
    backgroundColor: '#EFEEFB',
    gap: 8,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5856D6',
  },
  insightText: {
    fontSize: 13.5,
    color: '#3A3852',
    lineHeight: 20,
  },
});
