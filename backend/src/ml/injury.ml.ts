/**
 * Injury ML client — POSTs workload game logs to the Python injury model
 * (POST /injury/compute-risk) and returns the computed risk score.
 */
import { mlClient, type MLClient } from './ml.client.js';

/** One workload row — mirrors the Python GameLogInput schema. */
export interface InjuryGameLogInput {
  date: string; // YYYY-MM-DD
  minutesPlayed?: number | null;
  distanceCovered?: number | null;
  highIntensityEvents?: number | null;
  backToBack: boolean;
  daysRestBefore?: number | null;
}

export interface InjuryRiskInput {
  playerId: string; // external player id (sports-API id)
  playerName?: string | null;
  sport: string; // 'NBA' | 'NFL' | 'MLB'
  gameLogs: InjuryGameLogInput[];
  windowDays?: number; // default 7
  baselineDays?: number; // default 21
}

/** Raw /injury/compute-risk response — exact Python Pydantic shape. */
export interface InjuryRiskScore {
  playerId: string;
  riskScore: number | null;
  zone: string; // 'green' | 'yellow' | 'red' | 'insufficient_data'
  triggerMetric: string | null;
  minutesZScore: number | null;
  distanceZScore: number | null;
  intensityZScore: number | null;
  backToBackFlag: boolean;
  baselineMeanMinutes: number | null;
  baselineStdMinutes: number | null;
  explanation: string;
  windowStart: string | null;
  windowEnd: string | null;
  dataPointsUsed: number;
  computedAt: string;
}

export interface InjuryMLClient {
  computePlayerRisk(input: InjuryRiskInput): Promise<InjuryRiskScore>;
  /** Batch variant — one HTTP call for up to ~25 players (risk job). */
  computePlayerRiskBatch(inputs: InjuryRiskInput[]): Promise<InjuryRiskScore[]>;
}

export function createInjuryClient(client: MLClient = mlClient): InjuryMLClient {
  return {
    computePlayerRisk: input => client.post<InjuryRiskScore>('/injury/compute-risk', input),
    computePlayerRiskBatch: inputs =>
      client
        .post<{ results: InjuryRiskScore[] }>('/injury/compute-risk/batch', { players: inputs })
        .then(res => res.results),
  };
}

/** Shared instance — import this, don't construct your own (tests use createInjuryClient). */
export const injuryML = createInjuryClient();
