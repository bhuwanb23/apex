import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { LineChart, type ChartPoint, type ChartMarker } from '@/components/ui/chart';
import { Slider } from '@/components/ui/slider';
import { AppIcon } from '@/components/ui/icon';
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { GAMES, type Game } from '@/data/mock/games';
import { useRecentGames } from '@/data/live/games';
import { useGameMomentum } from '@/data/live/momentum';
import { useOnboarding } from '@/context/onboarding';
import { useBackend } from '@/context/backend';
import { usePullRefresh } from '@/hooks/use-pull-refresh';

const MAX_MOMENTUM = 70; // clamp chart domain to ±70 for readability

export default function GameReplayScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { activeSport } = useOnboarding();
  const { status } = useBackend();
  const [selectedId, setSelectedId] = useState(gameId ?? GAMES[0].id);
  const [progress, setProgress] = useState(1); // 0..1 through the game
  const [playing, setPlaying] = useState(false);
  const [gameQuery, setGameQuery] = useState('');
  const [peaksOpen, setPeaksOpen] = useState(true);

  // Playback interval lives in a ref so pause actually stops it and leaving
  // the screen clears it (previously pause only flipped state and re-press
  // stacked a second interval — the scrubber never stopped).
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: gameData, loading, error, refetch: refetchGameMomentum } = useGameMomentum(selectedId, activeSport);
  const game = gameData ?? GAMES.find(g => g.id === selectedId) ?? GAMES[0];
  const lastTime = game.timeline[game.timeline.length - 1].time;
  // Real recent games for the sport fill the picker (fix #13 — the old mock
  // GAMES list never changed); mock games remain the offline fallback.
  const recentGames = useRecentGames(activeSport, 10);
  const pickerGames = recentGames.data;
  const filteredGames = pickerGames.filter(g =>
    (g.homeTeam + ' ' + g.awayTeam).toLowerCase().includes(gameQuery.toLowerCase())
  );

  const interpAt = (key: 'home' | 'away', time: number): number => {
    const pts = game.timeline;
    if (time <= pts[0].time) return pts[0][key];
    if (time >= pts[pts.length - 1].time) return pts[pts.length - 1][key];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (time >= a.time && time <= b.time) {
        const t = (time - a.time) / Math.max(1, b.time - a.time);
        return a[key] + t * (b[key] - a[key]);
      }
    }
    return pts[pts.length - 1][key];
  };

  const normY = (value: number) =>
    0.5 - Math.max(-MAX_MOMENTUM, Math.min(MAX_MOMENTUM, value)) / (2 * MAX_MOMENTUM);

  const series = useMemo<{ name: string; color: string; points: ChartPoint[] }[]>(
    () => [
      { name: game.homeTeam, color: '#5856D6', points: game.timeline.map(p => ({ x: p.time / lastTime, y: normY(p.home) })) },
      { name: game.awayTeam, color: '#FF5C8A', points: game.timeline.map(p => ({ x: p.time / lastTime, y: normY(p.away) })) },
    ],
    [game, lastTime]
  );

  const markers = useMemo<ChartMarker[]>(
    () =>
      game.events.map(ev => ({
        x: ev.time / lastTime,
        y: normY(interpAt(ev.team, ev.time)),
        color: ev.team === 'home' ? '#5856D6' : '#FF5C8A',
        selected: Math.abs(progress - ev.time / lastTime) < 0.02,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, lastTime, progress]
  );

  // Backend confirmed offline → skip skeletons, show fallback data immediately.
  const backendOffline = status === 'offline';
  const showSkeleton = loading && !backendOffline;
  // Pull-to-refresh re-runs the selected game's timeline and the game picker.
  const { refreshControl } = usePullRefresh(() => {
    refetchGameMomentum();
    recentGames.refetch();
  });

  const currentTime = progress * lastTime;
  const homeMomentum = Math.round(interpAt('home', currentTime));
  const awayMomentum = Math.round(interpAt('away', currentTime));
  const leader = homeMomentum > awayMomentum ? 'home' : 'away';

  const pastEvents = game.events.filter(e => e.time <= currentTime);
  const lastEvent = pastEvents[pastEvents.length - 1];
  const currentLabel = nearestLabel(game, currentTime);

  const stopPlayback = () => {
    if (playTimer.current) {
      clearInterval(playTimer.current);
      playTimer.current = null;
    }
    setPlaying(false);
  };

  // Cleanup on unmount / game change so the interval never leaks.
  useEffect(() => stopPlayback, [selectedId]);

  const togglePlay = () => {
    if (playing) {
      stopPlayback();
      return;
    }
    setPlaying(true);
    playTimer.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 1) {
          stopPlayback();
          return 1;
        }
        return prev + 0.02;
      });
    }, 80);
  };

  const jumpTo = (time: number) => setProgress(time / lastTime);

  return (
    <Screen refreshControl={refreshControl}>
      <StackHeader title="Game Replay" subtitle="Momentum in motion" />

      {/* Game selector with search */}
      <View style={styles.searchBar}>
        <AppIcon name="magnifyingglass" size={15} color="#9AA0B5" />
        <TextInput
          style={styles.searchInput}
          placeholder="Find a game…"
          placeholderTextColor="#9AA0B5"
          value={gameQuery}
          onChangeText={setGameQuery}
        />
      </View>
      {filteredGames.length === 0 ? (
        <View style={styles.noGamesRow}>
          <AppIcon name="gamecontroller.fill" size={15} color="#9AA0B5" />
          <Text style={styles.noGamesText}>No games found — try another team or sport</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gameRow}>
          {filteredGames.map(g => (
            <ChipLabel
              key={g.id}
              label={`${g.homeTeam} vs ${g.awayTeam}`}
              date={g.date}
              selected={selectedId === g.id}
              onPress={() => {
                setSelectedId(g.id);
                setProgress(1);
              }}
            />
          ))}
        </ScrollView>
      )}

      {error != null && !backendOffline ? (
        <ErrorState message="Could not load this game's momentum timeline" onRetry={refetchGameMomentum} />
      ) : showSkeleton ? (
        <>
          {/* Game header skeleton */}
          <Card style={styles.headerCard}>
            <View style={styles.scoreRow}>
              <View style={styles.team}>
                <Skeleton width="70%" height={15} radius={6} />
                <Skeleton width={44} height={26} radius={6} />
              </View>
              <Skeleton width={44} height={10} radius={5} />
              <View style={[styles.team, styles.teamRight]}>
                <Skeleton width="70%" height={15} radius={6} />
                <Skeleton width={44} height={26} radius={6} />
              </View>
            </View>
          </Card>
          {/* Chart skeleton */}
          <Card style={styles.chartCard}>
            <View style={styles.legendRow}>
              <Skeleton width={70} height={12} radius={6} />
              <Skeleton width={70} height={12} radius={6} />
            </View>
            <Skeleton width="100%" height={190} radius={10} />
            <Skeleton width="100%" height={18} radius={9} />
            <View style={styles.playRow}>
              <Skeleton width={34} height={34} radius={17} />
              <Skeleton width={140} height={13} radius={6} />
            </View>
          </Card>
          {/* Current moment skeleton */}
          <SkeletonCard lines={3} />
          {/* Peaks skeleton */}
          <View>
            <Skeleton width={120} height={16} radius={6} />
            <View style={styles.listGap}>
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
            </View>
          </View>
        </>
      ) : (
        <>
          {/* Game header */}
          <Card style={styles.headerCard}>
            <View style={styles.scoreRow}>
              <View style={styles.team}>
                <Text style={styles.teamName}>{game.homeTeam}</Text>
                <Text style={[styles.teamScore, homeMomentum > awayMomentum && styles.teamScoreLead]}>{game.homeScore}</Text>
              </View>
              <Text style={styles.final}>{game.date}</Text>
              <View style={[styles.team, styles.teamRight]}>
                <Text style={styles.teamName}>{game.awayTeam}</Text>
                <Text style={[styles.teamScore, awayMomentum > homeMomentum && styles.teamScoreLead]}>{game.awayScore}</Text>
              </View>
            </View>
          </Card>

          {/* Momentum chart */}
          <Card style={styles.chartCard}>
            <View style={styles.legendRow}>
              <LegendDot color="#5856D6" label={game.homeTeam} />
              <LegendDot color="#FF5C8A" label={game.awayTeam} />
            </View>
            <LineChart
              series={series}
              height={190}
              gridLabels={['Q1', 'Q2', 'Q3', 'Q4']}
              yLabels={['+50', '0', '-50']}
              scrubber={progress}
              markers={markers}
              onMarkerPress={i => jumpTo(game.events[i].time)}
            />
            <Slider value={progress} min={0} max={1} step={0.01} onChange={setProgress} />
            <View style={styles.playRow}>
              <Pressable style={styles.playBtn} onPress={togglePlay}>
                <AppIcon name={playing ? 'pause.fill' : 'play.fill'} size={15} color="#FFFFFF" />
              </Pressable>
              <Text style={styles.playText}>{currentLabel}</Text>
              <Text style={styles.playHint}>Tap a dot on the chart to see what happened</Text>
            </View>
          </Card>

          {/* Current moment */}
          <Card style={styles.momentCard}>
            <View style={styles.momentTop}>
              <Text style={styles.momentLabel}>{currentLabel}</Text>
              <View style={styles.leaderBadge}>
                <AppIcon name="bolt.fill" size={11} color="#FFA058" />
                <Text style={styles.leaderText}>
                  {leader === 'home' ? game.homeTeam : game.awayTeam} has momentum
                </Text>
              </View>
            </View>
            <View style={styles.momentStats}>
              <MomentStat label="Home" value={homeMomentum} color="#5856D6" />
              <MomentStat label="Away" value={awayMomentum} color="#FF5C8A" />
              <MomentStat label="Score" value={`${scoreAt(game, currentTime)}`} color="#14121F" />
            </View>
            {lastEvent ? (
              <Text style={styles.lastEvent}>
                <Text style={styles.lastEventTime}>{lastEvent.label}: </Text>
                {lastEvent.description}
              </Text>
            ) : (
              <Text style={styles.lastEvent}>Nothing significant yet — momentum is building.</Text>
            )}
          </Card>

          {/* Peak moments (collapsible) */}
          <View>
            <Pressable style={styles.collapseHeader} onPress={() => setPeaksOpen(prev => !prev)}>
              <Text style={styles.sectionTitle}>Peak Moments</Text>
              <AppIcon name={peaksOpen ? 'chevron.down' : 'chevron.right'} size={16} color="#6E7280" />
            </Pressable>
            {peaksOpen ? (
              <View style={styles.listGap}>
                {[...game.events].sort((a, b) => b.swing - a.swing).map(event => (
                  <Pressable key={event.label} onPress={() => jumpTo(event.time)}>
                    <Card style={styles.peakCard}>
                      <View style={styles.peakLeft}>
                        <View style={[styles.peakIcon, { backgroundColor: event.team === 'home' ? '#EFEEFB' : '#FDEBEC' }]}>
                          <AppIcon name="bolt.fill" size={14} color={event.team === 'home' ? '#5856D6' : '#FF5C8A'} />
                        </View>
                        <View style={styles.peakBody}>
                          <Text style={styles.peakTime}>{event.label}</Text>
                          <Text style={styles.peakDesc}>{event.description}</Text>
                        </View>
                      </View>
                      <View style={styles.peakSwing}>
                        <Text style={[styles.peakSwingValue, { color: event.team === 'home' ? '#5856D6' : '#FF5C8A' }]}>
                          +{event.swing}
                        </Text>
                        <Text style={styles.peakSwingLabel}>swing</Text>
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {/* Summary stats */}
          <View>
            <Text style={styles.sectionTitle}>Momentum summary</Text>
            <View style={styles.summaryRow}>
              <SummaryBox value={`${game.momentumShifts}`} label="Momentum shifts" />
              <SummaryBox value={game.longestStreak.split(' · ')[1] ?? game.longestStreak} label="Longest streak" />
              <SummaryBox value={game.momentumLeader} label="Held momentum longest" />
            </View>
            <Text style={styles.verdict}>{game.verdict}</Text>
          </View>
        </>
      )}
    </Screen>
  );
}

function ChipLabel({ label, date, selected, onPress }: { label: string; date: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.gameChip, selected && styles.gameChipSelected]}>
      <Text style={[styles.gameChipText, selected && styles.gameChipTextSelected]}>{label}</Text>
      <Text style={[styles.gameChipDate, selected && styles.gameChipDateSelected]}>{date}</Text>
    </Pressable>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function MomentStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <View style={styles.momentStat}>
      <Text style={[styles.momentStatValue, { color }]}>{value}</Text>
      <Text style={styles.momentStatLabel}>{label}</Text>
    </View>
  );
}

function SummaryBox({ value, label }: { value: string; label: string }) {
  return (
    <Card style={styles.summaryBox}>
      <Text style={styles.summaryValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </Card>
  );
}

function nearestLabel(game: Game, time: number): string {
  let best = game.timeline[0];
  for (const p of game.timeline) {
    if (Math.abs(p.time - time) < Math.abs(best.time - time)) best = p;
  }
  return best.label;
}

function scoreAt(game: Game, time: number): string {
  const ratio = time / (game.timeline[game.timeline.length - 1].time || 1);
  const home = Math.round(game.homeScore * ratio);
  const away = Math.round(game.awayScore * ratio);
  return `${home} – ${away}`;
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#14121F',
  },
  gameRow: {
    gap: 8,
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
  gameChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 1,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  gameChipSelected: {
    backgroundColor: '#EFEEFB',
    borderColor: '#5856D6',
  },
  gameChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#14121F',
  },
  gameChipTextSelected: {
    color: '#5856D6',
  },
  gameChipDate: {
    fontSize: 10,
    color: '#9AA0B5',
  },
  gameChipDateSelected: {
    color: '#8E84E8',
  },
  headerCard: {
    alignItems: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  team: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  teamRight: {
    alignItems: 'center',
  },
  teamName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14121F',
  },
  teamScore: {
    fontSize: 26,
    fontWeight: '800',
    color: '#6E7280',
  },
  teamScoreLead: {
    color: '#14121F',
  },
  final: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9AA0B5',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chartCard: {
    gap: 14,
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
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#14121F',
  },
  playRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#5856D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#14121F',
  },
  playHint: {
    fontSize: 11.5,
    color: '#9AA0B5',
    marginLeft: 'auto',
  },
  momentCard: {
    gap: 12,
  },
  momentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  momentLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#5856D6',
  },
  leaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF4DF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  leaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B7791F',
  },
  momentStats: {
    flexDirection: 'row',
    gap: 10,
  },
  momentStat: {
    flex: 1,
    backgroundColor: '#F0F1F5',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    gap: 1,
  },
  momentStatValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  momentStatLabel: {
    fontSize: 11,
    color: '#6E7280',
  },
  lastEvent: {
    fontSize: 12.5,
    color: '#6E7280',
    lineHeight: 18,
  },
  lastEventTime: {
    fontWeight: '700',
    color: '#14121F',
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
  listGap: {
    gap: 10,
  },
  peakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  peakLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  peakIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peakBody: {
    flex: 1,
    gap: 2,
  },
  peakTime: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#14121F',
  },
  peakDesc: {
    fontSize: 11.5,
    color: '#6E7280',
    lineHeight: 16,
  },
  peakSwing: {
    alignItems: 'center',
    marginLeft: 8,
  },
  peakSwingValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  peakSwingLabel: {
    fontSize: 10,
    color: '#9AA0B5',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryBox: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#14121F',
  },
  summaryLabel: {
    fontSize: 10.5,
    color: '#6E7280',
    textAlign: 'center',
  },
  verdict: {
    fontSize: 12.5,
    color: '#6E7280',
    lineHeight: 18,
  },
});
