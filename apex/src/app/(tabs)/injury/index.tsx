import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useOnboarding } from '@/context/onboarding';
import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DistributionBar } from '@/components/ui/bar';
import { ZoneBadge, type Zone } from '@/components/ui/badge';
import { AppIcon } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SPORTS, SPORT_BY_ID, type SportId } from '@/data/mock/sports';
import { type Player } from '@/data/mock/players';
import { useLeaguePlayers, useTeamRoster } from '@/data/live/injury';
import { DataFreshness } from '@/components/ui/data-freshness';

export default function InjuryDashboardScreen() {
  const router = useRouter();
  const { activeSport } = useOnboarding();
  const [sport, setSport] = useState<SportId>(activeSport);
  const [view, setView] = useState<'league' | 'team'>('league');

  // Follow the stored sport when it changes (e.g. the Home badge) so this
  // already-mounted tab re-requests with the new sport filter.
  useEffect(() => {
    setSport(activeSport);
  }, [activeSport]);
  const [teamQuery, setTeamQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const league = useLeaguePlayers(sport);
  const sportPlayers = league.players;
  const redCount = league.counts.red;
  const yellowCount = league.counts.yellow;
  const greenCount = league.counts.green;
  const topRed = sportPlayers.filter(p => p.zone === 'red').slice(0, 5);

  const teamNames = SPORT_BY_ID[sport].teams;
  const activeTeam = selectedTeam ?? teamNames[0] ?? null;
  const filteredTeams = teamNames.filter(t => t.toLowerCase().includes(teamQuery.toLowerCase()));

  // Team view hits the backend team endpoint directly — the full roster with
  // every player's zone (green included), not the league alert list.
  const team = useTeamRoster(activeTeam ?? undefined, sport);
  const roster = team.players;

  const refresh = () => {
    setRefreshing(true);
    league.refetch({ recalculate: true });
    team.refetch({ recalculate: true });
    setTimeout(() => setRefreshing(false), 900);
  };

  const lastUpdated = view === 'league' ? league.lastUpdated : team.lastUpdated;

  const selectSport = (id: SportId) => {
    setSport(id);
    setSelectedTeam(null);
    setTeamQuery('');
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
      <View style={styles.sportTabs}>
        {SPORTS.map(s => (
          <Chip key={s.id} label={s.short} small selected={sport === s.id} onPress={() => selectSport(s.id)} />
        ))}
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
              <Text style={styles.summaryCount}>
                {redCount + yellowCount + greenCount} players tracked
              </Text>
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

          {sportPlayers.length === 0 ? (
            <EmptyState
              icon="heart.text.square.fill"
              title={`No player data for ${sport} yet`}
              subtitle="Risk scores appear here once game logs are available for this league."
              accent="#5856D6"
            />
          ) : (
            <>
              <Text style={styles.sectionLabel}>Top red zone players</Text>
              <View style={styles.listGap}>
                {topRed.map(player => (
                  <Pressable
                    key={player.id}
                    onPress={() => router.push({ pathname: '/injury/player', params: { playerId: player.id } })}>
                    <LeagueRow player={player} />
                  </Pressable>
                ))}
              </View>
              {topRed.length === 0 ? (
                <EmptyState
                  icon="checkmark"
                  title="No players in the red zone"
                  subtitle="Everyone in this league is within their normal workload range."
                />
              ) : null}
              <PillButton
                label={`View all ${redCount} red zone players`}
                variant="outline"
                onPress={() => router.push('/injury/alerts')}
              />
            </>
          )}
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

          {teamNames.length > 0 ? (
            <View style={styles.teamChips}>
              {filteredTeams.length > 0 ? (
                filteredTeams.map(team => (
                  <Chip key={team} label={team} small selected={activeTeam === team} onPress={() => setSelectedTeam(team)} />
                ))
              ) : (
                <Text style={styles.noTeam}>No team matches “{teamQuery}”</Text>
              )}
            </View>
          ) : null}

          <Card style={styles.rosterCard}>
            <View style={styles.rosterHeader}>
              <Text style={styles.rosterTeam}>{activeTeam ?? 'Select a team'}</Text>
              {activeTeam ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/injury/team', params: { team: activeTeam } })}
                  style={styles.reportLink}>
                  <Text style={styles.reportLinkText}>Full team report</Text>
                  <AppIcon name="chevron.right" size={13} color="#5856D6" />
                </Pressable>
              ) : null}
            </View>

            {/* Team summary bar */}
            <View style={styles.summaryBar}>
              <SummaryBlock label="Red" value={roster.filter(p => p.zone === 'red').length} color="#E5484D" />
              <SummaryBlock label="Yellow" value={roster.filter(p => p.zone === 'yellow').length} color="#F5A623" />
              <SummaryBlock label="Green" value={roster.filter(p => p.zone === 'green').length} color="#2FA36B" />
            </View>

            {roster.length === 0 ? (
              <View style={styles.emptyRoster}>
                <Text style={styles.emptyRosterText}>No players tracked for this team yet</Text>
              </View>
            ) : (
              <View style={styles.rosterList}>
                {roster.map(player => (
                  <Pressable
                    key={player.id}
                    onPress={() => router.push({ pathname: '/injury/player', params: { playerId: player.id } })}>
                    <RosterRow player={player} />
                  </Pressable>
                ))}
              </View>
            )}
          </Card>
        </>
      )}

      {/* Data freshness — the plan's tiers: gray note for 1-6h, yellow/orange/red banner for 6h+ */}
      {lastUpdated ? <DataFreshness timestamp={lastUpdated} onRefresh={refresh} /> : null}
      <Pressable onPress={refresh} style={styles.updatedRow}>
        <AppIcon name="clock.fill" size={13} color="#9AA0B5" />
        <Text style={styles.updatedText}>
          {refreshing ? 'Refreshing risk scores…' : 'Tap to force refresh'}
        </Text>
      </Pressable>
    </Screen>
  );
}

/** League-view row: avatar, name/team, zone badge, trigger chip, colored score. */
function LeagueRow({ player }: { player: Player }) {
  const zoneColor = player.zone === 'red' ? '#E5484D' : player.zone === 'yellow' ? '#F5A623' : '#2FA36B';
  return (
    <Card style={styles.playerRow}>
      <View style={[styles.avatar, { backgroundColor: `${zoneColor}16` }]}>
        <Text style={[styles.avatarText, { color: zoneColor }]}>{player.lastName.slice(0, 1)}</Text>
      </View>
      <View style={styles.playerBody}>
        <Text style={styles.playerName}>{player.name}</Text>
        <Text style={styles.playerMeta}>
          {player.team} · {player.position}
        </Text>
        <View style={styles.playerTags}>
          <ZoneBadge zone={player.zone as Zone} />
          <View style={[styles.triggerChip, { backgroundColor: `${zoneColor}12` }]}>
            <Text style={[styles.triggerText, { color: zoneColor }]}>{player.triggerMetric}</Text>
          </View>
        </View>
      </View>
      <Text style={[styles.score, { color: zoneColor }]}>{player.riskScore}</Text>
    </Card>
  );
}

/** Team-view row: traffic-light dot, jersey, name, position, trigger, score. */
function RosterRow({ player }: { player: Player }) {
  const color =
    player.zone === 'red' ? '#E5484D' : player.zone === 'yellow' ? '#F5A623' : player.zone === 'green' ? '#2FA36B' : '#9AA0B5';
  return (
    <View style={styles.rosterRow}>
      <View style={[styles.zoneDot, { backgroundColor: color }]} />
      <Text style={styles.jersey}>{player.jersey}</Text>
      <View style={styles.rosterBody}>
        <Text style={styles.rosterName}>{player.name}</Text>
        <Text style={styles.rosterPos}>{player.position}</Text>
      </View>
      {player.zone !== 'green' ? (
        <View style={[styles.triggerChip, { backgroundColor: `${color}12` }]}>
          <Text style={[styles.triggerText, { color }]}>{player.triggerMetric}</Text>
        </View>
      ) : null}
      <Text style={[styles.rosterScore, { color }]}>{player.riskScore}</Text>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function SummaryBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.summaryBlock}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sportTabs: {
    flexDirection: 'row',
    justifyContent: 'center',
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 17,
    fontWeight: '800',
  },
  playerBody: {
    flex: 1,
    gap: 3,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14121F',
  },
  playerMeta: {
    fontSize: 12,
    color: '#6E7280',
  },
  playerTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  triggerChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  triggerText: {
    fontSize: 11,
    fontWeight: '700',
  },
  score: {
    fontSize: 20,
    fontWeight: '800',
    minWidth: 34,
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
    gap: 14,
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
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reportLinkText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#5856D6',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#F0F1F5',
    borderRadius: 14,
    paddingVertical: 10,
  },
  summaryBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#6E7280',
    fontWeight: '600',
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
  rosterBody: {
    flex: 1,
    gap: 1,
  },
  rosterName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#14121F',
  },
  rosterPos: {
    fontSize: 11.5,
    color: '#6E7280',
  },
  rosterScore: {
    fontSize: 15,
    fontWeight: '800',
  },
  emptyRoster: {
    padding: 24,
    alignItems: 'center',
  },
  emptyRosterText: {
    fontSize: 13,
    color: '#6E7280',
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
