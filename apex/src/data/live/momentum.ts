/**
 * Momentum module live data (integration plan: "Momentum Overview / Game
 * Replay / Sport Comparison / Timeout Optimizer — How It Works").
 *
 * The backend runs the Cox hazard models; the app only renders verdicts,
 * timelines and recommendations.
 */

import { useMemo } from 'react';

import { api, type GameMomentumResponse } from '@/lib/api';
import { useApiData } from '@/hooks/use-api-data';
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
  /** When the backend computed the analysis — drives freshness display. */
  computedAt?: string | null;
}

function mapVerdictLabel(label: string): VerdictLabel {
  if (label === 'real' || label === 'significant') return 'real';
  if (label === 'myth' || label === 'not_significant') return 'myth';
  return 'inconclusive';
}

/** Backend MomentumVerdict → screen verdict shape. The backend nests the
 *  verdict fields under `verdict` — tolerate the flat shape too. */
export function verdictToShape(sport: SportId, v: {
  verdict?: { verdictLabel?: string; isSignificant?: boolean; shortExplanation?: string };
  verdictLabel?: string;
  isSignificant?: boolean;
  plainExplanation?: string;
  shortExplanation?: string;
  season?: string;
  computedAt?: string | null;
  statistics?: {
    hazardCoefficient?: number | null;
    pValue?: number | null;
    confidenceIntervalLow?: number | null;
    confidenceIntervalHigh?: number | null;
    effectSize?: number | null;
  };
  context?: { gamesAnalyzed?: number };
}): VerdictShape {
  const verdict = v.verdict ?? {};
  const isSignificant = verdict.isSignificant ?? v.isSignificant ?? false;
  const verdictLabel = verdict.verdictLabel ?? v.verdictLabel ?? '';
  const label = isSignificant ? 'real' : mapVerdictLabel(verdictLabel);
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
    explanation: v.plainExplanation ?? verdict.shortExplanation ?? v.shortExplanation ?? '',
    computedAt: v.computedAt ?? null,
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
    [sport],
    `momentum:${sport}`
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
  }, [gameId]);

  const result = useApiData<Game>(
    async () => {
      if (!gameId) return null;
      const g = await api.gameMomentum(Number(gameId));
      const events = g.timeline?.events ?? [];
      if (events.length === 0) return null;
      return momentumToGame(g, sport);
    },
    fallback,
    [gameId, sport]
  );
  return result;
}

/**
 * Backend timeline response → screen Game shape.
 *
 * The backend stores one `timeline.events` entry per scoring event, each with
 * the game clock and both momentum scores — that IS the chart's point series.
 * Team attribution and swing are derived from the momentum deltas (the scorer
 * is whichever side's momentum jumped); the app only reshapes, it doesn't
 * compute momentum itself.
 */
function momentumToGame(g: GameMomentumResponse, sport: SportId): Game {
  const events = g.timeline.events ?? [];
  const lastTime = events.length > 0 ? events[events.length - 1].gameTimeSeconds : 0;
  const totalMinutes = Math.max(1, lastTime / 60);
  const quarterLen = Math.max(1, totalMinutes / 4);
  const scale = Math.max(
    1,
    ...events.map(e => Math.abs(e.homeMomentumScore)),
    ...events.map(e => Math.abs(e.awayMomentumScore))
  );

  const timeLabel = (seconds: number): string => {
    const q = Math.min(3, Math.floor(seconds / 60 / quarterLen));
    const secsInQ = seconds - q * quarterLen * 60;
    const clock = Math.max(0, quarterLen * 60 - secsInQ);
    const mm = Math.floor(clock / 60);
    const ss = Math.round(clock % 60);
    return `Q${q + 1} - ${mm}:${ss.toString().padStart(2, '0')}`;
  };

  const timeline = events.map(p => ({
    time: p.gameTimeSeconds,
    label: timeLabel(p.gameTimeSeconds),
    // Chart expects a ±100-ish domain — normalize against the peak.
    home: (p.homeMomentumScore / scale) * 100,
    away: (p.awayMomentumScore / scale) * 100,
  }));

  const screenEvents = events.map((ev, i) => {
    const prevHome = i > 0 ? events[i - 1].homeMomentumScore : 0;
    const prevAway = i > 0 ? events[i - 1].awayMomentumScore : 0;
    const homeDelta = ev.homeMomentumScore - prevHome;
    const awayDelta = ev.awayMomentumScore - prevAway;
    const team: 'home' | 'away' = homeDelta >= awayDelta ? 'home' : 'away';
    const swing = Math.round((Math.max(homeDelta, awayDelta) / scale) * 100);
    return {
      time: ev.gameTimeSeconds,
      label: timeLabel(ev.gameTimeSeconds),
      description: ev.eventDescription ?? '',
      team,
      swing,
    };
  });

  // "Held momentum longest" — the side that led in momentum for more game time.
  let homeLead = 0;
  let awayLead = 0;
  for (let i = 0; i < timeline.length; i += 1) {
    const p = timeline[i];
    const next = timeline[i + 1];
    const span = (next?.time ?? p.time) - p.time;
    if (p.home > p.away) homeLead += span;
    else if (p.away > p.home) awayLead += span;
  }
  const momentumLeader = homeLead >= awayLead ? g.game.homeTeam : g.game.awayTeam;

  const [homeScore, awayScore] = (g.game.finalScore ?? '-').split('-').map(s => Number(s.trim()));
  return {
    id: String(g.game.gameId),
    sport,
    homeTeam: g.game.homeTeam ?? 'Home',
    awayTeam: g.game.awayTeam ?? 'Away',
    homeScore: Number.isFinite(homeScore) ? homeScore : 0,
    awayScore: Number.isFinite(awayScore) ? awayScore : 0,
    date: (g.game.date ?? '').slice(0, 10),
    nightsAgo: 0,
    season: '',
    homeCoach: '',
    awayCoach: '',
    homeEvRate: 0,
    awayEvRate: 0,
    momentumShifts: g.summary?.momentumShifts ?? 0,
    longestStreak: g.summary?.longestStreak?.teamName
      ? `${g.summary.longestStreak.length} · ${g.summary.longestStreak.teamName}`
      : String(g.summary?.longestStreak?.length ?? 0),
    momentumLeader,
    verdict: '',
    timeline,
    events: screenEvents,
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
