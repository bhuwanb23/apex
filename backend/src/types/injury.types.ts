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
  position?: string | null; // position abbreviation, for roster displays
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
  /** Recent-window (7-day) means per workload metric — what the app shows as
   *  "recent" next to the baseline (computed here; not stored in SQLite). */
  recentMeanMinutes: number | null;
  recentMeanDistance: number | null;
  recentMeanIntensity: number | null;
  explanation: string;
  windowStart: string | null;
  windowEnd: string | null;
  /** Games in the baseline window. Only present on fresh Python results
   * (the column isn't stored in SQLite, so cached rows omit it). */
  dataPointsUsed?: number;
  computedAt: string; // ISO timestamp
  /** Set when a stale cached score is served because the ML service is down. */
  warning?: string | null;
}

/** One risk-score snapshot for the trend chart. */
export interface RiskHistoryEntry {
  computedAt: string; // ISO timestamp
  riskScore: number;
  zone: string;
  triggerMetric: string | null;
}

/** Workload summary shown alongside a player's risk profile. */
export interface GameLogSummary {
  gamesLast7Days: number;
  gamesLast21Days: number;
  avgMinutesLast21Days: number | null;
}

/** One recent game's workload — feeds the minutes-per-game chart. */
export interface GameLogPoint {
  date: string; // YYYY-MM-DD
  minutesPlayed: number | null;
  distanceCovered: number | null;
  highIntensityEvents: number | null;
  backToBack: boolean;
  /** Backend-computed: minutes exceeded the baseline threshold (the spike the chart highlights). */
  isSpike: boolean;
}

/** GET /api/injury/player/:id — the full single-player view. */
export interface PlayerRiskResponse extends PlayerRiskProfile {
  gameLogSummary: GameLogSummary;
  /** Last 21 game logs, oldest first, for the workload chart. */
  gameLogs: GameLogPoint[];
  /** Last 10 computed scores, oldest first, for the trend chart. */
  history: RiskHistoryEntry[];
}

/** GET /api/injury/counts/:sport — zone counts across a league (no 100-row cap). */
export interface InjuryCountsResponse {
  sport: SportAbbreviation;
  /** Players with a latest risk score, by zone (players without a score are not counted). */
  counts: { red: number; yellow: number; green: number };
  /** Players with any latest score (red + yellow + green). */
  totalScored: number;
  /** Active players in the league (the roster denominator). */
  totalPlayers: number;
  generatedAt: string;
}

/** Roster-wide risk summary for a team (the trainer dashboard view). */
export interface TeamRiskSummary {
  teamId: number;
  teamName: string;
  sport: SportAbbreviation;
  /** Zone counts across the roster (players without a score are not counted). */
  summary: {
    redCount: number;
    yellowCount: number;
    greenCount: number;
  };
  /** Players sorted by riskScore descending (red zone first). */
  players: PlayerRiskProfile[];
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
  /** How long the player has been in this zone, in days — the span of the
   *  current consecutive run of scores in the same zone. 0 = brand-new flag. */
  daysInZone: number;
}
