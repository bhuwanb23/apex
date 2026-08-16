import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ZoneBadge, type Zone } from '@/components/ui/badge';
import { AppIcon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/empty-state';
import { SPORTS, type SportId } from '@/data/mock/sports';
import { type Player } from '@/data/mock/players';
import { useLeagueAlerts } from '@/data/live/injury';
import { formatRiskScore } from '@/lib/format';
import { useOnboarding } from '@/context/onboarding';
import { useBackend } from '@/context/backend';
import { SkeletonRow } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { DataFreshness } from '@/components/ui/data-freshness';

type ZoneFilter = 'all' | 'red' | 'yellow';
type SortKey = 'risk' | 'team' | 'position';

const SORT_LABEL: Record<SortKey, string> = { risk: 'Risk Score', team: 'Team', position: 'Position' };

export default function LeagueAlertsScreen() {
  const router = useRouter();
  const { sport: sportParam } = useLocalSearchParams<{ sport?: string }>();
  const { activeSport } = useOnboarding();
  const { status } = useBackend();
  // Follow the user's stored sport (the plan's rule) — the old hardcoded
  // 'NBA' fallback meant an NFL user opening Alerts saw NBA players.
  const [sport, setSport] = useState<SportId>((sportParam as SportId) ?? activeSport);
  const [zone, setZone] = useState<ZoneFilter>('all');
  const [sort, setSort] = useState<SortKey>('risk');
  const [position, setPosition] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  // Draft copies — the popup only applies on "Apply" (the team-picker pattern).
  const [draftZone, setDraftZone] = useState<ZoneFilter>('all');
  const [draftSort, setDraftSort] = useState<SortKey>('risk');
  const [draftPosition, setDraftPosition] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Follow the stored sport when it changes — guarded render-time adjustment
  // (React's documented pattern), not setState-in-effect.
  const [prevActiveSport, setPrevActiveSport] = useState<SportId>(activeSport);
  if (prevActiveSport !== activeSport) {
    setPrevActiveSport(activeSport);
    setSport(activeSport);
  }

  const alerts = useLeagueAlerts(sport, zone);
  const sportPlayers = alerts.players;
  const generatedAt = alerts.generatedAt;
  const positions = useMemo(
    () => [...new Set(sportPlayers.map(p => p.position))].sort(),
    [sportPlayers]
  );

  const visible = sportPlayers
    .filter(p => (position ? p.position === position : true))
    .filter(p => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      if (sort === 'risk') return b.riskScore - a.riskScore;
      if (sort === 'team') return a.team.localeCompare(b.team);
      return a.position.localeCompare(b.position);
    });

  // Pull-to-refresh (plan: "app sends the same request again; backend checks
  // if the cache is still valid and returns fresh or cached data").
  const refresh = () => {
    setRefreshing(true);
    alerts.refetch();
    setTimeout(() => setRefreshing(false), 900);
  };

  const selectSport = (id: SportId) => {
    setSport(id);
    setPosition(null);
    setQuery('');
  };

  /** Open the filter sheet seeded with the currently applied values. */
  const openPicker = () => {
    setDraftZone(zone);
    setDraftSort(sort);
    setDraftPosition(position);
    setPickerOpen(true);
  };

  /** Apply the draft filter choices and close the sheet. */
  const applyPicker = () => {
    setZone(draftZone);
    setSort(draftSort);
    setPosition(draftPosition);
    setPickerOpen(false);
  };

  const bannerText =
    zone === 'red'
      ? `${visible.length} player${visible.length === 1 ? '' : 's'} currently in the red zone`
      : zone === 'yellow'
        ? `${visible.length} player${visible.length === 1 ? '' : 's'} currently in the elevated zone`
        : `${visible.length} player${visible.length === 1 ? '' : 's'} currently flagged (red or elevated)`;

  // Backend confirmed offline → skip skeletons, show fallback data immediately.
  const backendOffline = status === 'offline';
  const showSkeleton = alerts.loading && !backendOffline;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor="#5856D6"
          colors={['#5856D6']}
        />
      }>
      <StackHeader
        title="League Alerts"
        subtitle={sport}
        right={
          <Pressable onPress={refresh} hitSlop={10}>
            <AppIcon name="refresh" size={18} color="#5856D6" />
          </Pressable>
        }
      />

      {/* Sport tabs */}
      <View style={styles.sportTabs}>
        {SPORTS.map(s => (
          <Chip key={s.id} label={s.short} small selected={sport === s.id} onPress={() => selectSport(s.id)} />
        ))}
      </View>

      {/* Search + filter button */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <AppIcon name="magnifyingglass" size={16} color="#9AA0B5" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search players…"
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
          accessibilityLabel="Filter alerts">
          <AppIcon name="slider.horizontal.3" size={18} color="#5856D6" />
        </Pressable>
      </View>

      {/* Data freshness — the plan's tiers (note for 1-6h, banner for 6h+) */}
      {generatedAt ? <DataFreshness timestamp={generatedAt} onRefresh={refresh} /> : null}

      {/* Count banner — active filter summary on the right */}
      <View style={styles.countBanner}>
        <Text style={styles.countText}>{refreshing ? 'Refreshing…' : showSkeleton ? 'Loading alerts…' : bannerText}</Text>
        <Pressable style={styles.sortBtn} onPress={openPicker} accessibilityRole="button" accessibilityLabel="Open filters">
          <AppIcon name="slider.horizontal.3" size={13} color="#FFFFFF" />
          <Text style={styles.sortText}>{activeFilterLabel(zone, position, sort)}</Text>
        </Pressable>
      </View>

      {alerts.error != null && !backendOffline ? (
        <ErrorState message={`Could not load ${sport} alerts`} onRetry={alerts.refetch} />
      ) : showSkeleton ? (
        <View style={styles.listGap}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="checkmark"
          title="No players in this zone right now"
          subtitle="All players are within their normal workload range."
        />
      ) : (
        <View style={styles.listGap}>
          {visible.map(player => (
            <Pressable
              key={player.id}
              onPress={() => router.push({ pathname: '/injury/player', params: { playerId: player.id } })}>
              <AlertCard player={player} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Filter sheet — zone / position / sort, Apply to confirm */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Filter alerts</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <AppIcon name="xmark" size={16} color="#6E7280" />
              </Pressable>
            </View>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              {/* Zone — radio list (single select) */}
              <Text style={styles.pickerSection}>Zone</Text>
              {(['all', 'red', 'yellow'] as ZoneFilter[]).map(z => (
                <PickerRow
                  key={`zone-${z}`}
                  label={z === 'all' ? 'All zones' : z === 'red' ? 'Red zone' : 'Yellow (elevated)'}
                  selected={draftZone === z}
                  onPress={() => setDraftZone(z)}
                />
              ))}

              {/* Position — radio list (single select) */}
              <Text style={styles.pickerSection}>Position</Text>
              <PickerRow label="All positions" selected={draftPosition === null} onPress={() => setDraftPosition(null)} />
              {positions.map(pos => (
                <PickerRow
                  key={`pos-${pos}`}
                  label={pos}
                  selected={draftPosition === pos}
                  onPress={() => setDraftPosition(pos)}
                />
              ))}

              {/* Sort — radio list (single select) */}
              <Text style={styles.pickerSection}>Sort by</Text>
              {(Object.keys(SORT_LABEL) as SortKey[]).map(k => (
                <PickerRow
                  key={`sort-${k}`}
                  label={SORT_LABEL[k]}
                  selected={draftSort === k}
                  onPress={() => setDraftSort(k)}
                />
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

/** "Red · PG · Risk" — a compact summary of the active filters for the banner. */
function activeFilterLabel(zone: ZoneFilter, position: string | null, sort: SortKey): string {
  const parts: string[] = [];
  parts.push(zone === 'all' ? 'All zones' : zone === 'red' ? 'Red' : 'Yellow');
  parts.push(position ?? 'All positions');
  parts.push(SORT_LABEL[sort]);
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

function AlertCard({ player }: { player: Player }) {
  const zone = (player.zone === 'green' ? 'insufficient_data' : player.zone) as Zone;
  const zoneNoun = player.zone === 'red' ? 'red zone' : 'elevated zone';
  const duration =
    player.daysInZone > 0
      ? `In ${zoneNoun} for ${player.daysInZone} day${player.daysInZone === 1 ? '' : 's'}`
      : 'New flag';
  return (
    <Card style={styles.alertCard}>
      <View style={styles.alertTop}>
        <ZoneBadge zone={zone} />
        <Text style={styles.alertDays}>{duration}</Text>
      </View>
      <View style={styles.alertMiddle}>
        <View style={styles.alertInfo}>
          <Text style={styles.alertName}>{player.name}</Text>
          <Text style={styles.alertMeta}>
            {player.team} · {player.position}
          </Text>
        </View>
        <View style={styles.alertScoreWrap}>
          <Text style={[styles.alertScore, { color: player.zone === 'red' ? '#E5484D' : '#B7791F' }]}>{formatRiskScore(player.riskScore)}</Text>
          <Text style={styles.alertScoreLabel}>risk</Text>
        </View>
      </View>
      <Text style={styles.alertExplanation}>{player.explanation}</Text>
    </Card>
  );
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
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 28,
  },
  sortText: {
    color: '#FFFFFF',
    fontSize: 11.5,
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
  listGap: {
    gap: 10,
  },
  alertCard: {
    gap: 10,
  },
  alertTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertDays: {
    fontSize: 12,
    color: '#9AA0B5',
    fontWeight: '600',
  },
  alertMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertInfo: {
    gap: 2,
    flex: 1,
  },
  alertName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#14121F',
  },
  alertMeta: {
    fontSize: 12.5,
    color: '#6E7280',
  },
  alertScoreWrap: {
    alignItems: 'center',
    marginLeft: 10,
  },
  alertScore: {
    fontSize: 26,
    fontWeight: '800',
  },
  alertScoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#9AA0B5',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  alertExplanation: {
    fontSize: 13,
    color: '#6E7280',
    lineHeight: 19,
  },
});
