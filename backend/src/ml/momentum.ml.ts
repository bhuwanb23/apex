/**
 * Momentum + timeout ML client — POSTs play-by-play / scenarios to the Python
 * models (/momentum/compute-season, /momentum/compute-game, /timeout/recommend,
 * /timeout/precompute) and returns the computed results.
 */
import { mlClient, type MLClient } from './ml.client.js';

/** One play-by-play record — mirrors the Python MomentumPlayInput schema. */
export interface MomentumPlayInput {
  gameId: string; // external game id
  eventTimeSeconds: number;
  teamId?: string | null; // external team id (optional — the model can infer scorers from scores)
  isScoring: boolean;
  homeScore?: number | null;
  awayScore?: number | null;
  period: number;
  description?: string | null;
}

/** Raw /momentum/compute-season response — exact Python Pydantic shape. */
export interface SeasonMomentumResult {
  sport: string;
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
  verdictLabel: string; // 'significant' | 'not_significant' | 'insufficient_data'
  plainExplanation: string;
  shortExplanation: string;
}

/** One timeline event — mirrors the Python MomentumTimelineEvent schema. */
export interface MomentumTimelineEventResult {
  gameTimeSeconds: number;
  homeMomentumScore: number;
  awayMomentumScore: number;
  eventDescription: string | null;
}

/** Raw /momentum/compute-game response — exact Python Pydantic shape. */
export interface GameMomentumResult {
  gameId: string;
  homeTeamMomentum: number[];
  awayTeamMomentum: number[];
  timelineEvents: MomentumTimelineEventResult[];
  peakHomeMomentum: number;
  peakAwayMomentum: number;
  momentumShifts: number;
  longestStreak: number;
}

/** Raw /timeout/recommend response — exact Python Pydantic shape. */
export interface TimeoutRecommendationResult {
  shouldCallTimeout: boolean;
  stopProbabilityWith: number;
  stopProbabilityWithout: number;
  probabilityDiff: number;
  confidenceLevel: string; // 'high' | 'medium' | 'low'
  recommendationText: string;
}

/** One precomputed scenario — mirrors the Python TimeoutScenario schema. */
export interface TimeoutScenarioResult {
  scenarioKey: string;
  consecutiveScores: number;
  scoreDiff: number;
  timeRemaining: number;
  period: number;
  timeoutsAvailable: number;
  shouldCallTimeout: boolean;
  stopProbabilityWith: number;
  stopProbabilityWithout: number;
  probabilityDiff: number;
  recommendationText: string;
  confidenceLevel: string;
  computedAt: string;
}

export interface MomentumMLClient {
  computeSeasonMomentum(input: {
    sport: string;
    season: string;
    plays: MomentumPlayInput[];
  }): Promise<SeasonMomentumResult>;

  computeGameMomentum(input: {
    gameId: string;
    plays: MomentumPlayInput[];
    sport?: string;
  }): Promise<GameMomentumResult>;

  recommendTimeout(input: {
    sport: string; // lowercase code — 'nfl' | 'nba' | 'mlb'
    consecutiveScores: number;
    scoreDiff: number;
    timeRemaining: number;
    period: number;
    timeoutsAvailable: number;
  }): Promise<TimeoutRecommendationResult>;

  precomputeTimeouts(sport: string): Promise<{
    sport: string;
    count: number;
    scenarios: TimeoutScenarioResult[];
  }>;
}

export function createMomentumClient(client: MLClient = mlClient): MomentumMLClient {
  return {
    computeSeasonMomentum: input =>
      client.post<SeasonMomentumResult>('/momentum/compute-season', input),
    computeGameMomentum: input =>
      client.post<GameMomentumResult>('/momentum/compute-game', input),
    recommendTimeout: input => client.post<TimeoutRecommendationResult>('/timeout/recommend', input),
    precomputeTimeouts: sport =>
      client.post<{ sport: string; count: number; scenarios: TimeoutScenarioResult[] }>(
        '/timeout/precompute',
        { sport }
      ),
  };
}

/** Shared instance — import this, don't construct your own (tests use createMomentumClient). */
export const momentumML = createMomentumClient();
