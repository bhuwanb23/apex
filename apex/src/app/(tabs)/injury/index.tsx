import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useOnboarding } from '@/context/onboarding';
import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DistributionBar } from '@/components/ui/bar';
import { ZoneBadge } from '@/components/ui/badge';
import { AppIcon } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SPORTS, SPORT_BY_ID, type SportId } from '@/data/mock/sports';
import { PLAYERS } from '@/data/mock/players';

export default function InjuryDashboardScreen() {
  const router = useRouter();
  const { activeSport } = useOnboarding();
  const [sport, setSport] = useState<SportId>(activeSport);
  const [view, setView] = useState<'league' | 'team'>('league');
  const [teamQuery, setTeamQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('Lakers');
  const [refreshing, setRefreshing] = useState(false);

  const sportPlayers = PLAYERS.filter(p => p.sport === sport);
  const redCount = sportPlayers.filter(p => p.zone === 'red').length;
  const yellowCount = sportPlayers.filter(p => p.zone === 'yellow').length;
  const greenCount = sportPlayers.filter(p => p.zone === 'green').length;
  const topRed = sportPlayers.filter(p => p.zone === 'red').slice(0, 5);

  const teamNames = SPORT_BY_ID[sport].teams;
  const filteredTeams = teamNames.filter(t => t.toLowerCase().includes(teamQuery.toLowerCase()));
  const roster = sportPlayers.filter(p => p.team === selectedTeam);
  const rosterRed = roster.filter(p => p.zone === 'red').length;
  const rosterYellow = roster.filter(p => p.zone === 'yellow').length;
  const rosterGreen = roster.filter(p => p.zone === 'green').length;

  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  };

  return (
    <Screen>
      <StackHeader
        title="Injury Risk"
        subtitle={sport}
        right={
          <Pressable onPress={refresh} hitSlop={10}>
            <AppIcon name="refresh" size={18} color="#5856D6" />
          </Pressable>
        }
      />

      {/* Sport filter + view toggle */}
      <View style={styles.filterRow}>
        <View style={styles.sportTabs}>
          {SPORTS.map(s => (
            <Chip key={s.id} label={s.short} small selected={sport === s.id} onPress={() => setSport(s.id)} />
          ))}
        </View>
      </View>
      <View style={styles.segment}>
        {(['league', 'team'] as const).map(v => (
          <Pressable key={v} style={[styles.segmentBtn, view === v && styles.segmentActive]} onPress={() => setView(v)}>
            <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>
              {v === 'league' ? 'League' : 'Team'}
            </Text>
          </Pressable>
        ))}
      </View>

      {view === 'league' ? (
        <>
          <Card style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <Text style={styles.summaryTitle}>Risk distribution</Text>
              <Text style={styles.summaryCount}>{redCount + yellowCount + greenCount} players</Text>
            </View>
            <DistributionBar
              segments={[
                { color: '#E5484D', value: redCount, label: 'red' },
                { color: '#F5A623', value: yellowCount, label: 'yellow' },
                { color: '#2FA36B', value: greenCount, label: 'green' },
              ]}
            />
            <View style={styles.legendRow}>
              <LegendItem color="#E5484D" label={`${redCount} red`} />
              <LegendItem color="#F5A623" label={`${yellowCount} yellow`} />
              <LegendItem color="#2FA36B" label={`${greenCount} green`} />
            </View>
          </Card>

          <Text style={styles.sectionLabel}>Top red zone players</Text>
          <View style={styles.listGap}>
            {topRed.map(player => (
              <Pressable
                key={player.id}
                onPress={() => router.push({ pathname: '/injury/player', params: { playerId: player.id } })}>
                <Card style={styles.playerRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{player.lastName.slice(0, 1)}</Text>
                  </View>
                  <View style={styles.playerBody}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    <Text style={styles.playerMeta}>
                      {player.team} · {player.position}
                    </Text>
                  </View>
                  <View style={styles.triggerWrap}>
                    <Text style={styles.triggerText}>{player.triggerMetric}</Text>
                  </View>
                  <Text style={styles.score}>{player.riskScore}</Text>
                </Card>
              </Pressable>
            ))}
          </View>

          <PillButton
            label={`View all ${redCount} red zone players`}
            variant="outline"
            onPress={() => router.push('/injury/alerts')}
          />
        </>
      ) : (
        <>
          <View style={styles.searchBar}>
            <AppIcon name="magnifyingglass" size={16} color="#9AA0B5" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search team…"
              placeholderTextColor="#9AA0B5"
              value={teamQuery}
              onChangeText={setTeamQuery}
            />
          </View>
          <ScrollViewHorizontal teams={filteredTeams} selected={selectedTeam} onSelect={setSelectedTeam} />

          <Card style={styles.rosterCard}>
            <View style={styles.rosterHeader}>
              <Text style={styles.rosterTeam}>{selectedTeam}</Text>
              <View style={styles.rosterCounts}>
                <CountPill color="#E5484D" count={rosterRed} />
                <CountPill color="#F5A623" count={rosterYellow} />
                <CountPill color="#2FA36B" count={rosterGreen} />
              </View>
            </View>
            <View style={styles.rosterList}>
              {roster.map(player => (
                <Pressable
                  key={player.id}
                  onPress={() => router.push({ pathname: '/injury/player', params: { playerId: player.id } })}>
                  <View style={styles.rosterRow}>
                    <View style={[styles.zoneDot, { backgroundColor: zoneColor(player.zone) }]} />
                    <Text style={styles.jersey}>{player.jersey}</Text>
                    <Text style={styles.rosterName}>{player.name}</Text>
                    <Text style={styles.rosterPos}>{player.position}</Text>
                    <Text style={[styles.rosterScore, { color: zoneColor(player.zone) }]}>{player.riskScore}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </Card>
        </>
      )}

      <View style={styles.updatedRow}>
        <AppIcon name="clock.fill" size={13} color="#9AA0B5" />
        <Text style={styles.updatedText}>
          {refreshing ? 'Refreshing…' : 'Risk scores updated 2 hours ago — tap refresh to force'}
        </Text>
      </View>
    </Screen>
  );
}

function zoneColor(zone: string): string {
  switch (zone) {
    case 'red':
      return '#E5484D';
    case 'yellow':
      return '#F5A623';
    case 'green':
      return '#2FA36B';
    default:
      return '#9AA0B5';
  }
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function CountPill({ color, count }: { color: string; count: number }) {
  return (
    <View style={[styles.countPill, { backgroundColor: `${color}18` }]}>
      <Text style={[styles.countPillText, { color }]}>{count}</Text>
    </View>
  );
}

function ScrollViewHorizontal({
  teams,
  selected,
  onSelect,
}: {
  teams: string[];
  selected: string;
  onSelect: (team: string) => void;
}) {
  return (
    <View style={styles.teamChips}>
      {teams.length === 0 ? (
        <Text style={styles.noTeam}>No team matches “{selected}”</Text>
      ) : (
        teams.map(team => (
          <Chip key={team} label={team} small selected={selected === team} onPress={() => onSelect(team)} />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  sportTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#E8E9F0',
    borderRadius: 999,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#9AA0B5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6E7280',
  },
  segmentTextActive: {
    color: '#14121F',
  },
  summaryCard: {
    gap: 12,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14121F',
  },
  summaryCount: {
    fontSize: 12,
    color: '#6E7280',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
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
    fontSize: 12,
    color: '#6E7280',
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
    marginTop: 4,
  },
  listGap: {
    gap: 10,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FDEBEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#E5484D',
  },
  playerBody: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#14121F',
  },
  playerMeta: {
    fontSize: 12,
    color: '#6E7280',
  },
  triggerWrap: {
    backgroundColor: '#F0F1F5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  triggerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E5484D',
  },
  score: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E5484D',
    minWidth: 30,
    textAlign: 'right',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#14121F',
  },
  teamChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  noTeam: {
    fontSize: 13,
    color: '#6E7280',
  },
  rosterCard: {
    gap: 12,
  },
  rosterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rosterTeam: {
    fontSize: 17,
    fontWeight: '800',
    color: '#14121F',
  },
  rosterCounts: {
    flexDirection: 'row',
    gap: 6,
  },
  countPill: {
    minWidth: 26,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  countPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  rosterList: {
    gap: 2,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
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
  rosterName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#14121F',
  },
  rosterPos: {
    fontSize: 12,
    color: '#6E7280',
    width: 30,
  },
  rosterScore: {
    fontSize: 15,
    fontWeight: '800',
  },
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  updatedText: {
    fontSize: 12,
    color: '#9AA0B5',
  },
});
