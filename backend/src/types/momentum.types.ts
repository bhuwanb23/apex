/**
 * Momentum module types (Phase 5, Step 2).
 * Field names mirror the Python POST /momentum responses (Pydantic
 * MomentumSeasonResponse / MomentumGameResponse) and the MomentumAnalysis /
 * MomentumGameData / TimeoutRecommendations tables.
 */
import type { SportAbbreviation } from './shared.types.js';

/** Cox verdict labels as produced by the Python model. */
export type MomentumVerdict = 'significant' | 'not_significant' | 'insufficient_data';

/** Season-level Cox model findings for a sport (the statistical view). */
export interface MomentumResult {
  sport: SportAbbreviation;
  season: string;
  hazardCoefficient: number | null;
  pValue: number | null;
  confidenceIntervalLow: number | null;
  confidenceIntervalHigh: number | null;
  isSignificant: boolean;
  effectSize: number | null;
  hazardRateChange: number | null;
  gamesAnalyzed: number;
  playsAnalyzed: number;
  verdictLabel: MomentumVerdict;
  plainExplanation: string;
  shortExplanation: string;
  computedAt: string; // ISO timestamp
}

/** One event in a game's momentum timeline. */
export interface MomentumTimelineEvent {
  gameTimeSeconds: number;
  homeMomentumScore: number;
  awayMomentumScore: number;
  eventDescription: string | null;
}

/** Per-game momentum timeline (powers the replay scrubber). */
export interface GameMomentumTimeline {
  gameId: string;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  homeTeamMomentum: number[];
  awayTeamMomentum: number[];
  timelineEvents: MomentumTimelineEvent[];
  peakHomeMomentum: number;
  peakAwayMomentum: number;
  momentumShifts: number;
  longestStreak: number;
  computedAt?: string; // ISO timestamp
}

/** Compact per-sport result for the side-by-side comparison panel. */
export interface SportMomentumSummary {
  sport: SportAbbreviation;
  verdictLabel: MomentumVerdict;
  hazardCoefficient: number | null;
  pValue: number | null;
  effectSize: number | null;
  isSignificant: boolean;
  shortExplanation: string;
}

/** GET /api/momentum/analysis/:sport — nested statistical view. */
export interface MomentumAnalysisResponse {
  sport: SportAbbreviation;
  season: string;
  verdict: {
    verdictLabel: MomentumVerdict;
    isSignificant: boolean;
    shortExplanation: string;
  };
  statistics: {
    hazardCoefficient: number | null;
    pValue: number | null;
    confidenceIntervalLow: number | null;
    confidenceIntervalHigh: number | null;
    effectSize: number | null;
  };
  context: {
    gamesAnalyzed: number;
    /** Only accurate on fresh computations — the column isn't persisted, so cached rows report 0. */
    playsAnalyzed: number;
    streakThreshold: number | null;
  };
  plainExplanation: string;
  computedAt: string; // ISO timestamp
  /** Set when a stale cached analysis is served because the ML service is down. */
  warning?: string | null;
}

/** GET /api/momentum/game/:gameId — timeline with game context. */
export interface GameMomentumResponse {
  game: {
    gameId: number;
    date: string; // ISO timestamp
    homeTeam: string;
    awayTeam: string;
    finalScore: string | null; // "112-98" once both scores are final
  };
  timeline: {
    homeTeamMomentum: number[];
    awayTeamMomentum: number[];
    events: MomentumTimelineEvent[];
  };
  summary: {
    peakHomeMomentum: number;
    peakAwayMomentum: number;
    momentumShifts: number;
    longestStreak: {
      length: number;
      teamName: string | null;
      startTime: string | null; // game clock of the streak's first score
    };
  };
  computedAt: string; // ISO timestamp
  warning?: string | null;
}

/** GET /api/momentum/timeout/:sport — optimizer result with context. */
export interface TimeoutRecommendationResponse {
  situation: {
    consecutiveScores: number;
    scoreDiff: number;
    timeRemaining: number;
    period: number;
    timeoutsAvailable: number;
  };
  recommendation: {
    shouldCallTimeout: boolean;
    stopProbabilityWith: number;
    stopProbabilityWithout: number;
    probabilityDiff: number;
    confidenceLevel: string; // 'high' | 'medium' | 'low'
    recommendationText: string;
  };
  /** Precomputed scenarios the recommendation engine is based on for this sport. */
  basedOnSampleSize: number;
}

/** All sports side by side, sorted by effect size. */
export interface SportComparison {
  season: string;
  sports: SportMomentumSummary[];
  generatedAt: string; // ISO timestamp
}

/** Timeout optimizer result (POST /timeout/recommend / precomputed row). */
export interface TimeoutRecommendation {
  scenarioKey?: string;
  consecutiveScores: number;
  scoreDiff: number;
  timeRemaining: number;
  period: number;
  timeoutsAvailable: number;
  shouldCallTimeout: boolean;
  stopProbabilityWith: number;
  stopProbabilityWithout: number;
  probabilityDiff: number;
  confidenceLevel: string; // 'high' | 'medium' | 'low'
  recommendationText: string;
}
