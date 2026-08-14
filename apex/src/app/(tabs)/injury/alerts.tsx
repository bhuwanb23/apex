import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ZoneBadge, type Zone } from '@/components/ui/badge';
import { AppIcon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/empty-state';
import { SPORTS, type SportId } from '@/data/mock/sports';
import { PLAYERS, type Player } from '@/data/mock/players';

type ZoneFilter = 'all' | 'red' | 'yellow';
type SortKey = 'risk' | 'team' | 'position';

export default function LeagueAlertsScreen() {
  const router = useRouter();
  const [sport, setSport] = useState<SportId>('NBA');
  const [zone, setZone] = useState<ZoneFilter>('all');
  const [sort, setSort] = useState<SortKey>('risk');
  const [refreshing, setRefreshing] = useState(false);

  const sportPlayers = PLAYERS.filter(p => p.sport === sport);
  const visible = sportPlayers
    .filter(p => (zone === 'all' ? p.zone !== 'green' : p.zone === zone))
    .sort((a, b) => {
      if (sort === 'risk') return b.riskScore - a.riskScore;
      if (sort === 'team') return a.team.localeCompare(b.team);
      return a.position.localeCompare(b.position);
    });

  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  };

  const zoneLabel = zone === 'all' ? 'elevated or red' : zone;

  return (
    <Screen tabInset={false}>
      <StackHeader
        title="League Alerts"
        subtitle={sport}
        right={
          <Pressable onPress={refresh} hitSlop={10}>
            <AppIcon name="refresh" size={18} color="#5856D6" />
          </Pressable>
        }
      />

      <View style={styles.filterRow}>
        <View style={styles.sportTabs}>
          {SPORTS.map(s => (
            <Chip key={s.id} label={s.short} small selected={sport === s.id} onPress={() => setSport(s.id)} />
          ))}
        </View>
        <View style={styles.zoneTabs}>
          {(['all', 'red', 'yellow'] as ZoneFilter[]).map(z => (
            <Chip key={z} label={z === 'all' ? 'All' : z[0].toUpperCase() + z.slice(1)} small selected={zone === z} onPress={() => setZone(z)} />
          ))}
        </View>
      </View>

      <View style={styles.countBanner}>
        <Text style={styles.countText}>
          {refreshing ? 'Refreshing…' : `${visible.length} players currently in the ${zoneLabel} zone`}
        </Text>
        <Pressable style={styles.sortBtn} onPress={() => setSort(sort === 'risk' ? 'team' : sort === 'team' ? 'position' : 'risk')}>
          <AppIcon name="chart.bar.fill" size={13} color="#FFFFFF" />
          <Text style={styles.sortText}>Sort: {sort}</Text>
        </Pressable>
      </View>

      {visible.length === 0 ? (
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
  return (
    <Card style={styles.alertCard}>
      <View style={styles.alertTop}>
        <ZoneBadge zone={zone} />
        <Text style={styles.alertDays}>
          {player.daysInZone > 0 ? `In zone ${player.daysInZone}d` : 'New flag'}
        </Text>
      </View>
      <View style={styles.alertMiddle}>
        <View style={styles.alertInfo}>
          <Text style={styles.alertName}>{player.name}</Text>
          <Text style={styles.alertMeta}>
            {player.team} · {player.position}
          </Text>
        </View>
        <Text style={[styles.alertScore, { color: player.zone === 'red' ? '#E5484D' : '#B7791F' }]}>{player.riskScore}</Text>
      </View>
      <Text style={styles.alertExplanation}>{player.explanation}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    gap: 10,
  },
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
    textTransform: 'capitalize',
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
    fontSize: 11.5,
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
  alertScore: {
    fontSize: 26,
    fontWeight: '800',
  },
  alertExplanation: {
    fontSize: 13,
    color: '#6E7280',
    lineHeight: 19,
  },
});
