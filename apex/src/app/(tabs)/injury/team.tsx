import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DistributionBar } from '@/components/ui/bar';
import { LineChart, type ChartPoint } from '@/components/ui/chart';
import { AppIcon } from '@/components/ui/icon';
import { GradientView } from '@/components/ui/gradient';
import { type Player } from '@/data/mock/players';
import { SPORT_BY_ID } from '@/data/mock/sports';
import { useTeamRoster, useTeamRiskHistory } from '@/data/live/injury';
import { formatRiskScore } from '@/lib/format';
import { useOnboarding } from '@/context/onboarding';
import { useBackend } from '@/context/backend';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { DataFreshness } from '@/components/ui/data-freshness';
import { api } from '@/lib/api';

type ZoneFilter = 'all' | 'red' | 'yellow' | 'green';
type SortKey = 'risk' | 'name' | 'position';

const SORT_LABEL: Record<SortKey, string> = { risk: 'Risk Score', name: 'Name', position: 'Position' };

/** "MM/DD" from an ISO date — chart labels for real trend points. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Real team-average risk points (score → normalized 0..1, high at top). */
function pointsFromTeamHistory(
  history: { date: string; score: number }[]
): { points: ChartPoint[]; labels: string[]; maxScore: number } {
  const n = history.length;
  const maxScore = Math.max(...history.map(h => h.score), 40) * 1.15;
  const points: ChartPoint[] = history.map((h, i) => ({
    x: n > 1 ? i / (n - 1) : 0.5,
    y: Math.max(0.04, Math.min(0.96, 1 - h.score / maxScore)),
  }));
  const labels =
    n > 3
      ? [shortDate(history[0].date), shortDate(history[Math.floor(n / 2)].date), shortDate(history[n - 1].date)]
      : history.map(h => shortDate(h.date));
  return { points, labels, maxScore };
}

export default function TeamRiskScreen() {
  const router = useRouter();
  const { team } = useLocalSearchParams<{ team?: string }>();
  const teamName = team ?? 'Lakers';
  const [filter, setFilter] = useState<ZoneFilter>('all');
  const [sort, setSort] = useState<SortKey>('risk');
  const [chartOpen, setChartOpen] = useState(true);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { activeSport } = useOnboarding();
  const { status } = useBackend();

  const { players: roster, teamId, loading, error, lastUpdated, refetch: refetchRoster } = useTeamRoster(teamName, activeSport);
  const history = useTeamRiskHistory(teamId, activeSport);
  const sport = SPORT_BY_ID[roster[0]?.sport ?? activeSport];

  // Backend confirmed offline → skip skeletons, show fallback data immediately.
  const backendOffline = status === 'offline';
  const showSkeleton = loading && !backendOffline;
  const { refreshControl } = usePullRefresh(() => {
    refetchRoster();
    history.refetch();
  });

  const counts = {
    red: roster.filter(p => p.zone === 'red').length,
    yellow: roster.filter(p => p.zone === 'yellow').length,
    green: roster.filter(p => p.zone === 'green').length,
  };

  const visible = roster
    .filter(p => (filter === 'all' ? true : p.zone === filter))
    .sort((a, b) => {
      if (sort === 'risk') return (b.riskScore ?? 0) - (a.riskScore ?? 0);
      if (sort === 'name') return a.lastName.localeCompare(b.lastName);
      return a.position.localeCompare(b.position);
    });

  // Real team-average trend from the backend; a deterministic fallback when
  // offline or when the team has no history yet.
  const realTrend = history.points.length > 1 ? pointsFromTeamHistory(history.points) : null;
  const trendPoints: ChartPoint[] = realTrend
    ? realTrend.points
    : [0.3, 0.35, 0.28, 0.42, 0.38, 0.5, 0.46, 0.58, 0.52, 0.6, 0.55, 0.64].map((y, i) => ({
        x: i / 11,
        y,
      }));
  const trendLabels = realTrend ? realTrend.labels : ['30d', '20d', '10d', 'Now'];
  const selectedHistory = selectedPoint != null ? history.points[selectedPoint] : null;

  /**
   * Export team report PDF — end to end: request the backend-generated PDF,
   * then save/share it. Web downloads the file; native writes it to the app
   * cache and opens the system share sheet.
   */
  const exportReport = async () => {
    if (exporting || teamId == null) return;
    setExporting(true);
    setExportError(null);
    try {
      const bytes = await api.teamReportPdf(teamId);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const filename = `${teamName.replace(/[^\w-]+/g, '-')}-risk-report.pdf`;

      if (Platform.OS === 'web') {
        // Browser download: object URL + anchor click (no native modules needed).
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } else {
        // Native: write to the cache dir, then open the share sheet with it.
        const file = new File(Paths.cache, filename);
        await file.write(new Uint8Array(bytes));
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Export team risk report',
            UTI: 'com.adobe.pdf',
          });
        } else {
          setExportError('Sharing is not available on this device');
        }
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export the report');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen refreshControl={refreshControl}>
      <StackHeader title="Team Risk" subtitle={teamName} />

      {/* Team banner */}
      <GradientView colors={sport.gradient} style={styles.banner}>
        <View style={styles.bannerRow}>
          <View style={styles.bannerLogo}>
            <Text style={styles.bannerLogoText}>{teamName.slice(0, 1)}</Text>
          </View>
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerTeam}>{teamName}</Text>
            <Text style={styles.bannerMeta}>
              {sport.short} · {roster.length} players tracked
            </Text>
          </View>
        </View>
      </GradientView>

      {/* Data freshness — the plan's tiers (note for 1-6h, banner for 6h+) */}
      {lastUpdated ? <DataFreshness timestamp={lastUpdated} onRefresh={refetchRoster} /> : null}

      {/* Traffic light summary */}
      <Card style={styles.countsCard}>
        <CountBlock label="Red zone" value={counts.red} color="#E5484D" active={filter === 'red'} onPress={() => setFilter(filter === 'red' ? 'all' : 'red')} />
        <View style={styles.countDivider} />
        <CountBlock label="Yellow zone" value={counts.yellow} color="#F5A623" active={filter === 'yellow'} onPress={() => setFilter(filter === 'yellow' ? 'all' : 'yellow')} />
        <View style={styles.countDivider} />
        <CountBlock label="Green zone" value={counts.green} color="#2FA36B" active={filter === 'green'} onPress={() => setFilter(filter === 'green' ? 'all' : 'green')} />
      </Card>

      {/* Filters + sort */}
      <View style={styles.toolbar}>
        <View style={styles.chipRow}>
          {(['all', 'red', 'yellow', 'green'] as ZoneFilter[]).map(z => (
            <Chip key={z} label={z === 'all' ? 'All' : z[0].toUpperCase() + z.slice(1)} small selected={filter === z} onPress={() => setFilter(z)} />
          ))}
        </View>
        <Pressable
          style={styles.sortBtn}
          onPress={() => setSort(prev => (prev === 'risk' ? 'name' : prev === 'name' ? 'position' : 'risk'))}>
          <AppIcon name="chart.bar.fill" size={13} color="#5856D6" />
          <Text style={styles.sortText}>Sort: {SORT_LABEL[sort]}</Text>
        </Pressable>
      </View>

      {/* Roster */}
      <Card style={styles.rosterCard} padded={false}>
        {error != null && !backendOffline ? (
          <ErrorState compact message={`Could not load the ${teamName} roster`} onRetry={refetchRoster} />
        ) : showSkeleton ? (
          <View style={styles.rosterSkeleton}>
            {[0, 1, 2, 3, 4].map(i => (
              <View key={i} style={[styles.rosterRow, i !== 4 && styles.rosterRowBorder]}>
                <Skeleton width={9} height={9} radius={5} />
                <Skeleton width={20} height={12} radius={4} />
                <View style={styles.rosterBody}>
                  <Skeleton width="75%" height={13} radius={6} />
                  <Skeleton width={46} height={16} radius={7} />
                </View>
                <Skeleton width={52} height={14} radius={7} />
              </View>
            ))}
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.emptyRoster}>
            <Text style={styles.emptyRosterText}>No players in this zone</Text>
          </View>
        ) : (
          visible.map((p, i) => (
            <Pressable key={p.id} onPress={() => router.push({ pathname: '/injury/player', params: { playerId: p.id } })}>
              <RosterRow player={p} last={i === visible.length - 1} />
            </Pressable>
          ))
        )}
      </Card>

      {/* Team chart (collapsible) */}
      <Card style={styles.chartCard}>
        <Pressable style={styles.chartHeader} onPress={() => setChartOpen(prev => !prev)}>
          <Text style={styles.chartHeaderTitle}>Team risk analysis</Text>
          <AppIcon name={chartOpen ? 'chevron.down' : 'chevron.right'} size={16} color="#6E7280" />
        </Pressable>
        {chartOpen ? (
          <View style={styles.chartBody}>
            <Text style={styles.chartLabel}>Risk distribution</Text>
            <DistributionBar
              segments={[
                { color: '#E5484D', value: counts.red, label: 'red' },
                { color: '#F5A623', value: counts.yellow, label: 'yellow' },
                { color: '#2FA36B', value: counts.green, label: 'green' },
              ]}
            />
            <View style={styles.trendHeader}>
              <Text style={styles.chartLabel}>Team risk over last 30 days</Text>
              {history.loading && !backendOffline ? <Text style={styles.trendStatus}>loading…</Text> : null}
            </View>
            {selectedHistory ? (
              <View style={styles.tooltipChip}>
                <AppIcon name="location.fill" size={12} color="#5856D6" />
                <Text style={styles.tooltipText}>
                  {shortDate(selectedHistory.date)} · {formatRiskScore(selectedHistory.score)} team risk ·{' '}
                  {selectedHistory.playersScored} players scored
                </Text>
              </View>
            ) : null}
            <LineChart
              series={[{ name: 'Team risk', color: '#5856D6', points: trendPoints }]}
              height={140}
              gridLabels={trendLabels}
              yLabels={['High', '', '', 'Low']}
              showDots
              bands={[
                { y0: 0, y1: 0.3, color: '#E5484D' },
                { y0: 0.3, y1: 0.5, color: '#F5A623' },
              ]}
              selectedPoint={selectedPoint != null ? { series: 0, point: selectedPoint } : null}
              onPointPress={(_si, pi) => setSelectedPoint(pi === selectedPoint ? null : pi)}
            />
            <Text style={styles.chartCaption}>
              {realTrend
                ? `Real backend scores — daily average across the roster. Tap a dot to inspect that day.`
                : `Synthetic preview — real scores appear once risk history is available for this team. Tap a dot for details.`}
            </Text>
          </View>
        ) : null}
      </Card>

      {/* Export PDF */}
      <Pressable
        style={[styles.exportBtn, exporting && styles.exportBtnBusy]}
        onPress={exportReport}
        disabled={exporting || teamId == null}
        accessibilityRole="button"
        accessibilityLabel="Export team report PDF">
        {exporting ? (
          <Text style={styles.exportText}>Generating PDF…</Text>
        ) : (
          <>
            <AppIcon name="doc.fill" size={15} color="#5856D6" />
            <Text style={styles.exportText}>Export team report PDF</Text>
          </>
        )}
      </Pressable>
      {exportError ? (
        <View style={styles.exportErrorRow}>
          <AppIcon name="exclamationmark.triangle.fill" size={13} color="#E5484D" />
          <Text style={styles.exportErrorText}>{exportError}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

function CountBlock({ label, value, color, active, onPress }: { label: string; value: number; color: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.countBlock, active && styles.countBlockActive]} onPress={onPress}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </Pressable>
  );
}

function RosterRow({ player, last }: { player: Player; last: boolean }) {
  const color =
    player.zone === 'red' ? '#E5484D' : player.zone === 'yellow' ? '#F5A623' : player.zone === 'green' ? '#2FA36B' : '#9AA0B5';
  return (
    <View style={[styles.rosterRow, !last && styles.rosterRowBorder]}>
      <View style={[styles.zoneDot, { backgroundColor: color }]} />
      <Text style={styles.jersey}>{player.jersey}</Text>
      <View style={styles.rosterBody}>
        <Text style={styles.rosterName}>{player.name}</Text>
        <View style={[styles.positionBadge, { backgroundColor: `${color}14` }]}>
          <Text style={[styles.positionText, { color }]}>{player.position}</Text>
        </View>
      </View>
      {player.zone !== 'green' ? (
        <View style={[styles.triggerChip, { backgroundColor: `${color}12` }]}>
          <Text style={[styles.triggerChipText, { color }]}>{player.triggerMetric}</Text>
        </View>
      ) : null}
      <Text style={[styles.rosterScore, { color }]}>{formatRiskScore(player.riskScore)}</Text>
      <AppIcon name="chevron.right" size={13} color="#D5D7E0" />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bannerLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerLogoText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  bannerInfo: {
    gap: 2,
  },
  bannerTeam: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  bannerMeta: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12.5,
    fontWeight: '600',
  },
  bannerUpdated: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11.5,
  },
  countsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  countBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBlockActive: {
    backgroundColor: '#F0F1F5',
  },
  countValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  countLabel: {
    fontSize: 11.5,
    color: '#6E7280',
    fontWeight: '600',
  },
  countDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    backgroundColor: '#E4E5EC',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 32,
  },
  sortText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#5856D6',
  },
  rosterCard: {
    paddingVertical: 4,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rosterRowBorder: {
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
    gap: 3,
  },
  rosterName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#14121F',
  },
  positionBadge: {
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  positionText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  triggerChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  triggerChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rosterScore: {
    fontSize: 16,
    fontWeight: '800',
    minWidth: 30,
    textAlign: 'right',
  },
  emptyRoster: {
    padding: 28,
    alignItems: 'center',
  },
  rosterSkeleton: {
    paddingHorizontal: 16,
  },
  emptyRosterText: {
    fontSize: 13,
    color: '#6E7280',
  },
  chartCard: {
    gap: 4,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14121F',
  },
  chartBody: {
    gap: 10,
    marginTop: 10,
  },
  chartLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#14121F',
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trendStatus: {
    fontSize: 11,
    color: '#9AA0B5',
    fontStyle: 'italic',
  },
  tooltipChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFEEFB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tooltipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5856D6',
  },
  chartCaption: {
    fontSize: 11.5,
    color: '#9AA0B5',
    lineHeight: 16,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#5856D6',
  },
  exportBtnBusy: {
    opacity: 0.6,
  },
  exportText: {
    color: '#5856D6',
    fontWeight: '700',
    fontSize: 14,
  },
  exportErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  exportErrorText: {
    fontSize: 12,
    color: '#E5484D',
    fontWeight: '600',
  },
});
