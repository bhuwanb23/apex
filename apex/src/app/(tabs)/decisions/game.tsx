import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { QualityBadge, TypeChip } from '@/components/ui/badge';
import { AppIcon } from '@/components/ui/icon';
import { GAMES, type Game } from '@/data/mock/games';
import { DECISIONS, type Decision } from '@/data/mock/coaches';

const PERIOD_BASE: Record<string, number> = { Q1: 0, Q2: 0.25, Q3: 0.5, Q4: 0.75, OT: 1 };

/** Normalized position (0..1) of a decision on the game timeline. */
function decisionX(decision: Decision): number {
  const base = PERIOD_BASE[decision.period] ?? 0;
  if (decision.period === 'OT' || !decision.clock) return base;
  const [m, s] = decision.clock.split(':').map(Number);
  const seconds = (m ?? 0) * 60 + (s ?? 0);
  const periodSeconds = decision.sport === 'NFL' ? 900 : 720;
  const frac = Math.max(0, Math.min(1, 1 - seconds / periodSeconds));
  return base + frac * 0.25;
}

/** Cumulative score at the end of each quarter, ending at the final score. */
function scorePath(final: number): number[] {
  const weights = [0.22, 0.28, 0.26, 0.24];
  let acc = 0;
  return weights.map(w => {
    acc += Math.round(final * w);
    return acc;
  });
}

function toLine(points: { x: number; y: number }[]): string {
  return points.map(p => `${p.x},${p.y}`).join(' ');
}

/** Thin score-progression strip with decision markers overlaid. */
function ScoreStrip({ game, decisions }: { game: Game; decisions: Decision[] }) {
  const height = 44;
  const maxScore = Math.max(game.homeScore, game.awayScore, 1);
  const home = scorePath(game.homeScore);
  const away = scorePath(game.awayScore);
  const toY = (v: number) => height - 8 - (v / maxScore) * (height - 16);

  const homePoints = home.map((v, i) => ({ x: (i / 4) * 100, y: toY(v) }));
  const awayPoints = away.map((v, i) => ({ x: (i / 4) * 100, y: toY(v) }));

  return (
    <View style={styles.stripWrap}>
      <View style={styles.stripLegend}>
        <LegendDot color="#5856D6" label={game.homeTeam} />
        <LegendDot color="#FF5C8A" label={game.awayTeam} />
      </View>
      <Svg width="100%" height={height}>
        {[0.25, 0.5, 0.75].map(t => (
          <Line key={t} x1={t * 100} x2={t * 100} y1={0} y2={height} stroke="#F0F1F5" strokeWidth={1} />
        ))}
        <Polyline points={toLine(homePoints)} fill="none" stroke="#5856D6" strokeWidth={2.5} strokeLinejoin="round" />
        <Polyline points={toLine(awayPoints)} fill="none" stroke="#FF5C8A" strokeWidth={2.5} strokeLinejoin="round" />
        {/* Decisions overlaid on the score line */}
        {decisions.map(d => (
          <Circle key={d.id} cx={decisionX(d) * 100} cy={7} r={4} fill={d.isOptimal ? '#2FA36B' : '#E5484D'} stroke="#FFFFFF" strokeWidth={1.5} />
        ))}
        {home.map((v, i) => (
          <SvgText key={`h${i}`} x={(i / 4) * 100 + 3} y={toY(v) - 4} fontSize={8} fontWeight="700" fill="#5856D6">
            {v}
          </SvgText>
        ))}
        {away.map((v, i) => (
          <SvgText key={`a${i}`} x={(i / 4) * 100 + 3} y={toY(v) + 9} fontSize={8} fontWeight="700" fill="#FF5C8A">
            {v}
          </SvgText>
        ))}
      </Svg>
      <View style={styles.quarterRow}>
        {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
          <Text key={q} style={styles.quarterLabel}>
            {q}
          </Text>
        ))}
      </View>
      <Text style={styles.stripNote}>Score progression — green/red dots mark optimal and suboptimal decisions</Text>
    </View>
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

export default function GameDecisionsScreen() {
  const router = useRouter();
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const game = GAMES.find(g => g.id === gameId) ?? GAMES.find(g => g.id === 'g3')!;
  const decisions = DECISIONS.filter(d => d.gameId === game.id).sort((a, b) => decisionX(a) - decisionX(b));

  const biggestMistake =
    decisions.find(d => !d.isOptimal && !d.outcomeSuccess) ??
    decisions.find(d => !d.isOptimal) ??
    null;

  return (
    <Screen>
      <StackHeader title="Game Decisions" subtitle={`${game.date} · Regular season`} />

      {/* Game header */}
      <Card style={styles.gameCard}>
        <View style={styles.scoreRow}>
          <TeamBlock name={game.homeTeam} score={game.homeScore} winner={game.homeScore > game.awayScore} />
          <View style={styles.finalWrap}>
            <Text style={styles.finalLabel}>FINAL</Text>
            <Text style={styles.gameType}>Regular season</Text>
          </View>
          <TeamBlock name={game.awayTeam} score={game.awayScore} winner={game.awayScore > game.homeScore} alignRight />
        </View>
        <Text style={styles.coaches}>
          {game.homeCoach} vs {game.awayCoach} · {game.season}
        </Text>
      </Card>

      {/* Score progression */}
      <View>
        <Text style={styles.sectionTitle}>Score progression</Text>
        <Card style={styles.stripCard}>
          <ScoreStrip game={game} decisions={decisions} />
        </Card>
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <Card style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Home EV rate</Text>
          <Text style={[styles.summaryValue, { color: evColor(game.homeEvRate) }]}>{game.homeEvRate}%</Text>
          <Text style={styles.summaryName}>{game.homeCoach}</Text>
        </Card>
        <Card style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Away EV rate</Text>
          <Text style={[styles.summaryValue, { color: evColor(game.awayEvRate) }]}>{game.awayEvRate}%</Text>
          <Text style={styles.summaryName}>{game.awayCoach}</Text>
        </Card>
        <Card style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Decisions</Text>
          <Text style={styles.summaryValue}>{Math.max(decisions.length, 6)}</Text>
          <Text style={styles.summaryName}>total graded</Text>
        </Card>
      </View>

      {biggestMistake ? (
        <Card style={styles.mistakeCard}>
          <View style={styles.mistakeHeader}>
            <AppIcon name="exclamationmark.triangle.fill" size={15} color="#E5484D" />
            <Text style={styles.mistakeTitle}>Biggest mistake</Text>
          </View>
          <Text style={styles.mistakeText}>
            {biggestMistake.coachName} ({biggestMistake.team}) — {biggestMistake.situation}
          </Text>
        </Card>
      ) : null}

      {/* Timeline */}
      <View>
        <Text style={styles.sectionTitle}>Decision timeline</Text>
        <Card style={styles.timelineCard} padded={false}>
          {decisions.map((decision, i) => (
            <View key={decision.id} style={styles.timelineItem}>
              <View style={styles.timelineRail}>
                <View style={[styles.timelineDot, { backgroundColor: decision.isOptimal ? '#2FA36B' : '#E5484D' }]} />
                {i !== decisions.length - 1 ? <View style={styles.timelineLine} /> : null}
              </View>
              <TimelineBody decision={decision} onPress={() => router.push({ pathname: '/decisions/decision', params: { decisionId: decision.id } })} />
            </View>
          ))}
          {decisions.length === 0 ? (
            <View style={styles.emptyTimeline}>
              <Text style={styles.emptyTimelineText}>No graded decisions for this game yet</Text>
            </View>
          ) : null}
        </Card>
      </View>
    </Screen>
  );
}

function TeamBlock({ name, score, winner, alignRight = false }: { name: string; score: number; winner: boolean; alignRight?: boolean }) {
  return (
    <View style={[styles.teamBlock, alignRight && styles.teamBlockRight]}>
      <Text style={styles.teamName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.teamScore, winner && styles.teamScoreWinner]}>{score}</Text>
    </View>
  );
}

function TimelineBody({ decision, onPress }: { decision: Decision; onPress: () => void }) {
  return (
    <Pressable style={styles.timelineBody} onPress={onPress}>
      <View style={styles.timelineTop}>
        <Text style={styles.timelineClock}>
          {decision.period} {decision.clock}
        </Text>
        <TypeChip label={decision.type.replace('_', ' ')} />
        <QualityBadge optimal={decision.isOptimal} />
      </View>
      <Text style={styles.timelineCoach}>
        {decision.coachName} · {decision.team}
      </Text>
      <Text style={styles.timelineSituation}>{decision.situation}</Text>
      <Text style={[styles.timelineOutcome, { color: decision.outcomeSuccess ? '#1F8A52' : '#E5484D' }]}>
        {decision.outcome}
      </Text>
    </Pressable>
  );
}

function evColor(rate: number): string {
  if (rate >= 70) return '#1F8A52';
  if (rate >= 50) return '#B7791F';
  return '#E5484D';
}

const styles = StyleSheet.create({
  gameCard: {
    gap: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamBlock: {
    flex: 1,
    gap: 2,
  },
  teamBlockRight: {
    alignItems: 'flex-end',
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
  teamScoreWinner: {
    color: '#14121F',
  },
  finalWrap: {
    alignItems: 'center',
    gap: 2,
  },
  finalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9AA0B5',
    letterSpacing: 1,
    paddingHorizontal: 12,
  },
  gameType: {
    fontSize: 10,
    color: '#9AA0B5',
    fontWeight: '600',
  },
  coaches: {
    fontSize: 12.5,
    color: '#6E7280',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
  },
  stripCard: {
    gap: 6,
    padding: 16,
  },
  stripWrap: {
    gap: 4,
  },
  stripLegend: {
    flexDirection: 'row',
    gap: 14,
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
    fontSize: 11.5,
    fontWeight: '600',
    color: '#14121F',
  },
  quarterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  quarterLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9AA0B5',
  },
  stripNote: {
    fontSize: 11,
    color: '#9AA0B5',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryBox: {
    flex: 1,
    padding: 14,
    gap: 2,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#6E7280',
    fontWeight: '600',
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  summaryName: {
    fontSize: 10.5,
    color: '#9AA0B5',
    textAlign: 'center',
  },
  mistakeCard: {
    gap: 8,
    backgroundColor: '#FDEBEC',
  },
  mistakeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mistakeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E5484D',
  },
  mistakeText: {
    fontSize: 13,
    color: '#7A2B2E',
    lineHeight: 19,
  },
  timelineCard: {
    paddingVertical: 8,
  },
  timelineItem: {
    flexDirection: 'row',
  },
  timelineRail: {
    width: 40,
    alignItems: 'center',
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 18,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#E4E5EC',
    marginVertical: 2,
  },
  timelineBody: {
    flex: 1,
    paddingRight: 14,
    paddingVertical: 12,
    gap: 6,
  },
  timelineTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  timelineClock: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5856D6',
  },
  timelineCoach: {
    fontSize: 14,
    fontWeight: '700',
    color: '#14121F',
  },
  timelineSituation: {
    fontSize: 12.5,
    color: '#6E7280',
    lineHeight: 18,
  },
  timelineOutcome: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  emptyTimeline: {
    padding: 24,
    alignItems: 'center',
  },
  emptyTimelineText: {
    fontSize: 13,
    color: '#6E7280',
  },
});
