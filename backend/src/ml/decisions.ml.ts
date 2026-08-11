/**
 * Decisions ML client — POSTs a game situation to the Python EV model
 * (POST /decisions/compute-ev) and returns the optimality assessment.
 *
 * Note: the docs' computeCoachScorecard has no Python endpoint (the router
 * only exposes /compute-ev) — season scorecards are aggregated from the
 * CoachDecisions table by refreshCoachScorecard (Step 11) instead.
 */
import { mlClient, type MLClient } from './ml.client.js';
import type { DecisionEVResult } from '../types/decision.types.js';

/** POST /decisions/compute-ev request — mirrors the Python DecisionEVRequest. */
export interface DecisionEVInput {
  sport: string; // 'NFL' | 'NBA' | 'MLB'
  decisionType: string; // '4th_down' | 'timeout' | '2pt_conversion' | ...
  gameContext: {
    sport: string;
    scoreDiff: number; // decision team's perspective
    timeRemainingSeconds: number;
    period: number;
    down?: number | null;
    yardsToGo?: number | null;
    fieldPosition?: number | null; // yards to opponent goal line
    timeoutsRemaining?: number | null;
    isHome?: boolean | null;
  };
  chosenAction: string; // what the coach actually did
  availableActions?: string[]; // options that were available
}

export interface DecisionsMLClient {
  computeDecisionEV(input: DecisionEVInput): Promise<DecisionEVResult>;
}

export function createDecisionsClient(client: MLClient = mlClient): DecisionsMLClient {
  return {
    computeDecisionEV: input => client.post<DecisionEVResult>('/decisions/compute-ev', input),
  };
}

/** Shared instance — import this, don't construct your own (tests use createDecisionsClient). */
export const decisionsML = createDecisionsClient();
