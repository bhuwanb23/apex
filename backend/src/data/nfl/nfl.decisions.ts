// Coach decision extraction (Step 5.3).
// Takes raw nfl_data_py play-by-play and pulls out every coaching decision:
// 4th down (go for it / punt / field goal), timeouts, and 2-point attempts.
// Returns structured observations ready to map into the CoachDecisions table
// (coachId, win probability and EV fields are added by downstream analysis).

import type { NflPlay } from './nfl.types.js';

export type NflDecisionType = 'fourth_down' | 'timeout' | 'two_point_conversion';

export interface NflCoachDecision {
  gameId: string;
  playId: number;
  decisionType: NflDecisionType;
  qtr: number | null; // quarter / period
  clock: string | null; // "MM:SS" derived from game_seconds_remaining
  gameTimeSeconds: number | null;
  // Sign convention varies by source: Python pbp is posteam-perspective
  // (positive = posteam ahead); the ESPN fallback is home − away.
  scoreDiff: number | null;
  team: string | null; // team abbreviation making the decision
  chosenAction: string; // go_for_it | punt | field_goal | timeout | two_point_attempt
  context: Record<string, unknown>; // situation: yard line, yards to go, description
  outcome: string | null; // converted / failed / success / failure
  outcomeSuccess: boolean | null;
}

/** Play types that count as "going for it" on 4th down. */
const GO_FOR_IT_TYPES = new Set(['run', 'pass', 'qb_kneel', 'qb_spike', 'sack']);

function formatClock(seconds: number | null): string | null {
  if (seconds === null || seconds < 0) return null;
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function fourthDownOutcome(play: NflPlay): {
  outcome: string | null;
  outcomeSuccess: boolean | null;
} {
  if (play.fourth_down_converted) return { outcome: 'converted', outcomeSuccess: true };
  if (play.fourth_down_failed) return { outcome: 'failed', outcomeSuccess: false };
  return { outcome: null, outcomeSuccess: null };
}

/**
 * Extracts every coaching decision from a game's play-by-play:
 * - 4th down plays → go_for_it / punt / field_goal with the situation
 *   (yards to go, field position, score diff, time) and the result.
 * - Timeout plays → who called it and when.
 * - 2-point conversion attempts → success/failure.
 */
export function extractCoachDecisions(plays: NflPlay[]): NflCoachDecision[] {
  const decisions: NflCoachDecision[] = [];

  for (const play of plays) {
    const base = {
      gameId: play.game_id,
      playId: play.play_id,
      qtr: play.qtr ?? null,
      clock: formatClock(play.game_seconds_remaining),
      gameTimeSeconds: play.game_seconds_remaining,
      scoreDiff: play.score_differential,
      team: play.posteam ?? null,
    };

    if (play.down === 4) {
      const { outcome, outcomeSuccess } = fourthDownOutcome(play);
      let chosenAction = 'unknown';
      if (GO_FOR_IT_TYPES.has(play.play_type ?? '')) chosenAction = 'go_for_it';
      else if (play.play_type === 'punt') chosenAction = 'punt';
      else if (play.play_type === 'field_goal') chosenAction = 'field_goal';

      decisions.push({
        ...base,
        decisionType: 'fourth_down',
        chosenAction,
        context: {
          yardsToGo: play.ydstogo,
          yardLine: play.yardline_100,
          playType: play.play_type,
          description: play.desc,
        },
        outcome,
        outcomeSuccess,
      });
      continue;
    }

    if (play.timeout || play.timeout_team) {
      decisions.push({
        ...base,
        decisionType: 'timeout',
        chosenAction: 'timeout',
        team: play.timeout_team ?? play.posteam ?? null,
        context: { playType: play.play_type, description: play.desc },
        outcome: null,
        outcomeSuccess: null,
      });
      continue;
    }

    if (play.two_point_conv_result === 'success' || play.two_point_conv_result === 'failure') {
      decisions.push({
        ...base,
        decisionType: 'two_point_conversion',
        chosenAction: 'two_point_attempt',
        context: { playType: play.play_type, description: play.desc },
        outcome: play.two_point_conv_result,
        outcomeSuccess: play.two_point_conv_result === 'success',
      });
    }
  }

  return decisions;
}
