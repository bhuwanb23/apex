import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { QualityBadge, TypeChip } from '@/components/ui/badge';
import { AppIcon } from '@/components/ui/icon';
import { GAMES } from '@/data/mock/games';
import { DECISIONS } from '@/data/mock/coaches';

export default function GameDecisionsScreen() {
  const router = useRouter();
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const game = GAMES.find(g => g.id === gameId) ?? GAMES.find(g => g.id === 'g3')!;
  const decisions = DECISIONS.filter(d => d.gameId === game.id);

  const biggestMistake =
    decisions.find(d => !d.isOptimal && !d.outcomeSuccess) ??
    decisions.find(d => !d.isOptimal) ??
    null;

  return (
    <Screen tabInset={false}>
      <StackHeader title="Game Decisions" subtitle={game.date} />

      {/* Game header */}
      <Card style={styles.gameCard}>
        <View style={styles.scoreRow}>
          <TeamBlock name={game.homeTeam} score={game.homeScore} winner={game.homeScore > game.awayScore} />
          <Text style={styles.finalLabel}>FINAL</Text>
          <TeamBlock name={game.awayTeam} score={game.awayScore} winner={game.awayScore > game.homeScore} alignRight />
        </View>
        <Text style={styles.coaches}>
          {game.homeCoach} vs {game.awayCoach} · {game.season}
        </Text>
      </Card>

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
            {biggestMistake.coachName} — {biggestMistake.situation}
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
                <View
                  style={[
                    styles.timelineDot,
                    { backgroundColor: decision.isOptimal ? '#2FA36B' : '#E5484D' },
                  ]}
                />
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

function TimelineBody({ decision, onPress }: { decision: (typeof DECISIONS)[number]; onPress: () => void }) {
  return (
    <View style={styles.timelineBody}>
      <View style={styles.timelineTop}>
        <Text style={styles.timelineClock}>
          {decision.period} {decision.clock}
        </Text>
        <TypeChip label={decision.type.replace('_', ' ')} />
        <QualityBadge optimal={decision.isOptimal} />
      </View>
      <Text style={styles.timelineCoach}>
        {decision.coachName} chose to {decision.chosenAction.toLowerCase()}
      </Text>
      <Text style={styles.timelineSituation}>{decision.situation}</Text>
      <Text style={[styles.timelineOutcome, { color: decision.outcomeSuccess ? '#1F8A52' : '#E5484D' }]}>
        {decision.outcome}
      </Text>
    </View>
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
  finalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9AA0B5',
    letterSpacing: 1,
    paddingHorizontal: 12,
  },
  coaches: {
    fontSize: 12.5,
    color: '#6E7280',
    textAlign: 'center',
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
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
