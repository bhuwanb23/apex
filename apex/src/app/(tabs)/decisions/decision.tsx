import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { QualityBadge } from '@/components/ui/badge';
import { AppIcon } from '@/components/ui/icon';
import { DECISIONS } from '@/data/mock/coaches';

interface Option {
  action: string;
  ev: number;
  successProb: number;
  wpIfSucceed: number;
  wpIfFail: number;
  isBest?: boolean;
}

function buildOptions(decision: (typeof DECISIONS)[number]): Option[] {
  const options: Option[] = [
    { action: decision.chosenAction, ev: decision.evChosen, successProb: 0.62, wpIfSucceed: 0.58, wpIfFail: 0.31 },
    { action: 'Punt', ev: decision.evBest, successProb: 0.94, wpIfSucceed: 0.42, wpIfFail: 0.38 },
    { action: 'Field goal attempt', ev: decision.evBest - 0.08, successProb: 0.81, wpIfSucceed: 0.5, wpIfFail: 0.44 },
    { action: 'Kneel / clock management', ev: decision.evBest - 0.14, successProb: 1, wpIfSucceed: 0.36, wpIfFail: 0.36 },
  ];
  // Ensure the chosen action always appears; sort by EV desc for display.
  const sorted = [...options].sort((a, b) => b.ev - a.ev);
  const maxEv = sorted[0].ev;
  return sorted.map(o => ({ ...o, isBest: o.ev === maxEv }));
}

export default function DecisionDrillDownScreen() {
  const { decisionId } = useLocalSearchParams<{ decisionId: string }>();
  const decision = DECISIONS.find(d => d.id === decisionId) ?? DECISIONS[0];
  const options = buildOptions(decision);
  const best = options[0];
  const chosen = options.find(o => o.action === decision.chosenAction) ?? options[0];
  const wpAfter = decision.outcomeSuccess ? chosen.wpIfSucceed : chosen.wpIfFail;

  const contextLines = decision.situation.split(', ');

  const insight = decision.isOptimal
    ? 'This was the correct decision even if the play didn’t work. The process was right — the outcome is noise.'
    : `There was a better option available. ${best.action} had ${Math.round((best.ev - decision.evChosen) * 100)}% higher EV.`;

  return (
    <Screen>
      <StackHeader title="Decision Drill Down" subtitle={`${decision.coachName} · ${decision.team}`} />

      {/* Context */}
      <Card style={styles.contextCard}>
        <Text style={styles.contextGame}>
          {decision.team} vs {decision.opponent} · {decision.date}
        </Text>
        <View style={styles.contextBullets}>
          {contextLines.map(line => (
            <View key={line} style={styles.contextBullet}>
              <View style={styles.contextBulletDot} />
              <Text style={styles.contextBulletText}>{line}</Text>
            </View>
          ))}
        </View>
        <View style={styles.wpBeforeRow}>
          <View style={styles.wpBeforeInfo}>
            <Text style={styles.wpBeforeLabel}>Win probability before this decision</Text>
            <Text style={styles.wpBeforeContext}>
              {decision.team} {decision.chosenAction.toLowerCase()} with {decision.period} {decision.clock} left
            </Text>
          </View>
          <Text style={styles.wpBeforeValue}>54%</Text>
        </View>
      </Card>

      {/* Decision made */}
      <Card style={styles.chosenCard}>
        <View style={styles.chosenTop}>
          <Text style={styles.chosenLabel}>Coach chose to</Text>
          <QualityBadge optimal={decision.isOptimal} />
        </View>
        <Text style={styles.chosenAction}>{decision.chosenAction}</Text>
        <View style={styles.chosenEvRow}>
          <Text style={styles.chosenEv}>EV {Math.round(decision.evChosen * 100)}%</Text>
          <Text style={styles.chosenBest}>vs best {Math.round(decision.evBest * 100)}%</Text>
        </View>
      </Card>

      {/* All options */}
      <View>
        <Text style={styles.sectionTitle}>All Available Options</Text>
        <View style={styles.listGap}>
          {options.map(option => (
            <Card
              key={option.action}
              style={[styles.optionCard, option.isBest && styles.optionBest]}>
              <View style={styles.optionTop}>
                <Text style={styles.optionAction}>{option.action}</Text>
                {option.isBest ? (
                  <View style={styles.bestTag}>
                    <AppIcon name="star.fill" size={11} color="#D9A21B" />
                    <Text style={styles.bestTagText}>BEST</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.optionStats}>
                <OptionStat label="EV" value={`${Math.round(option.ev * 100)}%`} />
                <OptionStat label="Success" value={`${Math.round(option.successProb * 100)}%`} />
                <OptionStat label="Win if works" value={`${Math.round(option.wpIfSucceed * 100)}%`} />
                <OptionStat label="Win if fails" value={`${Math.round(option.wpIfFail * 100)}%`} />
              </View>
              <View style={styles.evTrack}>
                <View style={[styles.evFill, { width: `${option.ev * 100}%`, backgroundColor: option.isBest ? '#D9A21B' : '#B9B4F0' }]} />
              </View>
            </Card>
          ))}
        </View>
      </View>

      {/* What happened */}
      <View>
        <Text style={styles.sectionTitle}>What actually happened</Text>
        <Card style={styles.outcomeCard}>
          <View style={styles.outcomeTop}>
            <AppIcon name={decision.outcomeSuccess ? 'checkmark' : 'xmark'} size={18} color={decision.outcomeSuccess ? '#2FA36B' : '#E5484D'} />
            <Text style={[styles.outcomeBadge, { color: decision.outcomeSuccess ? '#1F8A52' : '#E5484D' }]}>
              {decision.outcomeSuccess ? 'SUCCESS' : 'FAILED'}
            </Text>
          </View>
          <Text style={styles.outcomeText}>{decision.outcome}</Text>
          <View style={styles.outcomeStats}>
            <OutcomeStat label="Win probability after this play" value={`${Math.round(wpAfter * 100)}%`} color={wpAfter >= 0.5 ? '#1F8A52' : '#E5484D'} />
            <OutcomeStat label="Decision was" value={decision.isOptimal ? 'Optimal' : 'Suboptimal'} color={decision.isOptimal ? '#5856D6' : '#E5484D'} />
          </View>
        </Card>
      </View>

      {/* Key insight */}
      <Card style={styles.insightCard}>
        <View style={styles.insightHeader}>
          <AppIcon name="sparkles" size={16} color="#5856D6" />
          <Text style={styles.insightTitle}>Key insight</Text>
        </View>
        <Text style={styles.insightText}>{insight}</Text>
      </Card>
    </Screen>
  );
}

function OptionStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.optionStat}>
      <Text style={styles.optionStatValue}>{value}</Text>
      <Text style={styles.optionStatLabel}>{label}</Text>
    </View>
  );
}

function OutcomeStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.outcomeStat}>
      <Text style={[styles.outcomeStatValue, { color }]}>{value}</Text>
      <Text style={styles.outcomeStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contextCard: {
    gap: 10,
  },
  contextGame: {
    fontSize: 13,
    color: '#6E7280',
    fontWeight: '600',
  },
  contextBullets: {
    gap: 6,
  },
  contextBullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  contextBulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5856D6',
    marginTop: 7,
  },
  contextBulletText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#14121F',
    lineHeight: 20,
  },
  wpBeforeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F1F5',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  wpBeforeInfo: {
    flex: 1,
    gap: 2,
  },
  wpBeforeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#14121F',
  },
  wpBeforeContext: {
    fontSize: 11.5,
    color: '#6E7280',
    lineHeight: 16,
  },
  wpBeforeValue: {
    fontSize: 30,
    fontWeight: '900',
    color: '#5856D6',
  },
  chosenCard: {
    gap: 8,
    backgroundColor: '#EFEEFB',
  },
  chosenTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chosenLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6E7280',
  },
  chosenAction: {
    fontSize: 28,
    fontWeight: '900',
    color: '#5856D6',
  },
  chosenEvRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chosenEv: {
    fontSize: 13,
    fontWeight: '800',
    color: '#5856D6',
  },
  chosenBest: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9AA0B5',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
  },
  listGap: {
    gap: 10,
  },
  optionCard: {
    gap: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionBest: {
    borderColor: '#D9A21B',
    backgroundColor: '#FFFDF5',
  },
  optionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionAction: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14121F',
  },
  bestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F7E9C3',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bestTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D9A21B',
    letterSpacing: 0.5,
  },
  optionStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optionStat: {
    alignItems: 'center',
    gap: 1,
  },
  optionStatValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#14121F',
  },
  optionStatLabel: {
    fontSize: 10,
    color: '#9AA0B5',
  },
  evTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#F0F1F5',
    overflow: 'hidden',
  },
  evFill: {
    height: '100%',
    borderRadius: 999,
  },
  outcomeCard: {
    gap: 8,
  },
  outcomeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  outcomeBadge: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  outcomeText: {
    fontSize: 13.5,
    color: '#3A3852',
    lineHeight: 20,
  },
  outcomeStats: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  outcomeStat: {
    flex: 1,
    backgroundColor: '#F0F1F5',
    borderRadius: 12,
    padding: 10,
    gap: 2,
    alignItems: 'center',
  },
  outcomeStatValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  outcomeStatLabel: {
    fontSize: 10.5,
    color: '#6E7280',
    textAlign: 'center',
  },
  insightCard: {
    backgroundColor: '#EFEEFB',
    gap: 8,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5856D6',
  },
  insightText: {
    fontSize: 13.5,
    color: '#3A3852',
    lineHeight: 20,
  },
});
