import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { AppIcon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/empty-state';
import { SPORTS, type SportId } from '@/data/mock/sports';
import { type Coach } from '@/data/mock/coaches';
import { DECISION_GAMES } from '@/data/mock/games';
import { useCoachLeaderboard } from '@/data/live/decisions';
import { useOnboarding } from '@/context/onboarding';

const DECISION_TYPES = ['All', '4th Down', 'Timeout', '2-Point'];
const GAME_TYPES = ['Regular', 'Playoff', 'All'];
const SEASONS = ['2025-26', '2024-25'];

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

export default function CoachLeaderboardScreen() {
  const router = useRouter();
  const { activeSport } = useOnboarding();
  // Sport comes from device storage (the plan's rule) — the leaderboard
  // follows the user's selected sport on load and when it changes. The chips
  // below remain a per-screen browse override until the sport changes again.
  const [sport, setSport] = useState<SportId>(activeSport);
  const [season, setSeason] = useState(SEASONS[0]);
  const [decisionType, setDecisionType] = useState('All');
  const [gameType, setGameType] = useState('All');

  useEffect(() => {
    setSport(activeSport);
  }, [activeSport]);

  const { coaches } = useCoachLeaderboard(sport, {
    season,
    decisionType: DECISION_TYPE_KEYS[decisionType],
    gameType: GAME_TYPE_KEYS[gameType],
  });
  const podium = coaches.slice(0, 3);
  const rest = coaches.slice(3);

  return (
    <Screen>
      <StackHeader title="Coach Leaderboard" subtitle="Decision quality · EV Rate" />

      {/* Filters */}
      <View style={styles.filters}>
        <View style={styles.chipRow}>
          {SPORTS.map(s => (
            <Chip key={s.id} label={s.short} small selected={sport === s.id} onPress={() => setSport(s.id)} />
          ))}
        </View>
        <View style={styles.chipRow}>
          {SEASONS.map(se => (
            <Chip key={se} label={se} small selected={season === se} onPress={() => setSeason(se)} />
          ))}
          {DECISION_TYPES.map(dt => (
            <Chip key={dt} label={dt} small selected={decisionType === dt} onPress={() => setDecisionType(dt)} />
          ))}
          {GAME_TYPES.map(gt => (
            <Chip key={gt} label={gt} small selected={gameType === gt} onPress={() => setGameType(gt)} />
          ))}
        </View>
      </View>

      {coaches.length === 0 ? (
        <EmptyState
          icon="trophy.fill"
          title={`No coach data for ${sport} · ${season}`}
          subtitle="Decision grades are available once a season has enough games analyzed."
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
                  <Text style={[styles.evRate, { color: evColor(coach.evRate) }]}>{coach.evRate}%</Text>
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

      {/* Game reviews */}
      <View>
        <Text style={styles.gameSectionTitle}>Game decision reviews</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gameRow}>
          {DECISION_GAMES.map(game => (
            <Pressable key={game.id} onPress={() => router.push({ pathname: '/decisions/game', params: { gameId: game.id } })}>
              <Card style={styles.gameCard}>
                <Text style={styles.gameDate}>{game.date}</Text>
                <Text style={styles.gameTeams} numberOfLines={1}>
                  {game.homeTeam} {game.homeScore} – {game.awayScore} {game.awayTeam}
                </Text>
                <View style={styles.gameMetaRow}>
                  <Text style={styles.gameMetaText}>{game.homeEvRate}% vs {game.awayEvRate}% EV rate</Text>
                  <AppIcon name="chevron.right" size={13} color="#9AA0B5" />
                </View>
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Screen>
  );
}

function open(router: ReturnType<typeof useRouter>, coach: Coach) {
  router.push({ pathname: '/decisions/coach', params: { coachId: coach.id } });
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
        <Text style={styles.podiumRate}>{coach.evRate}%</Text>
      </View>
    </Pressable>
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
  filters: {
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
