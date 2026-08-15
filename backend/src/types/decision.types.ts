/**
 * Decision module types (Phase 5, Step 2).
 * Field names mirror the Python POST /decisions/compute-ev response (Pydantic
 * DecisionEVResponse) and the CoachDecisions / DecisionEVScores tables.
 */
import type { PaginatedMeta, SportAbbreviation } from './shared.types.js';

/** Decision-type filter values accepted by the decisions routes.
 * '2pt' is the API-facing alias for the stored '2pt_conversion' value. */
export const DECISION_TYPE_FILTERS = [
  'all',
  '4th_down',
  'timeout',
  '2pt',
  '2pt_conversion',
  'challenge',
  'lineup',
  'foul_strategy',
  'shot_selection',
  'intentional_walk',
] as const;
export type DecisionTypeFilter = (typeof DECISION_TYPE_FILTERS)[number];

/** Leaderboard trend vs the previous 30-day window. */
export type CoachTrend = 'up' | 'down' | 'same';

/** One evaluated option from the Python EV model (AlternativeAction). */
export interface AlternativeAction {
  action: string;
  ev: number;
  probSuccess: number | null;
  wpIfSuccess: number | null;
  wpIfFailure: number | null;
}

/** Raw result of POST /decisions/compute-ev (used by the ML client + services). */
export interface DecisionEVResult {
  decisionType: string;
  evChosen: number;
  evBest: number;
  evDifference: number;
  isOptimal: boolean;
  winProbBefore: number | null;
  winProbabilityBefore: number | null;
  allOptions: AlternativeAction[];
  explanation: string;
}

/** Season-level scorecard per coach (DecisionEVScores row + team name). */
export interface CoachScorecard {
  coachId: number;
  coachName: string;
  teamName: string;
  sport: SportAbbreviation;
  season: string;
  decisionType: string;
  totalDecisions: number;
  optimalDecisions: number;
  evRate: number; // percentage of optimal decisions
  avgEvDifference: number | null;
  totalEvLeft?: number | null;
  rank: number | null;
  /** Direction vs the prior 30-day window ('up' / 'down' / 'same'). */
  trend?: CoachTrend;
  computedAt: string; // ISO timestamp
}

/** One coaching decision with game context (CoachDecisions row + joins). */
export interface DecisionDetail {
  id: number;
  gameId: number;
  gameDate: string;
  opponent: string | null;
  decisionType: string;
  period: number;
  clock: string | null;
  scoreDiff: number;
  chosenAction: string;
  evChosen: number;
  evBest: number;
  evDifference: number;
  isOptimal: boolean;
  alternativeActions: AlternativeAction[] | Record<string, unknown>;
  outcome: string | null;
  outcomeSuccess: boolean | null;
  /** Human-readable game context, e.g. "4:22 left · Q4 · down by 3 · 4th & 2". */
  situation?: string;
  /** Win probability before the decision, 0-1 (from the EV model). */
  winProbabilityBefore?: number | null;
  /** From the Python EV model — only present once EV has been computed. */
  explanation?: string;
}

/** A decision as shown in the coach drill-down (adds display fields). */
export interface CoachDecisionEntry extends DecisionDetail {
  gameDateFormatted: string; // e.g. "Dec 25, 2024"
  opponentName: string | null;
}

/** Coach leaderboard (Module 2 main view). */
export interface CoachLeaderboard {
  sport: SportAbbreviation;
  season: string;
  decisionType: string;
  gameType: string;
  coaches: CoachScorecard[];
  generatedAt: string; // ISO timestamp
  meta: PaginatedMeta;
}

/** Process vs outcome 2x2 counts for a coach's decision drill-down. */
export interface ProcessVsOutcome {
  goodProcessGoodOutcome: number;
  goodProcessBadOutcome: number;
  badProcessGoodOutcome: number;
  badProcessBadOutcome: number;
}

/** GET /api/decisions/coach/:coachId — drill-down with context + summary. */
export interface CoachDrillDown {
  coach: {
    coachId: number;
    coachName: string;
    teamName: string;
    sport: SportAbbreviation;
  };
  summary: {
    totalDecisions: number;
    optimalDecisions: number;
    evRate: number; // percentage of optimal decisions
    /** Average EV difference per decision (fraction) — "EV left on the table". */
    avgEvDifference: number | null;
    rank: number | null; // league rank for the season (null if unranked)
  };
  processVsOutcome: ProcessVsOutcome;
  decisions: CoachDecisionEntry[];
  meta: PaginatedMeta;
}

/** GET /api/decisions/game/:gameId — both coaches' decisions in one game. */
export interface GameDecisions {
  game: {
    gameId: number;
    date: string; // ISO timestamp
    homeTeam: string;
    awayTeam: string;
    finalScore: string | null; // "112-98" once both scores are final
  };
  homeCoachDecisions: DecisionDetail[];
  awayCoachDecisions: DecisionDetail[];
  gameSummary: {
    totalDecisions: number;
    optimalDecisions: number;
    biggestMistake: DecisionDetail | null; // highest evDifference
  };
}
