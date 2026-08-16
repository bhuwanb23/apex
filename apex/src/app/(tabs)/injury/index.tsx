import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useOnboarding } from '@/context/onboarding';
import { useBackend } from '@/context/backend';
import { AppHeader } from '@/components/app-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { DistributionBar } from '@/components/ui/bar';
import { ZoneBadge, type Zone } from '@/components/ui/badge';
import { AppIcon } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton, SkeletonCard, SkeletonRow } from '@/components/ui/skeleton';
import { SPORT_BY_ID, type SportId } from '@/data/mock/sports';
import { type Player } from '@/data/mock/players';
import { useLeaguePlayers, useTeamRoster, useTeams } from '@/data/live/injury';
import { formatRiskScore } from '@/lib/format';
import { DataFreshness } from '@/components/ui/data-freshness';

export default function InjuryDashboardScreen() {
  const router = useRouter();
  const { activeSport } = useOnboarding();
  const { status } = useBackend();
  const [sport, setSport] = useState<SportId>(activeSport);
  const [view, setView] = useState<'league' | 'team'>('league');

  // Follow the stored sport when it changes (e.g. the Home badge) so this
  // already-mounted tab re-requests with the new sport filter. Guarded
  // render-time adjustment (React's documented pattern), not setState-in-effect.
  const [prevActiveSport, setPrevActiveSport] = useState<SportId>(activeSport);
  if (prevActiveSport !== activeSport) {
    setPrevActiveSport(activeSport);
    setSport(activeSport);
  }
  const [teamQuery, setTeamQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftTeam, setDraftTeam] = useState<string | null>(null);

  const league = useLeaguePlayers(sport);
  const sportPlayers = league.players;
  const redCount = league.counts.red;
  const yellowCount = league.counts.yellow;
  const greenCount = league.counts.green;
  const topRed = sportPlayers.filter(p => p.zone === 'red').slice(0, 5);

  // Real backend team names drive the team picker (mock names like "Chiefs"
  // don't exist in the DB — fix #4); fall back to the demo list when offline.
  const liveTeams = useTeams(sport);
  const teamNames = liveTeams.data.map(t => t.name);
  const activeTeam = selectedTeam ?? teamNames[0] ?? SPORT_BY_ID[sport].teams[0] ?? null;

  // Team view hits the backend team endpoint directly — the full roster with
  // every player's zone (green included), not the league alert list.
  const team = useTeamRoster(activeTeam ?? undefined, sport);
  const roster = team.players;
  const filteredRoster = roster.filter(p => p.name.toLowerCase().includes(teamQuery.toLowerCase()));

  const refresh = () => {
    setRefreshing(true);
    league.refetch({ recalculate: true });
    team.refetch({ recalculate: true });
    setTimeout(() => setRefreshing(false), 900);
  };

  const lastUpdated = view === 'league' ? league.lastUpdated : team.lastUpdated;

  // Backend confirmed offline → skip skeletons, show fallback data immediately.
  const backendOffline = status === 'offline';
  const showLeagueSkeleton = league.loading && !backendOffline;
  const showTeamSkeleton = team.loading && !backendOffline;

  const selectSport = (id: SportId) => {
    setSport(id);
    setSelectedTeam(null);
    setTeamQuery('');
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#5856D6" colors={['#5856D6']} />
      }>
      <AppHeader
        title="Injury Risk"
        subtitle="Workload & recovery risk"
        activeSport={sport}
        onSelectSport={selectSport}
        right={
          <Pressable onPress={refresh} hitSlop={10} style={styles.headerAction} accessibilityRole="button" accessibilityLabel="Refresh risk scores">
            <AppIcon name="refresh" size={18} color="#5856D6" />
          </Pressable>
        }
      />

      {/* View toggle */}
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
        league.error != null && !backendOffline ? (
          <ErrorState message="Could not load injury data" onRetry={league.refetch} />
        ) : showLeagueSkeleton ? (
          <>
            {/* Summary card skeleton */}
            <SkeletonCard lines={4} />
            <Text style={styles.sectionLabel}>Top red zone players</Text>
            <View style={styles.listGap}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          </>
        ) : (
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
        )
      ) : team.error != null && !backendOffline ? (
        <ErrorState message="Could not load the team roster" onRetry={team.refetch} />
      ) : showTeamSkeleton ? (
        <>
          <Card style={styles.rosterCard}>
            <Skeleton width="55%" height={18} radius={6} />
            {/* Team summary bar skeleton */}
            <View style={styles.summaryBar}>
              <Skeleton width={34} height={24} radius={6} />
              <Skeleton width={34} height={24} radius={6} />
              <Skeleton width={34} height={24} radius={6} />
            </View>
            <View style={styles.rosterList}>
              {[0, 1, 2, 3, 4].map(i => (
                <Skeleton key={i} height={44} radius={10} />
              ))}
            </View>
          </Card>
        </>
      ) : (
        <>
          <View style={styles.searchRow}>
            <View style={styles.searchBar}>
              <AppIcon name="magnifyingglass" size={16} color="#9AA0B5" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search players…"
                placeholderTextColor="#9AA0B5"
                value={teamQuery}
                onChangeText={setTeamQuery}
              />
            </View>
            <Pressable
              style={styles.filterBtn}
              onPress={() => {
                setDraftTeam(activeTeam);
                setPickerOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Filter by team">
              <AppIcon name="slider.horizontal.3" size={18} color="#5856D6" />
            </Pressable>
          </View>

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
                {filteredRoster.map(player => (
                  <Pressable
                    key={player.id}
                    onPress={() => router.push({ pathname: '/injury/player', params: { playerId: player.id } })}>
                    <RosterRow player={player} />
                  </Pressable>
                ))}
                {filteredRoster.length === 0 ? (
                  <View style={styles.emptyRoster}>
                    <Text style={styles.emptyRosterText}>No players match “{teamQuery}”</Text>
                  </View>
                ) : null}
              </View>
            )}
          </Card>
        </>
      )}

      {/* Team picker — single-select radio list, Apply to confirm */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Filter by team</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <AppIcon name="xmark" size={16} color="#6E7280" />
              </Pressable>
            </View>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              {teamNames.map(team => {
                const selected = draftTeam === team;
                return (
                  <Pressable
                    key={team}
                    style={styles.pickerRow}
                    onPress={() => setDraftTeam(team)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}>
                    <Text style={[styles.pickerTeam, selected && styles.pickerTeamActive]}>{team}</Text>
                    <View style={[styles.radio, selected && styles.radioActive]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              style={styles.applyBtn}
              onPress={() => {
                if (draftTeam) setSelectedTeam(draftTeam);
                setPickerOpen(false);
              }}
              accessibilityRole="button">
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
      <Text style={[styles.score, { color: zoneColor }]}>{formatRiskScore(player.riskScore)}</Text>
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
      <Text style={[styles.rosterScore, { color }]}>{formatRiskScore(player.riskScore)}</Text>
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
  headerAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBar: {
    flex: 1,
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
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,18,31,0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    gap: 14,
    maxHeight: '75%',
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D5D7E0',
    alignSelf: 'center',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#14121F',
  },
  pickerList: {
    flexGrow: 0,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F1F5',
  },
  pickerTeam: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#14121F',
  },
  pickerTeamActive: {
    color: '#5856D6',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#C6C8D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: '#5856D6',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#5856D6',
  },
  applyBtn: {
    backgroundColor: '#5856D6',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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
