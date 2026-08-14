/**
 * Momentum module live data (integration plan: "Momentum Overview / Game
 * Replay / Sport Comparison / Timeout Optimizer — How It Works").
 *
 * The backend runs the Cox hazard models; the app only renders verdicts,
 * timelines and recommendations.
 */

import { useMemo } from 'react';

import { api, type GameMomentumResponse } from '@/lib/api';
import { useApiData, type DataSource } from '@/hooks/use-api-data';
import { MOMENTUM_VERDICTS, type SportId } from '@/data/mock/sports';
import { GAMES, type Game } from '@/data/mock/games';

export type VerdictLabel = 'real' | 'myth' | 'inconclusive';

export interface VerdictShape {
  sport: SportId;
  verdict: VerdictLabel;
  effectSize: number;
  pValue: number;
  hazardCoefficient: number;
  ciLow: number;
  ciHigh: number;
  gamesAnalyzed: number;
  season: string;
  explanation: string;
}

function mapVerdictLabel(label: string): VerdictLabel {
  if (label === 'real' || label === 'significant') return 'real';
  if (label === 'myth' || label === 'not_significant') return 'myth';
  return 'inconclusive';
}

/** Backend MomentumVerdict → screen verdict shape. */
export function verdictToShape(sport: SportId, v: {
  verdictLabel: string;
  isSignificant?: boolean;
  plainExplanation?: string;
  shortExplanation?: string;
  season?: string;
  statistics?: {
    hazardCoefficient?: number | null;
    pValue?: number | null;
    confidenceIntervalLow?: number | null;
    confidenceIntervalHigh?: number | null;
    effectSize?: number | null;
  };
  context?: { gamesAnalyzed?: number };
}): VerdictShape {
  const label = v.isSignificant ? 'real' : mapVerdictLabel(v.verdictLabel);
  return {
    sport,
    verdict: label,
    effectSize: v.statistics?.effectSize ?? 0,
    pValue: v.statistics?.pValue ?? 1,
    hazardCoefficient: v.statistics?.hazardCoefficient ?? 1,
    ciLow: v.statistics?.confidenceIntervalLow ?? 0,
    ciHigh: v.statistics?.confidenceIntervalHigh ?? 0,
    gamesAnalyzed: v.context?.gamesAnalyzed ?? 0,
    season: v.season ?? '',
    explanation: v.plainExplanation ?? v.shortExplanation ?? '',
  };
}

// ---------------------------------------------------------------------------
// Momentum overview (per sport)
// ---------------------------------------------------------------------------

export function useMomentumAnalysis(sport: SportId) {
  const fallback = useMemo(
    () => MOMENTUM_VERDICTS.find(v => v.sport === sport) ?? MOMENTUM_VERDICTS[0],
    [sport]
  );
  const result = useApiData<VerdictShape>(
    async () => {
      const v = await api.momentumAnalysis(sport);
      const hasGames = (v.context?.gamesAnalyzed ?? 0) > 0;
      if (!hasGames) return null;
      return verdictToShape(sport, v);
    },
    fallback,
    [sport]
  );
  return result;
}

// ---------------------------------------------------------------------------
// Sport comparison
// ---------------------------------------------------------------------------

export interface ComparisonRow {
  sport: SportId;
  verdict: VerdictLabel;
  effectSize: number;
  pValue: number;
  isSignificant: boolean;
  shortExplanation: string;
}

export function useMomentumComparison(season?: string) {
  const fallback = useMemo(
    () =>
      MOMENTUM_VERDICTS.map(v => ({
        sport: v.sport,
        verdict: v.verdict,
        effectSize: v.effectSize,
        pValue: v.pValue,
        isSignificant: v.verdict === 'real',
        shortExplanation: v.explanation,
      })).sort((a, b) => b.effectSize - a.effectSize),
    []
  );

  const result = useApiData<ComparisonRow[]>(
    async () => {
      const res = await api.momentumComparison(season);
      if (res.sports.length === 0) return null;
      return res.sports
        .map(s => ({
          sport: s.sport as SportId,
          verdict: s.isSignificant ? 'real' : mapVerdictLabel(s.verdictLabel),
          effectSize: s.effectSize ?? 0,
          pValue: s.pValue ?? 1,
          isSignificant: s.isSignificant,
          shortExplanation: s.shortExplanation,
        }))
        .sort((a, b) => b.effectSize - a.effectSize);
    },
    fallback,
    [season]
  );
  return result;
}

// ---------------------------------------------------------------------------
// Game replay (momentum timeline)
// ---------------------------------------------------------------------------

export function useGameMomentum(gameId: string | undefined, sport: SportId) {
  const fallback = useMemo(() => {
    const game = GAMES.find(g => g.id === gameId) ?? GAMES[0];
    return game;
  }, [gameId, sport]);

  const result = useApiData<Game>(
    async () => {
      if (!gameId) return null;
      const g = await api.gameMomentum(Number(gameId));
      if (!g.timeline || g.timeline.length === 0) return null;
      return momentumToGame(g, sport);
    },
    fallback,
    [gameId, sport]
  );
  return result;
}

/** Backend timeline response → screen Game shape (with mock timeline mapping). */
function momentumToGame(g: GameMomentumResponse, sport: SportId): Game {
  const lastTime = g.timeline[g.timeline.length - 1]?.gameTimeSeconds ?? 0;
  const totalMinutes = Math.max(1, lastTime / 60);
  const quarterLen = Math.max(1, totalMinutes / 4);
  return {
    id: String(g.gameId),
    sport,
    homeTeam: g.homeTeamName ?? 'Home',
    awayTeam: g.awayTeamName ?? 'Away',
    homeScore: g.homeScore ?? 0,
    awayScore: g.awayScore ?? 0,
    date: '',
    nightsAgo: 0,
    season: '',
    homeCoach: '',
    awayCoach: '',
    homeEvRate: 0,
    awayEvRate: 0,
    momentumShifts: g.momentumShifts ?? 0,
    longestStreak: g.longestStreak ?? '',
    momentumLeader: g.momentumLeader ?? '',
    verdict: '',
    timeline: g.timeline.map((p, i) => {
      const q = Math.min(3, Math.floor(p.gameTimeSeconds / 60 / quarterLen));
      const secsInQ = p.gameTimeSeconds - q * quarterLen * 60;
      const clock = Math.max(0, quarterLen * 60 - secsInQ);
      const mm = Math.floor(clock / 60);
      const ss = Math.round(clock % 60);
      const label = `Q${q + 1} - ${mm}:${ss.toString().padStart(2, '0')}`;
      // Screen chart expects ±100 scale — backend values are already ±100-ish.
      const scale = Math.max(1, Math.abs(p.homeMomentum), Math.abs(p.awayMomentum));
      return {
        time: p.gameTimeSeconds,
        label,
        home: (p.homeMomentum / scale) * 100,
        away: (p.awayMomentum / scale) * 100,
      };
    }),
    events: (g.events ?? []).map(ev => ({
      time: ev.gameTimeSeconds,
      label: '',
      description: ev.description ?? '',
      team: (ev.team as 'home' | 'away') ?? 'home',
      swing: ev.swing ?? 0,
    })),
    decisions: [],
  };
}

// ---------------------------------------------------------------------------
// Timeout optimizer — called on demand (button press), not on mount.
// ---------------------------------------------------------------------------

export interface TimeoutRecommendationShape {
  shouldCallTimeout: boolean;
  stopProbabilityWith: number;
  stopProbabilityWithout: number;
  probabilityDiff: number;
  confidenceLevel: string;
  recommendationText: string;
  basedOnSampleSize: number;
}

const PERIOD_NUM: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4, OT: 5 };

/** Ask the backend for a recommendation; null when it has none for this sport. */
export async function fetchTimeoutRecommendation(
  sport: SportId,
  situation: { consecutiveScores: number; scoreDiff: number; minutes: number; period: string; timeoutsAvailable: number }
): Promise<TimeoutRecommendationShape | null> {
  try {
    const res = await api.timeoutRecommendation(sport, {
      consecutiveScores: situation.consecutiveScores,
      scoreDiff: situation.scoreDiff,
      timeRemaining: situation.minutes * 60,
      period: PERIOD_NUM[situation.period] ?? 4,
      timeoutsAvailable: situation.timeoutsAvailable,
    });
    return {
      shouldCallTimeout: res.recommendation.shouldCallTimeout,
      stopProbabilityWith: Math.round(res.recommendation.stopProbabilityWith * 100),
      stopProbabilityWithout: Math.round(res.recommendation.stopProbabilityWithout * 100),
      probabilityDiff: Math.round(res.recommendation.probabilityDiff * 100),
      confidenceLevel: res.recommendation.confidenceLevel,
      recommendationText: res.recommendation.recommendationText,
      basedOnSampleSize: res.basedOnSampleSize,
    };
  } catch {
    return null;
  }
}
