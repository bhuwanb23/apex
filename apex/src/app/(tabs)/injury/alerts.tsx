import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ZoneBadge, type Zone } from '@/components/ui/badge';
import { AppIcon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/empty-state';
import { SPORTS, type SportId } from '@/data/mock/sports';
import { type Player } from '@/data/mock/players';
import { useLeagueAlerts } from '@/data/live/injury';
import { formatRiskScore } from '@/lib/format';
import { useOnboarding } from '@/context/onboarding';
import { useBackend } from '@/context/backend';
import { SkeletonRow } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { DataFreshness } from '@/components/ui/data-freshness';

type ZoneFilter = 'all' | 'red' | 'yellow';
type SortKey = 'risk' | 'team' | 'position';

const SORT_LABEL: Record<SortKey, string> = { risk: 'Risk Score', team: 'Team', position: 'Position' };

export default function LeagueAlertsScreen() {
  const router = useRouter();
  const { sport: sportParam } = useLocalSearchParams<{ sport?: string }>();
  const { activeSport } = useOnboarding();
  const { status } = useBackend();
  // Follow the user's stored sport (the plan's rule) — the old hardcoded
  // 'NBA' fallback meant an NFL user opening Alerts saw NBA players.
  const [sport, setSport] = useState<SportId>((sportParam as SportId) ?? activeSport);
  const [zone, setZone] = useState<ZoneFilter>('all');
  const [sort, setSort] = useState<SortKey>('risk');
  const [position, setPosition] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Follow the stored sport when it changes — guarded render-time adjustment
  // (React's documented pattern), not setState-in-effect.
  const [prevActiveSport, setPrevActiveSport] = useState<SportId>(activeSport);
  if (prevActiveSport !== activeSport) {
    setPrevActiveSport(activeSport);
    setSport(activeSport);
  }

  const alerts = useLeagueAlerts(sport, zone);
  const sportPlayers = alerts.players;
  const generatedAt = alerts.generatedAt;
  const positions = useMemo(
    () => [...new Set(sportPlayers.map(p => p.position))].sort(),
    [sportPlayers]
  );

  const visible = sportPlayers
    .filter(p => (position ? p.position === position : true))
    .sort((a, b) => {
      if (sort === 'risk') return b.riskScore - a.riskScore;
      if (sort === 'team') return a.team.localeCompare(b.team);
      return a.position.localeCompare(b.position);
    });

  // Pull-to-refresh (plan: "app sends the same request again; backend checks
  // if the cache is still valid and returns fresh or cached data").
  const refresh = () => {
    setRefreshing(true);
    alerts.refetch();
    setTimeout(() => setRefreshing(false), 900);
  };

  const selectSport = (id: SportId) => {
    setSport(id);
    setPosition(null);
  };

  const bannerText =
    zone === 'red'
      ? `${visible.length} player${visible.length === 1 ? '' : 's'} currently in the red zone`
      : zone === 'yellow'
        ? `${visible.length} player${visible.length === 1 ? '' : 's'} currently in the elevated zone`
        : `${visible.length} player${visible.length === 1 ? '' : 's'} currently flagged (red or elevated)`;

  // Backend confirmed offline → skip skeletons, show fallback data immediately.
  const backendOffline = status === 'offline';
  const showSkeleton = alerts.loading && !backendOffline;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor="#5856D6"
          colors={['#5856D6']}
        />
      }>
      <StackHeader
        title="League Alerts"
        subtitle={sport}
        right={
          <Pressable onPress={refresh} hitSlop={10}>
            <AppIcon name="refresh" size={18} color="#5856D6" />
          </Pressable>
        }
      />

      {/* Sport tabs */}
      <View style={styles.sportTabs}>
        {SPORTS.map(s => (
          <Chip key={s.id} label={s.short} small selected={sport === s.id} onPress={() => selectSport(s.id)} />
        ))}
      </View>

      {/* Zone filter */}
      <View style={styles.zoneTabs}>
        {(['all', 'red', 'yellow'] as ZoneFilter[]).map(z => (
          <Chip
            key={z}
            label={z === 'all' ? 'All' : z[0].toUpperCase() + z.slice(1)}
            small
            selected={zone === z}
            onPress={() => setZone(z)}
          />
        ))}
      </View>

      {/* Data freshness — the plan's tiers (note for 1-6h, banner for 6h+) */}
      {generatedAt ? <DataFreshness timestamp={generatedAt} onRefresh={refresh} /> : null}

      {/* Count banner + sort */}
      <View style={styles.countBanner}>
        <Text style={styles.countText}>{refreshing ? 'Refreshing…' : showSkeleton ? 'Loading alerts…' : bannerText}</Text>
        <Pressable
          style={styles.sortBtn}
          onPress={() => setSort(prev => (prev === 'risk' ? 'team' : prev === 'team' ? 'position' : 'risk'))}>
          <AppIcon name="chart.bar.fill" size={13} color="#FFFFFF" />
          <Text style={styles.sortText}>Sort: {SORT_LABEL[sort]}</Text>
        </Pressable>
      </View>

      {/* Position filter */}
      {positions.length > 1 ? (
        <View style={styles.positionRow}>
          <Text style={styles.positionLabel}>Position</Text>
          <View style={styles.positionChips}>
            <Chip label="All" small selected={position === null} onPress={() => setPosition(null)} />
            {positions.map(pos => (
              <Chip key={pos} label={pos} small selected={position === pos} onPress={() => setPosition(position === pos ? null : pos)} />
            ))}
          </View>
        </View>
      ) : null}

      {alerts.error != null && !backendOffline ? (
        <ErrorState message={`Could not load ${sport} alerts`} onRetry={alerts.refetch} />
      ) : showSkeleton ? (
        <View style={styles.listGap}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="checkmark"
          title="No players in this zone right now"
          subtitle="All players are within their normal workload range."
        />
      ) : (
        <View style={styles.listGap}>
          {visible.map(player => (
            <Pressable
              key={player.id}
              onPress={() => router.push({ pathname: '/injury/player', params: { playerId: player.id } })}>
              <AlertCard player={player} />
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

function AlertCard({ player }: { player: Player }) {
  const zone = (player.zone === 'green' ? 'insufficient_data' : player.zone) as Zone;
  const zoneNoun = player.zone === 'red' ? 'red zone' : 'elevated zone';
  const duration =
    player.daysInZone > 0
      ? `In ${zoneNoun} for ${player.daysInZone} day${player.daysInZone === 1 ? '' : 's'}`
      : 'New flag';
  return (
    <Card style={styles.alertCard}>
      <View style={styles.alertTop}>
        <ZoneBadge zone={zone} />
        <Text style={styles.alertDays}>{duration}</Text>
      </View>
      <View style={styles.alertMiddle}>
        <View style={styles.alertInfo}>
          <Text style={styles.alertName}>{player.name}</Text>
          <Text style={styles.alertMeta}>
            {player.team} · {player.position}
          </Text>
        </View>
        <View style={styles.alertScoreWrap}>
          <Text style={[styles.alertScore, { color: player.zone === 'red' ? '#E5484D' : '#B7791F' }]}>{formatRiskScore(player.riskScore)}</Text>
          <Text style={styles.alertScoreLabel}>risk</Text>
        </View>
      </View>
      <Text style={styles.alertExplanation}>{player.explanation}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  sportTabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  zoneTabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  countBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#5856D6',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
    flex: 1,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 28,
  },
  sortText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  positionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#6E7280',
  },
  positionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  listGap: {
    gap: 10,
  },
  alertCard: {
    gap: 10,
  },
  alertTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertDays: {
    fontSize: 12,
    color: '#9AA0B5',
    fontWeight: '600',
  },
  alertMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertInfo: {
    gap: 2,
    flex: 1,
  },
  alertName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#14121F',
  },
  alertMeta: {
    fontSize: 12.5,
    color: '#6E7280',
  },
  alertScoreWrap: {
    alignItems: 'center',
    marginLeft: 10,
  },
  alertScore: {
    fontSize: 26,
    fontWeight: '800',
  },
  alertScoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#9AA0B5',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  alertExplanation: {
    fontSize: 13,
    color: '#6E7280',
    lineHeight: 19,
  },
});
