/**
 * Injury module types (Phase 5, Step 2).
 * Field names mirror the Python POST /injury/compute-risk response (Pydantic
 * InjuryRiskResponse) plus the player/team context added by the Node service.
 */
import type { SportAbbreviation } from './shared.types.js';

/** Player risk zones as produced by the Python model. */
export type RiskZone = 'green' | 'yellow' | 'red' | 'insufficient_data';

/** Zones returned by league-alert queries (never insufficient_data). */
export type AlertZone = 'red' | 'yellow';

/** Full risk profile for one player (the single-player view). */
export interface PlayerRiskProfile {
  /** External player id (sports-API id, per the Python contract). Routes
   * address players by DB id — services resolve DB id → external id. */
  playerId: string;
  playerName: string | null;
  teamId?: number | null; // DB team id (added by the Node service)
  teamName?: string | null;
  sport?: SportAbbreviation | null;
  riskScore: number | null; // 0-100 composite; null = insufficient data
  zone: RiskZone;
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
  dataPointsUsed: number; // games in the baseline window
  computedAt: string; // ISO timestamp
}

/** Roster-wide risk summary for a team (the trainer dashboard view). */
export interface TeamRiskSummary {
  teamId: number;
  teamName: string;
  sport: SportAbbreviation;
  /** Players sorted by riskScore descending (red zone first). */
  players: PlayerRiskProfile[];
  redCount: number;
  yellowCount: number;
  greenCount: number;
  lastUpdated: string; // ISO timestamp
}

/** One league-wide alert (red-zone player). */
export interface RiskAlert {
  playerId: string;
  playerName: string;
  teamName: string;
  position?: string;
  riskScore: number;
  zone: AlertZone;
  triggerMetric: string | null;
  explanation: string;
}
