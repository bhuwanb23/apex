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
import { PLAYERS, type Player } from '@/data/mock/players';

type ZoneFilter = 'all' | 'red' | 'yellow' | 'green';
type SortKey = 'risk' | 'name';

export default function TeamRiskScreen() {
  const router = useRouter();
  const { team } = useLocalSearchParams<{ team?: string }>();
  const teamName = team ?? 'Lakers';
  const [filter, setFilter] = useState<ZoneFilter>('all');
  const [sort, setSort] = useState<SortKey>('risk');

  const roster = PLAYERS.filter(p => p.team === teamName);
  const counts = {
    red: roster.filter(p => p.zone === 'red').length,
    yellow: roster.filter(p => p.zone === 'yellow').length,
    green: roster.filter(p => p.zone === 'green').length,
  };

  const visible = roster
    .filter(p => (filter === 'all' ? true : p.zone === filter))
    .sort((a, b) => (sort === 'risk' ? (b.riskScore ?? 0) - (a.riskScore ?? 0) : a.lastName.localeCompare(b.lastName)));

  const trend: { x: number; y: number }[] = [0.3, 0.35, 0.28, 0.42, 0.38, 0.5, 0.46, 0.58, 0.52, 0.6, 0.55, 0.64].map(
    (y, i) => ({ x: i / 11, y })
  );

  return (
    <Screen tabInset={false}>
      <StackHeader title="Team Risk" subtitle={teamName} />

      {/* Team banner */}
      <GradientView colors={['#5856D6', '#8E7BFF']} style={styles.banner}>
        <View style={styles.bannerRow}>
          <View style={styles.bannerLogo}>
            <Text style={styles.bannerLogoText}>{teamName.slice(0, 1)}</Text>
          </View>
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerTeam}>{teamName}</Text>
            <Text style={styles.bannerMeta}>{roster.length} players tracked · updated 2h ago</Text>
          </View>
        </View>
      </GradientView>

      {/* Traffic light summary */}
      <Card style={styles.countsCard}>
        <CountBlock label="Red" value={counts.red} color="#E5484D" onPress={() => setFilter(filter === 'red' ? 'all' : 'red')} />
        <View style={styles.countDivider} />
        <CountBlock label="Yellow" value={counts.yellow} color="#F5A623" onPress={() => setFilter(filter === 'yellow' ? 'all' : 'yellow')} />
        <View style={styles.countDivider} />
        <CountBlock label="Green" value={counts.green} color="#2FA36B" onPress={() => setFilter(filter === 'green' ? 'all' : 'green')} />
      </Card>

      {/* Filters + sort */}
      <View style={styles.toolbar}>
        <View style={styles.chipRow}>
          {(['all', 'red', 'yellow', 'green'] as ZoneFilter[]).map(z => (
            <Chip key={z} label={z === 'all' ? 'All' : z[0].toUpperCase() + z.slice(1)} small selected={filter === z} onPress={() => setFilter(z)} />
          ))}
        </View>
        <Pressable style={styles.sortBtn} onPress={() => setSort(sort === 'risk' ? 'name' : 'risk')}>
          <AppIcon name="chart.bar.fill" size={13} color="#5856D6" />
          <Text style={styles.sortText}>Sort: {sort === 'risk' ? 'Risk' : 'Name'}</Text>
        </Pressable>
      </View>

      {/* Roster */}
      <Card style={styles.rosterCard} padded={false}>
        {visible.map((p, i) => (
          <Pressable
            key={p.id}
            onPress={() => router.push({ pathname: '/injury/player', params: { playerId: p.id } })}>
            <RosterRow player={p} last={i === visible.length - 1} />
          </Pressable>
        ))}
        {visible.length === 0 ? (
          <View style={styles.emptyRoster}>
            <Text style={styles.emptyRosterText}>No players in this zone</Text>
          </View>
        ) : null}
      </Card>

      {/* Team chart */}
      <View>
        <Text style={styles.sectionTitle}>Risk distribution</Text>
        <Card style={styles.chartCard}>
          <DistributionBar
            segments={[
              { color: '#E5484D', value: counts.red, label: 'red' },
              { color: '#F5A623', value: counts.yellow, label: 'yellow' },
              { color: '#2FA36B', value: counts.green, label: 'green' },
            ]}
          />
          <Text style={styles.trendTitle}>Risk over last 30 days</Text>
          <LineChart series={[{ name: 'Team risk', color: '#5856D6', points: trend }]} height={100} gridLabels={['30d', '20d', '10d', 'Now']} />
        </Card>
      </View>

      <Pressable style={styles.exportBtn}>
        <AppIcon name="doc.fill" size={15} color="#5856D6" />
        <Text style={styles.exportText}>Export team report PDF</Text>
      </Pressable>
    </Screen>
  );
}

function CountBlock({ label, value, color, onPress }: { label: string; value: number; color: string; onPress: () => void }) {
  return (
    <Pressable style={styles.countBlock} onPress={onPress}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel}>{label} zone</Text>
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
        <Text style={styles.rosterPos}>{player.position}</Text>
      </View>
      {player.zone !== 'green' ? (
        <View style={styles.triggerChip}>
          <Text style={[styles.triggerChipText, { color }]}>{player.triggerMetric}</Text>
        </View>
      ) : null}
      <Text style={[styles.rosterScore, { color }]}>{player.riskScore}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 20,
    padding: 20,
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
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  countsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  countBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  countValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  countLabel: {
    fontSize: 12,
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
    fontSize: 12,
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
    gap: 1,
  },
  rosterName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#14121F',
  },
  rosterPos: {
    fontSize: 11.5,
    color: '#6E7280',
  },
  triggerChip: {
    backgroundColor: '#F0F1F5',
    borderRadius: 8,
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
  emptyRosterText: {
    fontSize: 13,
    color: '#6E7280',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
  },
  chartCard: {
    gap: 12,
  },
  trendTitle: {
    fontSize: 13,
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
