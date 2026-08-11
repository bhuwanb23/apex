/**
 * Decision module types (Phase 5, Step 2).
 * Field names mirror the Python POST /decisions/compute-ev response (Pydantic
 * DecisionEVResponse) and the CoachDecisions / DecisionEVScores tables.
 */
import type { SportAbbreviation } from './shared.types.js';

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
  /** From the Python EV model — only present once EV has been computed. */
  explanation?: string;
}

/** Coach leaderboard (Module 2 main view). */
export interface CoachLeaderboard {
  sport: SportAbbreviation;
  season: string;
  decisionType: string;
  gameType?: string;
  coaches: CoachScorecard[];
  generatedAt: string; // ISO timestamp
}

/** Process vs outcome 2x2 counts for a coach's decision drill-down. */
export interface ProcessVsOutcome {
  goodProcessGoodOutcome: number;
  goodProcessBadOutcome: number;
  badProcessGoodOutcome: number;
  badProcessBadOutcome: number;
}
