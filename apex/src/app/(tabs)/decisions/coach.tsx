import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { AppIcon } from '@/components/ui/icon';
import { QualityBadge, TypeChip } from '@/components/ui/badge';
import { PillButton } from '@/components/ui/button';
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useOnboarding } from '@/context/onboarding';
import { useBackend } from '@/context/backend';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { type OutcomeCell, type Decision } from '@/data/mock/coaches';
import { useCoachDetail } from '@/data/live/decisions';
import { formatPercent } from '@/lib/format';

const MATRIX_CELLS: { key: OutcomeCell; label: string; color: string; soft: string }[] = [
  { key: 'good-good', label: 'Good process · Good outcome', color: '#1F8A52', soft: '#E3F6EC' },
  { key: 'good-bad', label: 'Good process · Bad outcome', color: '#B7791F', soft: '#FFF4DF' },
  { key: 'bad-good', label: 'Bad process · Good outcome', color: '#B7791F', soft: '#FFF4DF' },
  { key: 'bad-bad', label: 'Bad process · Bad outcome', color: '#E5484D', soft: '#FDEBEC' },
];

type DecisionFilter = 'all' | 'optimal' | 'suboptimal';

/** EV (0-1) → whole percent for display. */
function evPct(ev: number): number {
  return Math.round(ev * 100);
}

export default function CoachDetailScreen() {
  const router = useRouter();
  const { coachId } = useLocalSearchParams<{ coachId: string }>();
  const { activeSport, role } = useOnboarding();
  const { status } = useBackend();
  const { coach, decisions: coachDecisions, loading, error, refetch: refetchCoach } = useCoachDetail(coachId, activeSport);
  // Display-only (the plan's role rules): fans get the plain view without the
  // statistics sections; the backend request never changes.
  const isFan = role === 'fan';

  // Backend confirmed offline → skip skeletons, show fallback data immediately.
  const backendOffline = status === 'offline';
  const showSkeleton = loading && !backendOffline;
  const { refreshControl } = usePullRefresh(refetchCoach);

  // --- Filters: search + bottom-sheet (draft values apply on "Apply") ---
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DecisionFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [opponentFilter, setOpponentFilter] = useState<string | null>(null);
  const [cellFilter, setCellFilter] = useState<OutcomeCell | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftFilter, setDraftFilter] = useState<DecisionFilter>('all');
  const [draftType, setDraftType] = useState<string | null>(null);
  const [draftOpponent, setDraftOpponent] = useState<string | null>(null);

  const decisionTypes = useMemo(() => [...new Set(coachDecisions.map(d => d.type))], [coachDecisions]);
  const opponents = useMemo(() => [...new Set(coachDecisions.map(d => d.opponent))], [coachDecisions]);

  /** Open the filter sheet seeded with the currently applied values. */
  const openPicker = () => {
    setDraftFilter(filter);
    setDraftType(typeFilter);
    setDraftOpponent(opponentFilter);
    setPickerOpen(true);
  };

  /** Apply the draft choices and close the sheet. */
  const applyPicker = () => {
    setFilter(draftFilter);
    setTypeFilter(draftType);
    setOpponentFilter(draftOpponent);
    setPickerOpen(false);
  };

  /** Tapping a matrix cell filters to that quadrant and clears sheet choices. */
  const tapCell = (key: OutcomeCell) => {
    setCellFilter(cellFilter === key ? null : key);
    setFilter('all');
    setTypeFilter(null);
    setOpponentFilter(null);
  };

  const decisions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return coachDecisions.filter(d => {
      if (cellFilter === 'good-good') return d.isOptimal && d.outcomeSuccess;
      if (cellFilter === 'good-bad') return d.isOptimal && !d.outcomeSuccess;
      if (cellFilter === 'bad-good') return !d.isOptimal && d.outcomeSuccess;
      if (cellFilter === 'bad-bad') return !d.isOptimal && !d.outcomeSuccess;
      if (filter === 'optimal') return d.isOptimal;
      if (filter === 'suboptimal') return !d.isOptimal;
      return true;
    })
      .filter(d => (typeFilter ? d.type === typeFilter : true))
      .filter(d => (opponentFilter ? d.opponent === opponentFilter : true))
      .filter(d =>
        q
          ? d.situation.toLowerCase().includes(q) ||
            d.chosenAction.toLowerCase().includes(q) ||
            d.opponent.toLowerCase().includes(q) ||
            d.type.replace('_', ' ').includes(q)
          : true
      );
  }, [coachDecisions, cellFilter, filter, typeFilter, opponentFilter, query]);

  const total = Math.max(1, coach.matrix['good-good'] + coach.matrix['good-bad'] + coach.matrix['bad-good'] + coach.matrix['bad-bad']);

  const stats = [
    { label: 'Total decisions', value: String(coach.totalDecisions) },
    { label: 'Optimal decisions', value: String(coach.optimalDecisions) },
    { label: 'EV rate', value: formatPercent(coach.evRate) },
    { label: 'Avg EV left', value: formatPercent(coach.avgEvLeft) },
  ];

  const filterSummary = activeFilterSummary(cellFilter, filter, typeFilter, opponentFilter);

  return (
    <Screen refreshControl={refreshControl}>
      <StackHeader title={coach.name} subtitle={`${coach.team} · Rank #${coach.rank}`} />

      {error != null && !backendOffline ? (
        <ErrorState message="Could not load this coach's decisions" onRetry={refetchCoach} />
      ) : showSkeleton ? (
        <CoachSkeleton isFan={isFan} />
      ) : (
        <>
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
            <Text style={styles.headerEv}>{formatPercent(coach.evRate)}</Text>
          </Card>

          {/* Stat boxes + process-vs-outcome matrix — statistics, hidden for fans */}
          {!isFan ? (
            <>
              <View style={styles.statsGrid}>
                {stats.map(stat => (
                  <Card key={stat.label} style={styles.statBox}>
                    <Text style={styles.statValue}>{stat.value}</Text>
                    <Text style={styles.statLabel}>{stat.label}</Text>
                  </Card>
                ))}
              </View>

              <View>
                <Text style={styles.sectionTitle}>Process vs Outcome</Text>
                <Card style={styles.matrixCard}>
                  <View style={styles.matrixRow}>
                    {MATRIX_CELLS.slice(0, 2).map(cell => (
                      <MatrixCell key={cell.key} cell={cell} count={coach.matrix[cell.key]} pct={Math.round((coach.matrix[cell.key] / total) * 100)} selected={cellFilter === cell.key} onPress={() => tapCell(cell.key)} />
                    ))}
                  </View>
                  <View style={styles.matrixRow}>
                    {MATRIX_CELLS.slice(2).map(cell => (
                      <MatrixCell key={cell.key} cell={cell} count={coach.matrix[cell.key]} pct={Math.round((coach.matrix[cell.key] / total) * 100)} selected={cellFilter === cell.key} onPress={() => tapCell(cell.key)} />
                    ))}
                  </View>
                  <Text style={styles.matrixNote}>A good outcome does not mean a good decision — process is what matters</Text>
                </Card>
              </View>
            </>
          ) : null}

          {/* Decisions */}
          <View>
            <View style={styles.decisionHeader}>
              <Text style={styles.sectionTitle}>Decisions</Text>
              <Text style={styles.decisionCount}>{coachDecisions.length} total</Text>
            </View>

            {/* Search + filter button */}
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <AppIcon name="magnifyingglass" size={16} color="#9AA0B5" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search decisions…"
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
                accessibilityLabel="Filter decisions">
                <AppIcon name="slider.horizontal.3" size={18} color="#5856D6" />
              </Pressable>
            </View>

            {/* Count banner — active filter summary + filter shortcut */}
            <View style={styles.countBanner}>
              <Text style={styles.countText}>
                {decisions.length} decision{decisions.length === 1 ? '' : 's'}
              </Text>
              <Pressable style={styles.bannerFilterBtn} onPress={openPicker} accessibilityRole="button" accessibilityLabel="Open filters">
                <AppIcon name="slider.horizontal.3" size={13} color="#FFFFFF" />
                <Text style={styles.bannerFilterText} numberOfLines={1}>
                  {filterSummary}
                </Text>
              </Pressable>
            </View>

            <View style={styles.listGap}>
              {decisions.map(decision => (
                <DecisionCard
                  key={decision.id}
                  decision={decision}
                  onPress={() =>
                    router.push({ pathname: '/decisions/decision', params: { decisionId: decision.id, decision: JSON.stringify(decision) } })
                  }
                />
              ))}
              {decisions.length === 0 ? (
                <EmptyState
                  icon="doc.fill"
                  title={query.trim() ? `No decisions match “${query.trim()}”` : 'No decisions found for this filter'}
                  subtitle="Try a different search, decision type, outcome filter, or opponent."
                  accent="#5856D6"
                />
              ) : null}
            </View>
          </View>
        </>
      )}

      {/* Story mode — entity story for this coach */}
      <PillButton
        label={`Explain ${coach.name.split(' ')[0]}'s decisions simply`}
        variant="outline"
        size="lg"
        onPress={() =>
          router.push({
            pathname: '/story',
            params: { module: 'decisions', sport: activeSport, entityId: coach.id },
          })
        }
        icon={<AppIcon name="wand.and.stars" size={16} color="#5856D6" />}
      />

      {/* Filter sheet — quality / decision type / opponent, Apply to confirm */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Filter decisions</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <AppIcon name="xmark" size={16} color="#6E7280" />
              </Pressable>
            </View>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              <Text style={styles.pickerSection}>Quality</Text>
              <PickerRow label="All decisions" selected={draftFilter === 'all'} onPress={() => setDraftFilter('all')} />
              <PickerRow label="Optimal only" selected={draftFilter === 'optimal'} onPress={() => setDraftFilter('optimal')} />
              <PickerRow label="Suboptimal only" selected={draftFilter === 'suboptimal'} onPress={() => setDraftFilter('suboptimal')} />

              <Text style={styles.pickerSection}>Decision type</Text>
              <PickerRow label="All types" selected={draftType === null} onPress={() => setDraftType(null)} />
              {decisionTypes.map(t => (
                <PickerRow key={`type-${t}`} label={t.replace('_', ' ')} selected={draftType === t} onPress={() => setDraftType(t)} />
              ))}

              <Text style={styles.pickerSection}>Opponent</Text>
              <PickerRow label="All opponents" selected={draftOpponent === null} onPress={() => setDraftOpponent(null)} />
              {opponents.map(opp => (
                <PickerRow key={`opp-${opp}`} label={opp} selected={draftOpponent === opp} onPress={() => setDraftOpponent(opp)} />
              ))}
            </ScrollView>
            <Pressable style={styles.applyBtn} onPress={applyPicker} accessibilityRole="button">
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

/** Compact summary of the active filters for the banner pill. */
function activeFilterSummary(cell: OutcomeCell | null, filter: DecisionFilter, type: string | null, opponent: string | null): string {
  if (cell) {
    const label = MATRIX_CELLS.find(c => c.key === cell)?.label ?? '';
    return label.replace(' · ', ' · ');
  }
  const parts: string[] = [];
  parts.push(filter === 'all' ? 'All decisions' : filter === 'optimal' ? 'Optimal' : 'Suboptimal');
  parts.push(type ? type.replace('_', ' ') : 'All types');
  parts.push(opponent ? `vs ${opponent}` : 'All opponents');
  return parts.join(' · ');
}

function CoachSkeleton({ isFan }: { isFan: boolean }) {
  return (
    <>
      {/* Header card skeleton */}
      <Card style={styles.headerCard}>
        <Skeleton width={54} height={54} radius={27} />
        <View style={styles.headerInfo}>
          <Skeleton width="60%" height={18} radius={6} />
          <Skeleton width="45%" height={12} radius={6} />
          <Skeleton width="70%" height={12} radius={6} />
        </View>
        <Skeleton width={44} height={26} radius={6} />
      </Card>
      {!isFan ? (
        <>
          <View style={styles.statsGrid}>
            {[0, 1, 2, 3].map(i => (
              <Card key={i} style={styles.statBox}>
                <Skeleton width="50%" height={20} radius={6} />
                <Skeleton width="70%" height={11} radius={6} />
              </Card>
            ))}
          </View>
          <View>
            <Text style={styles.sectionTitle}>Process vs Outcome</Text>
            <SkeletonCard lines={4} />
          </View>
        </>
      ) : null}
      <View>
        <Text style={styles.sectionTitle}>Decisions</Text>
        <View style={styles.listGap}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </View>
      </View>
    </>
  );
}

/** Professional decision card: tinted by quality, EV comparison bars, outcome. */
function DecisionCard({ decision, onPress }: { decision: Decision; onPress: () => void }) {
  const optimal = decision.isOptimal;
  const accent = optimal ? '#2FA36B' : '#E5484D';
  const soft = optimal ? '#F2FBF6' : '#FEF5F6';
  const evGap = decision.evBest - decision.evChosen;
  const gapPct = evPct(evGap);
  const scale = Math.max(decision.evBest, decision.evChosen, 0.01);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.cardPressed}>
      <View style={[styles.decisionCard, { backgroundColor: soft, borderLeftColor: accent }]}>
        <View style={styles.decisionTop}>
          <Text style={styles.decisionDate}>
            {decision.date} · vs {decision.opponent}
          </Text>
          <QualityBadge optimal={optimal} />
        </View>
        <View style={styles.decisionTypeRow}>
          <TypeChip label={decision.type.replace('_', ' ')} />
          <AppIcon name="clock.fill" size={11} color="#9AA0B5" />
          <Text style={styles.decisionClock}>
            {decision.period} {decision.clock}
          </Text>
        </View>
        <Text style={styles.decisionSituation}>{decision.situation}</Text>

        {/* EV comparison — chosen vs best */}
        <View style={styles.evBox}>
          <EvRow label="Chosen" action={decision.chosenAction} ev={decision.evChosen} width={decision.evChosen / scale} color={optimal ? '#2FA36B' : '#E5484D'} />
          <EvRow label="Best" action={bestAction(decision)} ev={decision.evBest} width={1} color="#5856D6" />
          <View style={styles.gapRow}>
            <Text style={[styles.gapText, { color: optimal ? '#2FA36B' : '#E5484D' }]}>
              {optimal
                ? 'Optimal call — matched the model’s best option'
                : `Left ${gapPct}% EV on the table vs the best option`}
            </Text>
          </View>
        </View>

        {/* Outcome */}
        <View style={styles.outcomeRow}>
          <AppIcon name={decision.outcomeSuccess ? 'checkmark' : 'xmark'} size={12} color={decision.outcomeSuccess ? '#2FA36B' : '#E5484D'} />
          <Text style={styles.outcomeText} numberOfLines={2}>
            {decision.outcome}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** The best option label, when it differs from what was chosen. */
function bestAction(decision: Decision): string {
  if (decision.alternativeActions && decision.alternativeActions.length > 0) {
    const best = [...decision.alternativeActions].sort((a, b) => b.ev - a.ev)[0];
    return best.action;
  }
  return decision.chosenAction;
}

function EvRow({ label, action, ev, width, color }: { label: string; action: string; ev: number; width: number; color: string }) {
  const pct = Math.max(0, Math.min(1, width));
  return (
    <View style={styles.evRow}>
      <Text style={styles.evLabel}>{label}</Text>
      <Text style={styles.evAction} numberOfLines={1}>
        {action}
      </Text>
      <Text style={[styles.evValue, { color }]}>{evPct(ev)}%</Text>
      <View style={styles.evTrack}>
        <View style={[styles.evFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
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
  decisionCount: {
    fontSize: 12.5,
    color: '#9AA0B5',
    fontWeight: '600',
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
    gap: 10,
    backgroundColor: '#5856D6',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
  },
  bannerFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 28,
    flexShrink: 1,
  },
  bannerFilterText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
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
  listGap: {
    gap: 10,
  },
  cardPressed: {
    opacity: 0.85,
  },
  decisionCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(20,18,31,0.05)',
    borderLeftWidth: 4,
    padding: 14,
  },
  decisionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  decisionDate: {
    fontSize: 12.5,
    color: '#6E7280',
    fontWeight: '600',
    flexShrink: 1,
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
    fontSize: 14,
    color: '#14121F',
    lineHeight: 20,
    fontWeight: '600',
  },
  evBox: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 12,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(20,18,31,0.06)',
  },
  evRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  evLabel: {
    width: 48,
    fontSize: 11,
    fontWeight: '800',
    color: '#9AA0B5',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  evAction: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#14121F',
  },
  evValue: {
    minWidth: 34,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  evTrack: {
    width: 64,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E9EAF1',
    overflow: 'hidden',
  },
  evFill: {
    height: 6,
    borderRadius: 3,
  },
  gapRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(20,18,31,0.07)',
    paddingTop: 8,
  },
  gapText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: 2,
  },
  outcomeText: {
    flex: 1,
    fontSize: 12,
    color: '#6E7280',
    lineHeight: 17,
  },
});
