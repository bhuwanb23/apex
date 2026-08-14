import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { RiskCircle } from '@/components/ui/risk-circle';
import { ZoneBadge, type Zone } from '@/components/ui/badge';
import { LineChart, type ChartPoint } from '@/components/ui/chart';
import { AppIcon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/empty-state';
import { usePlayerRisk } from '@/data/live/injury';
import { useOnboarding } from '@/context/onboarding';

type MetricKey = 'minutes' | 'distance' | 'intensity';

const METRICS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: 'minutes', label: 'Minutes Played', unit: 'min', color: '#5856D6' },
  { key: 'distance', label: 'Distance Covered', unit: 'km', color: '#3C87F7' },
  { key: 'intensity', label: 'High Intensity Events', unit: 'events', color: '#FF5C8A' },
];

/** Deterministic pseudo-noise so the demo chart is stable across renders. */
function noise(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export default function PlayerRiskScreen() {
  const router = useRouter();
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const { activeSport } = useOnboarding();
  const { data: player } = usePlayerRisk(playerId, activeSport);
  const [metric, setMetric] = useState<MetricKey>('minutes');
  const [selectedGame, setSelectedGame] = useState<number | null>(null);

  const zone = player.zone as Zone;
  const metricDef = METRICS.find(m => m.key === metric)!;
  const recent = player[`${metric}Recent` as const];
  const baseline = player[`${metric}Baseline` as const];
  const z = player[`${metric}Z` as const];

  /** 24-game season workload, normalized to 0..1 (high values at the top). */
  const workload = (key: MetricKey): ChartPoint[] => {
    const rec = player[`${key}Recent` as const];
    const base = player[`${key}Baseline` as const];
    const start = base * 0.92;
    const max = Math.max(rec, base) * 1.18;
    return Array.from({ length: 24 }, (_, i) => {
      const value = start + ((rec - start) * i) / 23 + noise(i) * 1.4;
      return { x: i / 23, y: Math.max(0.04, Math.min(0.96, 1 - value / max)) };
    });
  };

  const riskTrend: ChartPoint[] = Array.from({ length: 12 }, (_, i) => ({
    x: i / 11,
    y: 0.74 - i * 0.02 + noise(i) * 0.07 + (i >= 8 ? 0.12 : 0),
  }));

  const share = () => {
    Share.share({
      message: `${player.name} (${player.team}) — AQX risk score ${player.riskScore}/100. ${player.explanation}`,
    }).catch(() => {});
  };

  const backToBackDays = [1, 3, 5, 6, 8, 10, 12];

  return (
    <Screen>
      <StackHeader title={player.name} subtitle={`${player.team} · ${player.position}`} />

      {/* Header card */}
      <Card style={styles.headerCard}>
        <RiskCircle score={player.riskScore} zone={zone} size={128} />
        <View style={styles.headerInfo}>
          <ZoneBadge zone={zone} />
          <Text style={styles.headerName}>{player.name}</Text>
          <Text style={styles.headerMeta}>
            {player.team} · {player.position} · #{player.jersey}
          </Text>
          <Text style={styles.updated}>Risk scores updated 2 hours ago</Text>
        </View>
      </Card>

      {/* Explanation */}
      <Card style={styles.explainCard}>
        <View style={styles.explainHeader}>
          <AppIcon name="info.circle.fill" size={16} color="#5856D6" />
          <Text style={styles.explainTitle}>Why the flag</Text>
        </View>
        <Text style={styles.explainText}>{player.explanation}</Text>
      </Card>

      {/* What triggered this */}
      <View>
        <Text style={styles.sectionTitle}>What triggered this</Text>
        <View style={styles.listGap}>
          {METRICS.map(m => {
            const mRecent = player[`${m.key}Recent` as const];
            const mBaseline = player[`${m.key}Baseline` as const];
            const mZ = player[`${m.key}Z` as const];
            const triggered = mZ > 1.5;
            return (
              <Card key={m.key} style={styles.metricCard}>
                <View style={styles.metricTop}>
                  <Text style={styles.metricName}>{m.label}</Text>
                  <View style={[styles.zChip, { backgroundColor: triggered ? '#FDEBEC' : '#F0F1F5' }]}>
                    <Text style={[styles.zText, { color: triggered ? '#E5484D' : '#6E7280' }]}>
                      z {mZ >= 0 ? '+' : ''}
                      {mZ.toFixed(1)}
                      {triggered ? ' ▲' : ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.barRow}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.min(100, (mRecent / (Math.max(mRecent, mBaseline) * 1.15)) * 100)}%`, backgroundColor: m.color },
                      ]}
                    />
                    <View
                      style={[
                        styles.barBaseline,
                        { left: `${Math.min(96, (mBaseline / (Math.max(mRecent, mBaseline) * 1.15)) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLegend}>▍ baseline</Text>
                </View>
                <Text style={styles.metricCompare}>
                  {mRecent.toFixed(1)} {m.unit} recent vs {mBaseline.toFixed(1)} {m.unit} baseline
                </Text>
              </Card>
            );
          })}
        </View>
      </View>

      {/* Season workload */}
      <View>
        <Text style={styles.sectionTitle}>Season Workload</Text>
        <Card style={styles.chartCard}>
          <View style={styles.chartTabs}>
            {METRICS.map(m => (
              <Pressable
                key={m.key}
                style={[styles.chartTab, metric === m.key && styles.chartTabActive]}
                onPress={() => {
                  setMetric(m.key);
                  setSelectedGame(null);
                }}>
                <Text style={[styles.chartTabText, metric === m.key && styles.chartTabTextActive]}>
                  {m.label.split(' ')[0]}
                </Text>
              </Pressable>
            ))}
          </View>

          {selectedGame != null ? (
            <View style={styles.tooltipChip}>
              <AppIcon name="location.fill" size={12} color="#5856D6" />
              <Text style={styles.tooltipText}>
                Game {selectedGame + 1} · {recent.toFixed(1)} {metricDef.unit}
              </Text>
            </View>
          ) : null}

          <LineChart
            series={[{ name: metricDef.label, color: metricDef.color, points: workload(metric) }]}
            height={170}
            gridLabels={['Oct', 'Nov', 'Dec', 'Jan', 'Feb']}
            showDots
            bands={[
              { y0: 0, y1: 0.3, color: '#E5484D' },
              { y0: 0.3, y1: 0.5, color: '#F5A623' },
            ]}
            selectedPoint={selectedGame != null ? { series: 0, point: selectedGame } : null}
            onPointPress={(_si, pi) => setSelectedGame(pi === selectedGame ? null : pi)}
          />
          <Text style={styles.chartCaption}>
            {metricDef.label} per game — red/yellow bands mark elevated workload zones. Tap a dot for details.
          </Text>
        </Card>
      </View>

      {/* Risk trend */}
      <View>
        <Text style={styles.sectionTitle}>Risk Trend</Text>
        <Card style={styles.chartCard}>
          <LineChart
            series={[{ name: 'Risk', color: '#E5484D', points: riskTrend }]}
            height={110}
            gridLabels={['60d', '45d', '30d', '15d', 'Now']}
            showDots
          />
          <Text style={styles.chartCaption}>
            {player.daysInZone > 0
              ? `Entered the red zone ${player.daysInZone} day(s) ago — flagged by ${player.triggerMetric}`
              : 'Risk score trending within the normal range over the last 60 days'}
          </Text>
        </Card>
      </View>

      {/* Schedule */}
      <View>
        <Text style={styles.sectionTitle}>Upcoming Schedule</Text>
        <Card style={styles.scheduleCard}>
          <View style={styles.scheduleRow}>
            {backToBackDays.map((day, i) => {
              const isB2B = i % 3 === 0;
              const restAfter = i > 0 && !isB2B && backToBackDays[i - 1] % 3 === 0;
              return (
                <View key={day} style={styles.dayCell}>
                  <View style={[styles.dayCircle, isB2B && styles.dayCircleB2B]}>
                    <Text style={[styles.dayText, isB2B && styles.dayTextB2B]}>{day}</Text>
                  </View>
                  {isB2B ? <Text style={styles.b2bLabel}>B2B</Text> : restAfter ? <Text style={styles.restLabel}>rest</Text> : null}
                </View>
              );
            })}
          </View>
          <Text style={styles.scheduleNote}>Highlighted games are back-to-back nights — rest days are marked between them</Text>
        </Card>
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <Pressable style={[styles.actionBtn, styles.actionExport]} onPress={() => {}}>
          <AppIcon name="doc.fill" size={16} color="#5856D6" />
          <Text style={styles.actionExportText}>Export PDF</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.actionShare]} onPress={share}>
          <AppIcon name="square.and.arrow.up" size={16} color="#FFFFFF" />
          <Text style={styles.actionShareText}>Share</Text>
        </Pressable>
      </View>

      {player.zone === 'insufficient_data' ? (
        <EmptyState icon="info.circle.fill" title="No risk data" subtitle="No game logs available for this player yet." />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  headerInfo: {
    flex: 1,
    gap: 6,
    alignItems: 'flex-start',
  },
  headerName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#14121F',
  },
  headerMeta: {
    fontSize: 13,
    color: '#6E7280',
  },
  updated: {
    fontSize: 11.5,
    color: '#9AA0B5',
    marginTop: 2,
  },
  explainCard: {
    gap: 8,
    backgroundColor: '#EFEEFB',
  },
  explainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  explainTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5856D6',
  },
  explainText: {
    fontSize: 14,
    color: '#3A3852',
    lineHeight: 21,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
    marginTop: 4,
  },
  listGap: {
    gap: 10,
  },
  metricCard: {
    gap: 10,
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#14121F',
  },
  zChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  zText: {
    fontSize: 12,
    fontWeight: '800',
  },
  barRow: {
    gap: 4,
  },
  barTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#F0F1F5',
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  barBaseline: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 3,
    borderRadius: 2,
    backgroundColor: '#9AA0B5',
  },
  barLegend: {
    fontSize: 10.5,
    color: '#9AA0B5',
    alignSelf: 'flex-end',
  },
  metricCompare: {
    fontSize: 12.5,
    color: '#6E7280',
    fontWeight: '600',
  },
  chartCard: {
    gap: 10,
  },
  chartTabs: {
    flexDirection: 'row',
    backgroundColor: '#F0F1F5',
    borderRadius: 999,
    padding: 3,
  },
  chartTab: {
    flex: 1,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#9AA0B5',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  chartTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6E7280',
  },
  chartTabTextActive: {
    color: '#14121F',
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
  scheduleCard: {
    gap: 12,
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCell: {
    alignItems: 'center',
    gap: 4,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F0F1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleB2B: {
    backgroundColor: '#FDEBEC',
    borderWidth: 1.5,
    borderColor: '#E5484D',
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6E7280',
  },
  dayTextB2B: {
    color: '#E5484D',
    fontWeight: '800',
  },
  b2bLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#E5484D',
  },
  restLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#2FA36B',
  },
  scheduleNote: {
    fontSize: 11.5,
    color: '#9AA0B5',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionExport: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#5856D6',
  },
  actionExportText: {
    color: '#5856D6',
    fontWeight: '700',
    fontSize: 14,
  },
  actionShare: {
    backgroundColor: '#5856D6',
  },
  actionShareText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
