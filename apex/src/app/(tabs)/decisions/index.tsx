import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { AppIcon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton, SkeletonGames } from '@/components/ui/skeleton';
import { SPORTS, type SportId } from '@/data/mock/sports';
import { type Coach } from '@/data/mock/coaches';
import { useRecentGames } from '@/data/live/games';
import { formatPercent } from '@/lib/format';
import { useCoachLeaderboard } from '@/data/live/decisions';
import { useOnboarding } from '@/context/onboarding';
import { useBackend } from '@/context/backend';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { DataFreshness } from '@/components/ui/data-freshness';
import { api, type SportInfo } from '@/lib/api';

const DECISION_TYPES = ['All', '4th Down', 'Timeout', '2-Point'];
const GAME_TYPES = ['Regular', 'Playoff', 'All'];

const DECISION_TYPE_KEYS: Record<string, string> = {
  All: 'all',
  '4th Down': '4th_down',
  Timeout: 'timeout',
  '2-Point': '2pt',
};
const GAME_TYPE_KEYS: Record<string, string> = {
  Regular: 'regular',
  Playoff: 'playoff',
  All: 'all',
};

/** Real seasons come from the backend (each sport has a current season — the
 *  old hardcoded '2025-26' matched nothing and the board fell back to demo).
 *  The result is stored alongside the sport it belongs to, so a sport switch
 *  shows no chips until the fresh fetch lands (no synchronous setState). */
function useBackendSeasons(sport: SportId): string[] {
  const [result, setResult] = useState<{ sport: SportId; seasons: string[] }>({ sport, seasons: [] });
  useEffect(() => {
    let cancelled = false;
    api
      .sports()
      .then(res => {
        if (cancelled) return;
        // Each sport knows its current season; the chip list is that sport's
        // season plus any other seasons the backend has scorecards for.
        // Multiple sports share season labels (e.g. '2026'), so dedupe — the
        // chips are keyed by the season string and duplicates would collide.
        const current = res.sports.find((s: SportInfo) => s.name === sport)?.season;
        if (!current) return;
        const others = res.sports
          .map((s: SportInfo) => s.season)
          .filter((s: string): s is string => Boolean(s) && s !== current);
        const unique = [...new Set([current, ...others])];
        setResult({ sport, seasons: unique.slice(0, 3) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sport]);
  return result.sport === sport ? result.seasons : [];
}

export default function CoachLeaderboardScreen() {
  const router = useRouter();
  const { activeSport } = useOnboarding();
  const { status } = useBackend();
  // Sport comes from device storage (the plan's rule) — the leaderboard
  // follows the user's selected sport on load and when it changes. The chips
  // below remain a per-screen browse override until the sport changes again.
  const [sport, setSport] = useState<SportId>(activeSport);
  const seasons = useBackendSeasons(sport);
  const [season, setSeason] = useState<string | undefined>(undefined);
  const [decisionType, setDecisionType] = useState('All');
  const [gameType, setGameType] = useState('All');
  const [query, setQuery] = useState('');
  // Filter popup (the search + filter pattern used across the app). Draft
  // values only apply on "Apply".
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftSeason, setDraftSeason] = useState<string | undefined>(undefined);
  const [draftDecisionType, setDraftDecisionType] = useState('All');
  const [draftGameType, setDraftGameType] = useState('All');

  // Follow the stored sport when it changes (e.g. the Home badge) without a
  // setState-in-effect — the guarded render-time adjustment is the React-
  // documented pattern for syncing state to a changing prop/context value.
  const [prevActiveSport, setPrevActiveSport] = useState<SportId>(activeSport);
  if (prevActiveSport !== activeSport) {
    setPrevActiveSport(activeSport);
    setSport(activeSport);
  }

  // Season is per-sport — reset to "current" when the sport changes.
  const pickSport = (id: SportId) => {
    setSport(id);
    setSeason(undefined);
  };

  const { coaches, generatedAt, loading, error, refetch: refetchLeaderboard } = useCoachLeaderboard(sport, {
    season,
    decisionType: DECISION_TYPE_KEYS[decisionType],
    gameType: GAME_TYPE_KEYS[gameType],
  });
  // Game decision reviews — live recent games for the sport (fix #13: the old
  // hardcoded DECISION_GAMES were NFL-only mock rows that never changed).
  const recentGames = useRecentGames(sport, 8);
  const reviewGames = recentGames.data;
  // Coach name search — live local filter over the fetched board (the plan's
  // "filtering happens locally, no new backend request" behavior).
  const searched = useMemo(
    () => coaches.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase())),
    [coaches, query]
  );
  const podium = searched.slice(0, 3);
  const rest = searched.slice(3);

  /** Open the filter sheet seeded with the currently applied values. */
  const openPicker = () => {
    setDraftSeason(season);
    setDraftDecisionType(decisionType);
    setDraftGameType(gameType);
    setPickerOpen(true);
  };

  /** Apply the draft filter choices and close the sheet. */
  const applyPicker = () => {
    setSeason(draftSeason);
    setDecisionType(draftDecisionType);
    setGameType(draftGameType);
    setPickerOpen(false);
  };

  // Backend confirmed offline → skip skeletons, show fallback data immediately.
  const backendOffline = status === 'offline';
  const showBoardSkeleton = loading && !backendOffline;
  const showGamesSkeleton = recentGames.loading && !backendOffline;
  // Pull-to-refresh re-runs the leaderboard and the game reviews together.
  const { refreshControl } = usePullRefresh(() => {
    refetchLeaderboard();
    recentGames.refetch();
  });

  return (
    <Screen refreshControl={refreshControl}>
      <StackHeader title="Coach Leaderboard" subtitle="Decision quality · EV Rate" />

      {/* Data freshness — the plan's tiers (note for 1-6h, banner for 6h+) */}
      {generatedAt ? <DataFreshness timestamp={generatedAt} onRefresh={refetchLeaderboard} /> : null}

      {/* Sport tabs */}
      <View style={styles.sportTabs}>
        {SPORTS.map(s => (
          <Chip key={s.id} label={s.short} small selected={sport === s.id} onPress={() => pickSport(s.id)} />
        ))}
      </View>

      {/* Search + filter button */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <AppIcon name="magnifyingglass" size={16} color="#9AA0B5" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search coaches…"
            placeholderTextColor="#9AA0B5"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <Pressable
          style={styles.filterBtn}
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel="Filter leaderboard">
          <AppIcon name="slider.horizontal.3" size={18} color="#5856D6" />
        </Pressable>
      </View>

      {/* Count banner — active filter summary + filter shortcut */}
      <View style={styles.countBanner}>
        <Text style={styles.countText}>
          {showBoardSkeleton ? 'Loading leaderboard…' : `${searched.length} coach${searched.length === 1 ? '' : 'es'}`}
        </Text>
        <Pressable style={styles.bannerFilterBtn} onPress={openPicker} accessibilityRole="button" accessibilityLabel="Open filters">
          <AppIcon name="slider.horizontal.3" size={13} color="#FFFFFF" />
          <Text style={styles.bannerFilterText}>{activeFilterLabel(season, decisionType, gameType)}</Text>
        </Pressable>
      </View>

      {error != null && !backendOffline ? (
        <ErrorState message={`Could not load the ${sport} coach leaderboard`} onRetry={refetchLeaderboard} />
      ) : showBoardSkeleton ? (
        <>
          {/* Podium skeleton — same layout as the real podium */}
          <View style={styles.podiumRow}>
            <PodiumSkeleton height={96} />
            <PodiumSkeleton height={132} />
            <PodiumSkeleton height={96} />
          </View>

          {/* Full list skeleton */}
          <Card style={styles.listCard} padded={false}>
            {[0, 1, 2, 3, 4].map(i => (
              <View key={i} style={[styles.row, i !== 4 && styles.rowBorder]}>
                <Skeleton width={22} height={14} radius={4} />
                <View style={styles.rowBody}>
                  <Skeleton width="70%" height={13} radius={6} />
                  <Skeleton width="45%" height={10} radius={5} />
                </View>
                <Skeleton width={38} height={11} radius={5} />
                <Skeleton width={44} height={15} radius={5} />
                <Skeleton width={14} height={14} radius={7} />
              </View>
            ))}
          </Card>
        </>
      ) : searched.length === 0 ? (
        <EmptyState
          icon={query.trim() ? 'magnifyingglass' : 'trophy.fill'}
          title={
            query.trim()
              ? `No coaches match “${query.trim()}”`
              : `No coach data for ${sport} · ${season ?? 'current season'}`
          }
          subtitle={
            query.trim()
              ? 'Try a different name, or clear the search.'
              : 'Decision grades are available once a season has enough games analyzed.'
          }
          accent="#5856D6"
        />
      ) : (
        <>
          {/* Podium */}
          <View style={styles.podiumRow}>
            <PodiumSpot coach={podium[1]} rank={2} onPress={() => open(router, podium[1])} />
            <PodiumSpot coach={podium[0]} rank={1} onPress={() => open(router, podium[0])} />
            <PodiumSpot coach={podium[2]} rank={3} onPress={() => open(router, podium[2])} />
          </View>

          {/* Full list */}
          <Card style={styles.listCard} padded={false}>
            {rest.map((coach, i) => (
              <Pressable key={coach.id} onPress={() => open(router, coach)}>
                <View style={[styles.row, i !== rest.length - 1 && styles.rowBorder]}>
                  <Text style={styles.rank}>{coach.rank}</Text>
                  <View style={styles.rowBody}>
                    <Text style={styles.coachName}>{coach.name}</Text>
                    <Text style={styles.coachTeam}>
                      {coach.team} · {coach.sport}
                    </Text>
                  </View>
                  <Text style={styles.decisions}>{coach.totalDecisions} dec.</Text>
                  <Text style={[styles.evRate, { color: evColor(coach.evRate) }]}>{formatPercent(coach.evRate)}</Text>
                  <TrendArrow trend={coach.trend} />
                </View>
              </Pressable>
            ))}
          </Card>
        </>
      )}

      <View style={styles.note}>
        <AppIcon name="info.circle.fill" size={13} color="#9AA0B5" />
        <Text style={styles.noteText}>EV Rate measures how often a coach chose the statistically optimal decision</Text>
      </View>

      {/* Filter sheet — season / decision type / game type, Apply to confirm */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Filter leaderboard</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <AppIcon name="xmark" size={16} color="#6E7280" />
              </Pressable>
            </View>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              <Text style={styles.pickerSection}>Season</Text>
              <PickerRow
                label="Current season"
                selected={draftSeason === undefined}
                onPress={() => setDraftSeason(undefined)}
              />
              {seasons.map(se => (
                <PickerRow key={`season-${se}`} label={se} selected={draftSeason === se} onPress={() => setDraftSeason(se)} />
              ))}

              <Text style={styles.pickerSection}>Decision type</Text>
              {DECISION_TYPES.map(dt => (
                <PickerRow
                  key={`dt-${dt}`}
                  label={dt}
                  selected={draftDecisionType === dt}
                  onPress={() => setDraftDecisionType(dt)}
                />
              ))}

              <Text style={styles.pickerSection}>Game type</Text>
              {GAME_TYPES.map(gt => (
                <PickerRow
                  key={`gt-${gt}`}
                  label={gt === 'All' ? 'All game types' : gt}
                  selected={draftGameType === gt}
                  onPress={() => setDraftGameType(gt)}
                />
              ))}
            </ScrollView>
            <Pressable style={styles.applyBtn} onPress={applyPicker} accessibilityRole="button">
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Game reviews — live recent games for the sport */}
      <View>
        <Text style={styles.gameSectionTitle}>Game decision reviews</Text>
        {showGamesSkeleton ? (
          <SkeletonGames />
        ) : reviewGames.length === 0 ? (
          <View style={styles.noGamesRow}>
            <AppIcon name="gamecontroller.fill" size={15} color="#9AA0B5" />
            <Text style={styles.noGamesText}>No recent {sport} games to review yet</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gameRow}>
            {reviewGames.map(game => (
              <Pressable key={game.id} onPress={() => router.push({ pathname: '/decisions/game', params: { gameId: game.id } })}>
                <Card style={styles.gameCard}>
                  <Text style={styles.gameDate}>{game.date}</Text>
                  <Text style={styles.gameTeams} numberOfLines={1}>
                    {game.homeTeam} {game.homeScore} – {game.awayScore} {game.awayTeam}
                  </Text>
                  <View style={styles.gameMetaRow}>
                    <Text style={styles.gameMetaText}>
                      {game.homeEvRate > 0 || game.awayEvRate > 0
                        ? `${game.homeEvRate}% vs ${game.awayEvRate}% EV rate`
                        : `${game.sport} · review decisions`}
                    </Text>
                    <AppIcon name="chevron.right" size={13} color="#9AA0B5" />
                  </View>
                </Card>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

function open(router: ReturnType<typeof useRouter>, coach: Coach) {
  router.push({ pathname: '/decisions/coach', params: { coachId: coach.id } });
}

/** Compact summary of the active filters for the banner pill. */
function activeFilterLabel(season: string | undefined, decisionType: string, gameType: string): string {
  const parts: string[] = [];
  parts.push(season ?? 'Current season');
  parts.push(decisionType === 'All' ? 'All decisions' : decisionType);
  parts.push(gameType === 'All' ? 'All games' : gameType);
  return parts.join(' · ');
}

/** One radio row in the filter sheet — purple dot + label when selected. */
function PickerRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.pickerRow} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      <Text style={[styles.pickerRowText, selected && styles.pickerRowTextActive]}>{label}</Text>
      <View style={[styles.radio, selected && styles.radioActive]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

function PodiumSpot({ coach, rank, onPress }: { coach: Coach; rank: 1 | 2 | 3; onPress: () => void }) {
  const height = rank === 1 ? 132 : 96;
  const medal = rank === 1 ? '#D9A21B' : rank === 2 ? '#9AA0B5' : '#C98A5E';
  return (
    <Pressable style={styles.podiumSpot} onPress={onPress}>
      <View style={styles.podiumAvatarWrap}>
        <View style={[styles.podiumAvatar, { backgroundColor: rank === 1 ? '#EFEEFB' : '#F0F1F5' }]}>
          <Text style={[styles.podiumInitial, { color: rank === 1 ? '#5856D6' : '#6E7280' }]}>
            {coach.name.split(' ').map(w => w[0]).join('')}
          </Text>
        </View>
        <View style={[styles.medal, { backgroundColor: medal }]}>
          <Text style={styles.medalText}>{rank}</Text>
        </View>
      </View>
      <Text style={styles.podiumName} numberOfLines={1}>
        {coach.name.split(' ').pop()}
      </Text>
      <Text style={styles.podiumTeam}>{coach.team}</Text>
      <View style={[styles.podiumBar, { height, backgroundColor: rank === 1 ? '#5856D6' : '#B9B4F0' }]}>
        <Text style={styles.podiumRate}>{formatPercent(coach.evRate)}</Text>
      </View>
    </Pressable>
  );
}

/** Podium-shaped skeleton — avatar + name/team lines + a tall bar. */
function PodiumSkeleton({ height }: { height: number }) {
  return (
    <View style={styles.podiumSpot}>
      <View style={styles.podiumAvatarWrap}>
        <Skeleton width={54} height={54} radius={27} />
      </View>
      <Skeleton width={54} height={12} radius={6} />
      <Skeleton width={40} height={10} radius={5} />
      <View style={[styles.podiumSkeletonBar, { height }]}>
        <Skeleton width={34} height={13} radius={6} />
      </View>
    </View>
  );
}

function TrendArrow({ trend }: { trend: Coach['trend'] }) {
  if (trend === 'flat') return <Text style={styles.flatTrend}>—</Text>;
  return <AppIcon name={trend === 'up' ? 'arrow.up.right' : 'arrow.down.right'} size={15} color={trend === 'up' ? '#2FA36B' : '#E5484D'} />;
}

function evColor(rate: number): string {
  if (rate >= 70) return '#1F8A52';
  if (rate >= 50) return '#B7791F';
  return '#E5484D';
}

const styles = StyleSheet.create({
  sportTabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
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
  bannerFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 28,
  },
  bannerFilterText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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
    gap: 12,
    maxHeight: '80%',
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
  pickerSection: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9AA0B5',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 2,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F1F5',
  },
  pickerRowText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#14121F',
  },
  pickerRowTextActive: {
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
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  podiumSpot: {
    flex: 1,
    alignItems: 'center',
  },
  podiumAvatarWrap: {
    position: 'relative',
  },
  podiumAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  podiumInitial: {
    fontSize: 16,
    fontWeight: '800',
  },
  medal: {
    position: 'absolute',
    top: -4,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  podiumName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#14121F',
  },
  podiumTeam: {
    fontSize: 11,
    color: '#6E7280',
    marginBottom: 8,
  },
  podiumBar: {
    width: 84,
    borderRadius: 14,
    alignItems: 'center',
    paddingTop: 8,
  },
  podiumRate: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  podiumSkeletonBar: {
    width: 84,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    backgroundColor: '#E4E5EC',
  },
  listCard: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F1F5',
  },
  rank: {
    width: 26,
    fontSize: 15,
    fontWeight: '800',
    color: '#9AA0B5',
    textAlign: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 1,
  },
  coachName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#14121F',
  },
  coachTeam: {
    fontSize: 12,
    color: '#6E7280',
  },
  decisions: {
    fontSize: 12,
    color: '#9AA0B5',
    fontWeight: '600',
  },
  evRate: {
    fontSize: 17,
    fontWeight: '800',
    minWidth: 52,
    textAlign: 'right',
  },
  flatTrend: {
    color: '#9AA0B5',
    fontSize: 14,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 4,
  },
  noteText: {
    flex: 1,
    fontSize: 11.5,
    color: '#9AA0B5',
    lineHeight: 16,
  },
  gameSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
  },
  gameRow: {
    gap: 12,
    paddingRight: 8,
  },
  noGamesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  noGamesText: {
    fontSize: 13,
    color: '#6E7280',
    fontWeight: '600',
  },
  gameCard: {
    width: 210,
    gap: 6,
  },
  gameDate: {
    fontSize: 11.5,
    color: '#6E7280',
    fontWeight: '600',
  },
  gameTeams: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#14121F',
  },
  gameMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gameMetaText: {
    fontSize: 11.5,
    color: '#9AA0B5',
  },
});
