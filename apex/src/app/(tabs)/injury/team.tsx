import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DistributionBar } from '@/components/ui/bar';
import { LineChart } from '@/components/ui/chart';
import { AppIcon } from '@/components/ui/icon';
import { GradientView } from '@/components/ui/gradient';
import { type Player } from '@/data/mock/players';
import { SPORT_BY_ID } from '@/data/mock/sports';
import { useTeamRoster } from '@/data/live/injury';
import { useOnboarding } from '@/context/onboarding';
import { useBackend } from '@/context/backend';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Skeleton } from '@/components/ui/skeleton';
import { DataFreshness } from '@/components/ui/data-freshness';

type ZoneFilter = 'all' | 'red' | 'yellow' | 'green';
type SortKey = 'risk' | 'name' | 'position';

const SORT_LABEL: Record<SortKey, string> = { risk: 'Risk Score', name: 'Name', position: 'Position' };

export default function TeamRiskScreen() {
  const router = useRouter();
  const { team } = useLocalSearchParams<{ team?: string }>();
  const teamName = team ?? 'Lakers';
  const [filter, setFilter] = useState<ZoneFilter>('all');
  const [sort, setSort] = useState<SortKey>('risk');
  const [chartOpen, setChartOpen] = useState(true);
  const { activeSport } = useOnboarding();
  const { status } = useBackend();

  const { players: roster, loading, lastUpdated, refetch: refetchRoster } = useTeamRoster(teamName, activeSport);
  const sport = SPORT_BY_ID[roster[0]?.sport ?? activeSport];

  // Backend confirmed offline → skip skeletons, show fallback data immediately.
  const backendOffline = status === 'offline';
  const showSkeleton = loading && !backendOffline;
  const { refreshControl } = usePullRefresh(refetchRoster);

  const counts = {
    red: roster.filter(p => p.zone === 'red').length,
    yellow: roster.filter(p => p.zone === 'yellow').length,
    green: roster.filter(p => p.zone === 'green').length,
  };

  const visible = roster
    .filter(p => (filter === 'all' ? true : p.zone === filter))
    .sort((a, b) => {
      if (sort === 'risk') return (b.riskScore ?? 0) - (a.riskScore ?? 0);
      if (sort === 'name') return a.lastName.localeCompare(b.lastName);
      return a.position.localeCompare(b.position);
    });

  const trend = [0.3, 0.35, 0.28, 0.42, 0.38, 0.5, 0.46, 0.58, 0.52, 0.6, 0.55, 0.64].map((y, i) => ({
    x: i / 11,
    y,
  }));

  return (
    <Screen refreshControl={refreshControl}>
      <StackHeader title="Team Risk" subtitle={teamName} />

      {/* Team banner */}
      <GradientView colors={sport.gradient} style={styles.banner}>
        <View style={styles.bannerRow}>
          <View style={styles.bannerLogo}>
            <Text style={styles.bannerLogoText}>{teamName.slice(0, 1)}</Text>
          </View>
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerTeam}>{teamName}</Text>
            <Text style={styles.bannerMeta}>
              {sport.short} · {roster.length} players tracked
            </Text>
          </View>
        </View>
      </GradientView>

      {/* Data freshness — the plan's tiers (note for 1-6h, banner for 6h+) */}
      {lastUpdated ? <DataFreshness timestamp={lastUpdated} onRefresh={refetchRoster} /> : null}

      {/* Traffic light summary */}
      <Card style={styles.countsCard}>
        <CountBlock label="Red zone" value={counts.red} color="#E5484D" active={filter === 'red'} onPress={() => setFilter(filter === 'red' ? 'all' : 'red')} />
        <View style={styles.countDivider} />
        <CountBlock label="Yellow zone" value={counts.yellow} color="#F5A623" active={filter === 'yellow'} onPress={() => setFilter(filter === 'yellow' ? 'all' : 'yellow')} />
        <View style={styles.countDivider} />
        <CountBlock label="Green zone" value={counts.green} color="#2FA36B" active={filter === 'green'} onPress={() => setFilter(filter === 'green' ? 'all' : 'green')} />
      </Card>

      {/* Filters + sort */}
      <View style={styles.toolbar}>
        <View style={styles.chipRow}>
          {(['all', 'red', 'yellow', 'green'] as ZoneFilter[]).map(z => (
            <Chip key={z} label={z === 'all' ? 'All' : z[0].toUpperCase() + z.slice(1)} small selected={filter === z} onPress={() => setFilter(z)} />
          ))}
        </View>
        <Pressable
          style={styles.sortBtn}
          onPress={() => setSort(prev => (prev === 'risk' ? 'name' : prev === 'name' ? 'position' : 'risk'))}>
          <AppIcon name="chart.bar.fill" size={13} color="#5856D6" />
          <Text style={styles.sortText}>Sort: {SORT_LABEL[sort]}</Text>
        </Pressable>
      </View>

      {/* Roster */}
      <Card style={styles.rosterCard} padded={false}>
        {showSkeleton ? (
          <View style={styles.rosterSkeleton}>
            {[0, 1, 2, 3, 4].map(i => (
              <View key={i} style={[styles.rosterRow, i !== 4 && styles.rosterRowBorder]}>
                <Skeleton width={9} height={9} radius={5} />
                <Skeleton width={20} height={12} radius={4} />
                <View style={styles.rosterBody}>
                  <Skeleton width="75%" height={13} radius={6} />
                  <Skeleton width={46} height={16} radius={7} />
                </View>
                <Skeleton width={52} height={14} radius={7} />
              </View>
            ))}
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.emptyRoster}>
            <Text style={styles.emptyRosterText}>No players in this zone</Text>
          </View>
        ) : (
          visible.map((p, i) => (
            <Pressable key={p.id} onPress={() => router.push({ pathname: '/injury/player', params: { playerId: p.id } })}>
              <RosterRow player={p} last={i === visible.length - 1} />
            </Pressable>
          ))
        )}
      </Card>

      {/* Team chart (collapsible) */}
      <Card style={styles.chartCard}>
        <Pressable style={styles.chartHeader} onPress={() => setChartOpen(prev => !prev)}>
          <Text style={styles.chartHeaderTitle}>Team risk analysis</Text>
          <AppIcon name={chartOpen ? 'chevron.down' : 'chevron.right'} size={16} color="#6E7280" />
        </Pressable>
        {chartOpen ? (
          <View style={styles.chartBody}>
            <Text style={styles.chartLabel}>Risk distribution</Text>
            <DistributionBar
              segments={[
                { color: '#E5484D', value: counts.red, label: 'red' },
                { color: '#F5A623', value: counts.yellow, label: 'yellow' },
                { color: '#2FA36B', value: counts.green, label: 'green' },
              ]}
            />
            <Text style={styles.chartLabel}>Risk over last 30 days</Text>
            <LineChart series={[{ name: 'Team risk', color: '#5856D6', points: trend }]} height={100} gridLabels={['30d', '20d', '10d', 'Now']} />
          </View>
        ) : null}
      </Card>

      <Pressable style={styles.exportBtn}>
        <AppIcon name="doc.fill" size={15} color="#5856D6" />
        <Text style={styles.exportText}>Export team report PDF</Text>
      </Pressable>
    </Screen>
  );
}

function CountBlock({ label, value, color, active, onPress }: { label: string; value: number; color: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.countBlock, active && styles.countBlockActive]} onPress={onPress}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </Pressable>
  );
}

function RosterRow({ player, last }: { player: Player; last: boolean }) {
  const color =
    player.zone === 'red' ? '#E5484D' : player.zone === 'yellow' ? '#F5A623' : player.zone === 'green' ? '#2FA36B' : '#9AA0B5';
  return (
    <View style={[styles.rosterRow, !last && styles.rosterRowBorder]}>
      <View style={[styles.zoneDot, { backgroundColor: color }]} />
      <Text style={styles.jersey}>{player.jersey}</Text>
      <View style={styles.rosterBody}>
        <Text style={styles.rosterName}>{player.name}</Text>
        <View style={[styles.positionBadge, { backgroundColor: `${color}14` }]}>
          <Text style={[styles.positionText, { color }]}>{player.position}</Text>
        </View>
      </View>
      {player.zone !== 'green' ? (
        <View style={[styles.triggerChip, { backgroundColor: `${color}12` }]}>
          <Text style={[styles.triggerChipText, { color }]}>{player.triggerMetric}</Text>
        </View>
      ) : null}
      <Text style={[styles.rosterScore, { color }]}>{player.riskScore}</Text>
      <AppIcon name="chevron.right" size={13} color="#D5D7E0" />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bannerLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerLogoText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  bannerInfo: {
    gap: 2,
  },
  bannerTeam: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  bannerMeta: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12.5,
    fontWeight: '600',
  },
  bannerUpdated: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11.5,
  },
  countsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  countBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBlockActive: {
    backgroundColor: '#F0F1F5',
  },
  countValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  countLabel: {
    fontSize: 11.5,
    color: '#6E7280',
    fontWeight: '600',
  },
  countDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    backgroundColor: '#E4E5EC',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 32,
  },
  sortText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#5856D6',
  },
  rosterCard: {
    paddingVertical: 4,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rosterRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F1F5',
  },
  zoneDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  jersey: {
    fontSize: 12,
    color: '#9AA0B5',
    width: 22,
  },
  rosterBody: {
    flex: 1,
    gap: 3,
  },
  rosterName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#14121F',
  },
  positionBadge: {
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  positionText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  triggerChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  triggerChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rosterScore: {
    fontSize: 16,
    fontWeight: '800',
    minWidth: 30,
    textAlign: 'right',
  },
  emptyRoster: {
    padding: 28,
    alignItems: 'center',
  },
  rosterSkeleton: {
    paddingHorizontal: 16,
  },
  emptyRosterText: {
    fontSize: 13,
    color: '#6E7280',
  },
  chartCard: {
    gap: 4,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14121F',
  },
  chartBody: {
    gap: 10,
    marginTop: 10,
  },
  chartLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#14121F',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#5856D6',
  },
  exportText: {
    color: '#5856D6',
    fontWeight: '700',
    fontSize: 14,
  },
});
