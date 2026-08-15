import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Slider } from '@/components/ui/slider';
import { AppIcon } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/button';
import { GradientView } from '@/components/ui/gradient';
import { fetchTimeoutRecommendation } from '@/data/live/momentum';
import { useOnboarding } from '@/context/onboarding';
import type { SportId } from '@/data/mock/sports';

const PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', 'OT'];

function formatScoreDiff(diff: number): string {
  if (diff === 0) return 'Tied';
  return diff > 0 ? `Up by ${diff}` : `Down by ${Math.abs(diff)}`;
}

function formatClock(minutes: number): string {
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  return `${m}:${s.toString().padStart(2, '0')} remaining`;
}

export default function TimeoutOptimizerScreen() {
  const { activeSport } = useOnboarding();
  // The optimizer's scenario grid only covers NFL and NBA — follow the
  // user's stored sport when it is one of them, default to NFL otherwise.
  const [sport, setSport] = useState<'NFL' | 'NBA'>(activeSport === 'NBA' ? 'NBA' : 'NFL');

  // Follow the stored sport when it changes — guarded render-time adjustment
  // (React's documented pattern), not setState-in-effect.
  const [prevActiveSport, setPrevActiveSport] = useState<SportId>(activeSport);
  if (prevActiveSport !== activeSport) {
    setPrevActiveSport(activeSport);
    setSport(activeSport === 'NBA' ? 'NBA' : 'NFL');
  }
  const [consecutive, setConsecutive] = useState(3);
  const [scoreDiff, setScoreDiff] = useState(-4);
  const [minutes, setMinutes] = useState(5);
  const [period, setPeriod] = useState('Q4');
  const [timeouts, setTimeouts] = useState(2);
  const [recommendation, setRecommendation] = useState<null | { should: boolean; withTimeout: number; without: number; note: string; confidence: string; demo: boolean }>(null);

  /** Ask the backend; fall back to the local heuristic when it has no scenario. */
  const getRecommendation = async () => {
    const live = await fetchTimeoutRecommendation(sport, { consecutiveScores: consecutive, scoreDiff, minutes, period, timeoutsAvailable: timeouts });
    if (live) {
      setRecommendation({
        should: live.shouldCallTimeout,
        withTimeout: live.stopProbabilityWith,
        without: live.stopProbabilityWithout,
        note: live.recommendationText,
        confidence: `${live.confidenceLevel} confidence — based on ${live.basedOnSampleSize} similar situations`,
        demo: false,
      });
      return;
    }
    const urgency = period === 'Q4' || period === 'OT' ? 1.15 : 1;
    const baseWith = 0.48 + Math.min(0.28, consecutive * 0.05) + (scoreDiff < 0 ? 0.06 : 0) + (timeouts > 0 ? 0.04 : 0);
    const baseWithout = baseWith - 0.09 - Math.min(0.08, consecutive * 0.015);
    const should = baseWith - baseWithout > 0.06 && timeouts > 0;
    const withTimeout = Math.round(Math.min(0.92, baseWith * urgency) * 100);
    const without = Math.round(Math.min(0.92, baseWithout * urgency) * 100);
    const diff = Math.max(0, withTimeout - without);
    setRecommendation({
      should,
      withTimeout,
      without,
      note: `After ${consecutive}+ consecutive opponent scores with under ${Math.round(minutes)} minutes remaining in ${period}, calling timeout has historically improved stop probability by ${Math.max(0, diff)}%.`,
      confidence: 'High confidence — based on 847 similar situations',
      demo: true,
    });
  };

  const reset = () => {
    setConsecutive(3);
    setScoreDiff(-4);
    setMinutes(5);
    setPeriod('Q4');
    setTimeouts(2);
    setRecommendation(null);
  };

  return (
    <Screen>
      <StackHeader title="Timeout Optimizer" subtitle="Should I call timeout right now?" />

      <View style={styles.sportRow}>
        {(['NFL', 'NBA'] as const).map(s => (
          <Chip key={s} label={s} small selected={sport === s} onPress={() => setSport(s)} />
        ))}
      </View>

      <Card style={styles.inputCard}>
        <Text style={styles.inputTitle}>Tell me the situation</Text>

        <InputBlock label="Consecutive opponent scores" value={`${consecutive}`}>
          <Slider value={consecutive} min={0} max={7} onChange={setConsecutive} />
        </InputBlock>

        <InputBlock label="Score difference" value={formatScoreDiff(scoreDiff)}>
          <Slider value={scoreDiff} min={-20} max={20} onChange={setScoreDiff} trackColor="#FDEBEC" fillColor={scoreDiff < 0 ? '#E5484D' : '#2FA36B'} />
        </InputBlock>

        <InputBlock label="Time remaining" value={formatClock(minutes)}>
          <Slider value={minutes} min={0} max={15} step={0.25} onChange={setMinutes} fillColor="#FFA058" />
        </InputBlock>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Current period</Text>
          <View style={styles.segment}>
            {PERIODS.map(p => (
              <Pressable key={p} style={[styles.segmentBtn, period === p && styles.segmentActive]} onPress={() => setPeriod(p)}>
                <Text style={[styles.segmentText, period === p && styles.segmentTextActive]}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Timeouts available</Text>
          <View style={styles.counter}>
            <Pressable style={styles.counterBtn} onPress={() => setTimeouts(Math.max(0, timeouts - 1))}>
              <AppIcon name="minus" size={16} color="#5856D6" />
            </Pressable>
            <Text style={styles.counterValue}>{timeouts}</Text>
            <Pressable style={styles.counterBtn} onPress={() => setTimeouts(Math.min(3, timeouts + 1))}>
              <AppIcon name="plus" size={16} color="#5856D6" />
            </Pressable>
          </View>
        </View>
      </Card>

      {recommendation ? (
        <GradientView
          colors={recommendation.should ? ['#2FA36B', '#4CC38A'] : ['#E5484D', '#F06A6E']}
          style={styles.recCard}>
          <Text style={styles.recLabel}>{recommendation.should ? 'RECOMMENDATION' : 'RECOMMENDATION'}</Text>
          <Text style={styles.recAnswer}>{recommendation.should ? 'Call Timeout' : "Don't Call Timeout"}</Text>
          <View style={styles.recBars}>
            <ProbBar label="With timeout" value={recommendation.withTimeout} color="#FFFFFF" />
            <ProbBar label="Without" value={recommendation.without} color="rgba(255,255,255,0.65)" />
          </View>
          <Text style={styles.recDiff}>
            {recommendation.should ? '+' : ''}
            {Math.max(0, recommendation.withTimeout - recommendation.without)}% better with timeout
          </Text>
          <View style={styles.recNoteBox}>
            <Text style={styles.recNote}>{recommendation.note}</Text>
          </View>
          <Text style={styles.recConfidence}>
            {recommendation.confidence}
            {recommendation.demo ? ' · demo data' : ''}
          </Text>
        </GradientView>
      ) : (
        <PillButton label="Get Recommendation" size="lg" onPress={getRecommendation} icon={<AppIcon name="sparkles" size={17} color="#FFFFFF" />} />
      )}

      {recommendation ? (
        <PillButton label="Clear and try another" variant="outline" onPress={reset} />
      ) : null}
    </Screen>
  );
}

function InputBlock({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHeader}>
        <Text style={styles.blockLabel}>{label}</Text>
        {value ? <Text style={styles.blockValue}>{value}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.probRow}>
      <Text style={[styles.probLabel, { color }]}>{label}</Text>
      <View style={styles.probTrack}>
        <View style={[styles.probFill, { width: `${value}%`, backgroundColor: 'rgba(255,255,255,0.85)' }]} />
      </View>
      <Text style={[styles.probValue, { color }]}>{value}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sportRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  inputCard: {
    gap: 18,
  },
  inputTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#14121F',
  },
  block: {
    gap: 8,
  },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blockLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6E7280',
  },
  blockValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#14121F',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#F0F1F5',
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  segmentBtn: {
    flex: 1,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#9AA0B5',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 1,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6E7280',
  },
  segmentTextActive: {
    color: '#14121F',
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  counterBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EFEEFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#14121F',
    minWidth: 40,
    textAlign: 'center',
  },
  recCard: {
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  recLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  recAnswer: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  recBars: {
    gap: 8,
  },
  probRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  probLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    width: 84,
  },
  probTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  probFill: {
    height: '100%',
    borderRadius: 5,
  },
  probValue: {
    fontSize: 12,
    fontWeight: '800',
    width: 38,
    textAlign: 'right',
  },
  recDiff: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  recNoteBox: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 12,
    padding: 12,
  },
  recNote: {
    color: '#FFFFFF',
    fontSize: 12.5,
    lineHeight: 18,
  },
  recConfidence: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
  },
});
