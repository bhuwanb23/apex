import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { QualityBadge, TypeChip } from '@/components/ui/badge';
import { AppIcon } from '@/components/ui/icon';
import { type OutcomeCell } from '@/data/mock/coaches';
import { useCoachDetail } from '@/data/live/decisions';

const MATRIX_CELLS: { key: OutcomeCell; label: string; color: string; soft: string }[] = [
  { key: 'good-good', label: 'Good process · Good outcome', color: '#1F8A52', soft: '#E3F6EC' },
  { key: 'good-bad', label: 'Good process · Bad outcome', color: '#B7791F', soft: '#FFF4DF' },
  { key: 'bad-good', label: 'Bad process · Good outcome', color: '#B7791F', soft: '#FFF4DF' },
  { key: 'bad-bad', label: 'Bad process · Bad outcome', color: '#E5484D', soft: '#FDEBEC' },
];

type DecisionFilter = 'all' | 'optimal' | 'suboptimal';

export default function CoachDetailScreen() {
  const router = useRouter();
  const { coachId } = useLocalSearchParams<{ coachId: string }>();
  const { coach, decisions: coachDecisions } = useCoachDetail(coachId, 'NFL');
  const [filter, setFilter] = useState<DecisionFilter>('all');
  const [cellFilter, setCellFilter] = useState<OutcomeCell | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [opponentFilter, setOpponentFilter] = useState<string | null>(null);
  const decisionTypes = [...new Set(coachDecisions.map(d => d.type))];
  const opponents = [...new Set(coachDecisions.map(d => d.opponent))];

  const decisions = coachDecisions.filter(d => {
    if (cellFilter === 'good-good') return d.isOptimal && d.outcomeSuccess;
    if (cellFilter === 'good-bad') return d.isOptimal && !d.outcomeSuccess;
    if (cellFilter === 'bad-good') return !d.isOptimal && d.outcomeSuccess;
    if (cellFilter === 'bad-bad') return !d.isOptimal && !d.outcomeSuccess;
    if (filter === 'optimal') return d.isOptimal;
    if (filter === 'suboptimal') return !d.isOptimal;
    return true;
  })
    .filter(d => (typeFilter ? d.type === typeFilter : true))
    .filter(d => (opponentFilter ? d.opponent === opponentFilter : true));

  const total = Math.max(1, coach.matrix['good-good'] + coach.matrix['good-bad'] + coach.matrix['bad-good'] + coach.matrix['bad-bad']);

  const stats = [
    { label: 'Total decisions', value: String(coach.totalDecisions) },
    { label: 'Optimal decisions', value: String(coach.optimalDecisions) },
    { label: 'EV rate', value: `${coach.evRate}%` },
    { label: 'Avg EV left', value: `${coach.avgEvLeft}%` },
  ];

  return (
    <Screen>
      <StackHeader title={coach.name} subtitle={`${coach.team} · Rank #${coach.rank}`} />

      {/* Header card */}
      <Card style={styles.headerCard}>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerInitials}>
            {coach.name.split(' ').map(w => w[0]).join('')}
          </Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{coach.name}</Text>
          <Text style={styles.headerMeta}>{coach.team} · {coach.sport}</Text>
          <View style={styles.headerRank}>
            <AppIcon name="trophy.fill" size={13} color="#D9A21B" />
            <Text style={styles.headerRankText}>Rank #{coach.rank} · {coach.trend === 'up' ? '▲' : coach.trend === 'down' ? '▼' : '—'} vs last month</Text>
          </View>
        </View>
        <Text style={styles.headerEv}>{coach.evRate}%</Text>
      </Card>

      {/* Stat boxes */}
      <View style={styles.statsGrid}>
        {stats.map(stat => (
          <Card key={stat.label} style={styles.statBox}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </Card>
        ))}
      </View>

      {/* Process vs outcome */}
      <View>
        <Text style={styles.sectionTitle}>Process vs Outcome</Text>
        <Card style={styles.matrixCard}>
          <View style={styles.matrixRow}>
            {MATRIX_CELLS.slice(0, 2).map(cell => (
              <MatrixCell key={cell.key} cell={cell} count={coach.matrix[cell.key]} pct={Math.round((coach.matrix[cell.key] / total) * 100)} selected={cellFilter === cell.key} onPress={() => setCellFilter(cellFilter === cell.key ? null : cell.key)} />
            ))}
          </View>
          <View style={styles.matrixRow}>
            {MATRIX_CELLS.slice(2).map(cell => (
              <MatrixCell key={cell.key} cell={cell} count={coach.matrix[cell.key]} pct={Math.round((coach.matrix[cell.key] / total) * 100)} selected={cellFilter === cell.key} onPress={() => setCellFilter(cellFilter === cell.key ? null : cell.key)} />
            ))}
          </View>
          <Text style={styles.matrixNote}>A good outcome does not mean a good decision — process is what matters</Text>
        </Card>
      </View>

      {/* Decisions */}
      <View>
        <View style={styles.decisionHeader}>
          <Text style={styles.sectionTitle}>Decisions</Text>
          <View style={styles.filterChips}>
            {(['all', 'optimal', 'suboptimal'] as DecisionFilter[]).map(f => (
              <Chip key={f} label={f} small selected={filter === f} onPress={() => setFilter(f)} />
            ))}
          </View>
        </View>
        {decisionTypes.length > 0 ? (
          <View style={styles.filterRow}>
            {decisionTypes.map(t => (
              <Chip key={t} label={t.replace('_', ' ')} small selected={typeFilter === t} onPress={() => setTypeFilter(typeFilter === t ? null : t)} />
            ))}
          </View>
        ) : null}
        {opponents.length > 0 ? (
          <View style={styles.filterRow}>
            {opponents.map(opp => (
              <Chip key={opp} label={`vs ${opp}`} small selected={opponentFilter === opp} onPress={() => setOpponentFilter(opponentFilter === opp ? null : opp)} />
            ))}
          </View>
        ) : null}
        <View style={styles.listGap}>
          {decisions.map(decision => (
            <Pressable
              key={decision.id}
              onPress={() => router.push({ pathname: '/decisions/decision', params: { decisionId: decision.id } })}>
              <Card style={[styles.decisionCard, { borderLeftColor: decision.isOptimal ? '#2FA36B' : '#E5484D' }]}>
                <View style={styles.decisionTop}>
                  <Text style={styles.decisionDate}>
                    {decision.date} · vs {decision.opponent}
                  </Text>
                  <QualityBadge optimal={decision.isOptimal} />
                </View>
                <View style={styles.decisionTypeRow}>
                  <TypeChip label={decision.type.replace('_', ' ')} />
                  <Text style={styles.decisionClock}>
                    {decision.period} {decision.clock}
                  </Text>
                </View>
                <Text style={styles.decisionSituation}>{decision.situation}</Text>
                <View style={styles.decisionEvRow}>
                  <Text style={styles.decisionChosen}>
                    {decision.chosenAction} · EV {Math.round(decision.evChosen * 100)}%
                  </Text>
                  <Text style={styles.decisionBest}>best {Math.round(decision.evBest * 100)}%</Text>
                </View>
              </Card>
            </Pressable>
          ))}
          {decisions.length === 0 ? (
            <Card style={styles.noDecisions}>
              <Text style={styles.noDecisionsText}>No decisions match this filter</Text>
            </Card>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

function MatrixCell({
  cell,
  count,
  pct,
  selected,
  onPress,
}: {
  cell: (typeof MATRIX_CELLS)[number];
  count: number;
  pct: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.matrixCell, { backgroundColor: cell.soft }, selected && styles.matrixCellSelected]}
      onPress={onPress}>
      <Text style={[styles.matrixCount, { color: cell.color }]}>{count}</Text>
      <Text style={styles.matrixPct}>{pct}%</Text>
      <Text style={styles.matrixLabel}>{cell.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#EFEEFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInitials: {
    fontSize: 17,
    fontWeight: '800',
    color: '#5856D6',
  },
  headerInfo: {
    flex: 1,
    gap: 3,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#14121F',
  },
  headerMeta: {
    fontSize: 12.5,
    color: '#6E7280',
  },
  headerRank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerRankText: {
    fontSize: 12,
    color: '#6E7280',
    fontWeight: '600',
  },
  headerEv: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1F8A52',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  statBox: {
    width: '48%',
    padding: 14,
    gap: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#14121F',
  },
  statLabel: {
    fontSize: 12,
    color: '#6E7280',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
  },
  matrixCard: {
    gap: 10,
  },
  matrixRow: {
    flexDirection: 'row',
    gap: 10,
  },
  matrixCell: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    gap: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  matrixCellSelected: {
    borderColor: '#5856D6',
  },
  matrixCount: {
    fontSize: 22,
    fontWeight: '800',
  },
  matrixPct: {
    fontSize: 12,
    color: '#6E7280',
    fontWeight: '600',
  },
  matrixLabel: {
    fontSize: 11,
    color: '#14121F',
    fontWeight: '600',
    lineHeight: 14,
  },
  matrixNote: {
    fontSize: 11.5,
    color: '#9AA0B5',
    lineHeight: 16,
  },
  decisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterChips: {
    flexDirection: 'row',
    gap: 6,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  listGap: {
    gap: 10,
  },
  decisionCard: {
    gap: 8,
    borderLeftWidth: 4,
  },
  decisionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  decisionDate: {
    fontSize: 12.5,
    color: '#6E7280',
    fontWeight: '600',
  },
  decisionTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  decisionClock: {
    fontSize: 12,
    color: '#9AA0B5',
    fontWeight: '600',
  },
  decisionSituation: {
    fontSize: 13.5,
    color: '#14121F',
    lineHeight: 20,
    fontWeight: '500',
  },
  decisionEvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  decisionChosen: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#5856D6',
  },
  decisionBest: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#9AA0B5',
  },
  noDecisions: {
    alignItems: 'center',
    padding: 20,
  },
  noDecisionsText: {
    fontSize: 13,
    color: '#6E7280',
  },
});
