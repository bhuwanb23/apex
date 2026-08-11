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
  isSignificant: boolean;
  shortExplanation: string;
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
