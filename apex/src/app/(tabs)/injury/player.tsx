import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { RiskCircle } from '@/components/ui/risk-circle';
import { ZoneBadge, type Zone } from '@/components/ui/badge';
import { MetricBar } from '@/components/ui/bar';
import { LineChart, type ChartPoint } from '@/components/ui/chart';
import { AppIcon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/empty-state';
import { PLAYERS } from '@/data/mock/players';

type MetricKey = 'minutes' | 'distance' | 'intensity';

const METRICS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: 'minutes', label: 'Minutes Played', unit: 'min', color: '#5856D6' },
  { key: 'distance', label: 'Distance Covered', unit: 'km', color: '#3C87F7' },
  { key: 'intensity', label: 'High Intensity Events', unit: 'events', color: '#FF5C8A' },
];

/** Deterministic pseudo-noise for the workload chart. */
function noise(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export default function PlayerRiskScreen() {
  const router = useRouter();
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const player = PLAYERS.find(p => p.id === playerId) ?? PLAYERS[0];
  const [metric, setMetric] = useState<MetricKey>('minutes');

  const workload = (key: MetricKey): ChartPoint[] => {
    const recent = player[`${key}Recent` as const];
    const baseline = player[`${key}Baseline` as const];
    const start = baseline * 0.9;
    return Array.from({ length: 24 }, (_, i) => ({
      x: i / 23,
      y: 0.12 + 0.76 * ((start + ((recent - start) * i) / 23 + noise(i) * 1.6) / (Math.max(recent, baseline) * 1.35)),
    }));
  };

  const riskTrend: ChartPoint[] = Array.from({ length: 12 }, (_, i) => ({
    x: i / 11,
    y: 0.72 - i * 0.02 + noise(i) * 0.07 + (i >= 8 ? 0.12 : 0),
  }));

  const zone = player.zone as Zone;
  const metricDef = METRICS.find(m => m.key === metric)!;

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
        <Card style={styles.metricsCard}>
          <MetricBar
            label="Minutes Played"
            value={player.minutesRecent}
            max={48}
            baseline={player.minutesBaseline}
            color="#5856D6"
            formatValue={v => `${v.toFixed(1)} min`}
          />
          <MetricBar
            label="Distance"
            value={player.distanceRecent}
            max={6}
            baseline={player.distanceBaseline}
            color="#3C87F7"
            formatValue={v => `${v.toFixed(1)} km`}
          />
          <MetricBar
            label="High Intensity"
            value={player.intensityRecent}
            max={60}
            baseline={player.intensityBaseline}
            color="#FF5C8A"
            formatValue={v => `${Math.round(v)}`}
          />
          <Text style={styles.zScoreNote}>
            Max z-score {Math.max(player.minutesZ, player.distanceZ, player.intensityZ).toFixed(1)} · flag threshold 1.5
          </Text>
        </Card>
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
                onPress={() => setMetric(m.key)}>
                <Text style={[styles.chartTabText, metric === m.key && styles.chartTabTextActive]}>
                  {m.label.split(' ')[0]}
                </Text>
              </Pressable>
            ))}
          </View>
          <LineChart
            series={[{ name: metricDef.label, color: metricDef.color, points: workload(metric) }]}
            height={150}
            gridLabels={['Oct', 'Nov', 'Dec', 'Jan', 'Feb']}
            showDots
          />
          <Text style={styles.chartCaption}>
            Recent {metricDef.label.toLowerCase()} vs personal baseline — tap dots for game details
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
          <Text style={styles.chartCaption}>Entered the red zone {player.daysInZone} day(s) ago</Text>
        </Card>
      </View>

      {/* Schedule */}
      <View>
        <Text style={styles.sectionTitle}>Upcoming Schedule</Text>
        <Card style={styles.scheduleCard}>
          <View style={styles.scheduleRow}>
            {backToBackDays.map((day, i) => {
              const isB2B = i % 3 === 0;
              return (
                <View key={day} style={styles.dayCell}>
                  <View style={[styles.dayCircle, isB2B && styles.dayCircleB2B]}>
                    <Text style={[styles.dayText, isB2B && styles.dayTextB2B]}>{day}</Text>
                  </View>
                  {isB2B ? <Text style={styles.b2bLabel}>B2B</Text> : null}
                </View>
              );
            })}
          </View>
          <Text style={styles.scheduleNote}>Highlighted games are back-to-back nights with limited rest</Text>
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
  metricsCard: {
    gap: 14,
  },
  zScoreNote: {
    fontSize: 11.5,
    color: '#9AA0B5',
    fontWeight: '500',
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
