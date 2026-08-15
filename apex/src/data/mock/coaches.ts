/** Mock coaches + decision-quality data for the demo screens. */

import type { SportId } from './sports';

export type DecisionType = '4th_down' | 'timeout' | '2pt_conversion' | 'intentional_walk';
export type OutcomeCell = 'good-good' | 'good-bad' | 'bad-good' | 'bad-bad';

/** One evaluated option from the EV model (mirrors the backend shape). */
export interface AlternativeAction {
  action: string;
  ev: number;
  probSuccess?: number | null;
  wpIfSuccess?: number | null;
  wpIfFailure?: number | null;
}

export interface Coach {
  id: string;
  name: string;
  team: string;
  sport: SportId;
  rank: number;
  evRate: number; // % of optimal decisions
  totalDecisions: number;
  optimalDecisions: number;
  avgEvLeft: number; // avg EV % left on the table
  trend: 'up' | 'down' | 'flat';
  /** Season this scorecard covers; defaults to 2025-26 when omitted. */
  season?: string;
  matrix: Record<OutcomeCell, number>;
}

export interface Decision {
  id: string;
  gameId: string;
  coachId: string;
  coachName: string;
  team: string;
  sport: SportId;
  date: string;
  opponent: string;
  type: DecisionType;
  situation: string;
  chosenAction: string;
  evChosen: number;
  evBest: number;
  isOptimal: boolean;
  outcome: string;
  outcomeSuccess: boolean;
  period: string;
  clock: string;
  /** Evaluated alternatives — present on live data from the backend. */
  alternativeActions?: AlternativeAction[];
  /** Win probability before the decision, 0-1. */
  winProbabilityBefore?: number;
}

export const COACHES: Coach[] = [
  {
    id: 'c1',
    name: 'Mike Brennan',
    team: 'Eagles',
    sport: 'NFL',
    rank: 1,
    evRate: 78.4,
    totalDecisions: 214,
    optimalDecisions: 168,
    avgEvLeft: 1.2,
    trend: 'up',
    matrix: {
      'good-good': 112,
      'good-bad': 56,
      'bad-good': 18,
      'bad-bad': 28,
    },
  },
  {
    id: 'c2',
    name: 'Steve Callahan',
    team: 'Chiefs',
    sport: 'NFL',
    rank: 2,
    evRate: 74.1,
    totalDecisions: 198,
    optimalDecisions: 147,
    avgEvLeft: 2.4,
    trend: 'up',
    matrix: {
      'good-good': 98,
      'good-bad': 49,
      'bad-good': 21,
      'bad-bad': 30,
    },
  },
  {
    id: 'c3',
    name: 'Dan Kowalski',
    team: '49ers',
    sport: 'NFL',
    rank: 4,
    evRate: 71.9,
    totalDecisions: 203,
    optimalDecisions: 146,
    avgEvLeft: 3.1,
    trend: 'flat',
    matrix: {
      'good-good': 92,
      'good-bad': 54,
      'bad-good': 24,
      'bad-bad': 33,
    },
  },
  {
    id: 'c4',
    name: 'Tony Marchetti',
    team: 'Ravens',
    sport: 'NFL',
    rank: 6,
    evRate: 68.2,
    totalDecisions: 187,
    optimalDecisions: 128,
    avgEvLeft: 4.0,
    trend: 'down',
    matrix: {
      'good-good': 84,
      'good-bad': 44,
      'bad-good': 27,
      'bad-bad': 32,
    },
  },
  {
    id: 'c5',
    name: 'Rob Ellison',
    team: 'Bills',
    sport: 'NFL',
    rank: 8,
    evRate: 65.8,
    totalDecisions: 176,
    optimalDecisions: 116,
    avgEvLeft: 4.8,
    trend: 'up',
    matrix: {
      'good-good': 78,
      'good-bad': 38,
      'bad-good': 30,
      'bad-bad': 30,
    },
  },
  {
    id: 'c6',
    name: 'Greg Fowler',
    team: 'Cowboys',
    sport: 'NFL',
    rank: 9,
    evRate: 61.3,
    totalDecisions: 192,
    optimalDecisions: 118,
    avgEvLeft: 5.6,
    trend: 'down',
    matrix: {
      'good-good': 72,
      'good-bad': 46,
      'bad-good': 34,
      'bad-bad': 40,
    },
  },
  {
    id: 'c7',
    name: 'Ken Alvarez',
    team: 'Lions',
    sport: 'NFL',
    rank: 10,
    evRate: 58.9,
    totalDecisions: 169,
    optimalDecisions: 100,
    avgEvLeft: 6.2,
    trend: 'up',
    matrix: {
      'good-good': 64,
      'good-bad': 36,
      'bad-good': 37,
      'bad-bad': 32,
    },
  },
  {
    id: 'c8',
    name: 'Paul Deering',
    team: 'Bengals',
    sport: 'NFL',
    rank: 11,
    evRate: 52.4,
    totalDecisions: 181,
    optimalDecisions: 95,
    avgEvLeft: 7.9,
    trend: 'down',
    matrix: {
      'good-good': 58,
      'good-bad': 37,
      'bad-good': 41,
      'bad-bad': 45,
    },
  },
  {
    id: 'c9',
    name: 'Gregg Popovich',
    team: 'Spurs',
    sport: 'NBA',
    rank: 3,
    evRate: 72.1,
    totalDecisions: 156,
    optimalDecisions: 113,
    avgEvLeft: 2.9,
    trend: 'up',
    matrix: {
      'good-good': 78,
      'good-bad': 35,
      'bad-good': 19,
      'bad-bad': 24,
    },
  },
  {
    id: 'c10',
    name: 'Steve Kerrman',
    team: 'Warriors',
    sport: 'NBA',
    rank: 5,
    evRate: 69.8,
    totalDecisions: 148,
    optimalDecisions: 103,
    avgEvLeft: 3.4,
    trend: 'flat',
    matrix: {
      'good-good': 70,
      'good-bad': 33,
      'bad-good': 22,
      'bad-bad': 23,
    },
  },
  {
    id: 'c11',
    name: 'Erik Spoelstra',
    team: 'Heat',
    sport: 'NBA',
    rank: 7,
    evRate: 66.4,
    totalDecisions: 152,
    optimalDecisions: 101,
    avgEvLeft: 4.1,
    trend: 'up',
    matrix: {
      'good-good': 66,
      'good-bad': 35,
      'bad-good': 24,
      'bad-bad': 27,
    },
  },
];

export const DECISIONS: Decision[] = [
  {
    id: 'd1',
    gameId: 'g3',
    coachId: 'c1',
    coachName: 'Mike Brennan',
    team: 'Eagles',
    sport: 'NFL',
    date: 'Jan 18, 2026',
    opponent: 'Cowboys',
    type: '4th_down',
    situation: '4th and 2 at the opponent 33 yard line, trailing by 3, 4:22 remaining in Q4',
    chosenAction: 'Go for it',
    evChosen: 0.46,
    evBest: 0.46,
    isOptimal: true,
    outcome: 'Pass complete for 9 yards — first down. Field goal two plays later tied the game.',
    outcomeSuccess: true,
    period: 'Q4',
    clock: '4:22',
  },
  {
    id: 'd2',
    gameId: 'g3',
    coachId: 'c1',
    coachName: 'Mike Brennan',
    team: 'Eagles',
    sport: 'NFL',
    date: 'Jan 18, 2026',
    opponent: 'Cowboys',
    type: '2pt_conversion',
    situation: 'Trailing by 2 with 0:38 left after a touchdown — 2-point conversion would take the lead',
    chosenAction: 'Go for 2',
    evChosen: 0.52,
    evBest: 0.52,
    isOptimal: true,
    outcome: 'Conversion successful — Eagles lead by 1 with 0:38 left.',
    outcomeSuccess: true,
    period: 'Q4',
    clock: '0:38',
  },
  {
    id: 'd3',
    gameId: 'g5',
    coachId: 'c4',
    coachName: 'Tony Marchetti',
    team: 'Ravens',
    sport: 'NFL',
    date: 'Jan 17, 2026',
    opponent: 'Bengals',
    type: 'timeout',
    situation: 'Up by 1, opponent facing 3rd and 6 with 1:12 left. Opponent showing no-huddle urgency.',
    chosenAction: 'Call timeout',
    evChosen: 0.34,
    evBest: 0.41,
    isOptimal: false,
    outcome: 'Timeout gave the defense a reset, but the opponent converted and kicked a game-winning field goal.',
    outcomeSuccess: false,
    period: 'Q4',
    clock: '1:12',
  },
  {
    id: 'd4',
    gameId: 'g6',
    coachId: 'c8',
    coachName: 'Paul Deering',
    team: 'Bengals',
    sport: 'NFL',
    date: 'Jan 15, 2026',
    opponent: 'Steelers',
    type: '4th_down',
    situation: '4th and 8 from their own 42 yard line, down by 4 with 2:01 left in Q3',
    chosenAction: 'Punt',
    evChosen: 0.18,
    evBest: 0.31,
    isOptimal: false,
    outcome: 'Punt pinned the Steelers at the 12, but the Bengals never saw the ball again in scoring position.',
    outcomeSuccess: false,
    period: 'Q3',
    clock: '2:01',
  },
  {
    id: 'd5',
    gameId: 'g6',
    coachId: 'c8',
    coachName: 'Paul Deering',
    team: 'Bengals',
    sport: 'NFL',
    date: 'Jan 15, 2026',
    opponent: 'Steelers',
    type: '4th_down',
    situation: '4th and 1 at the Steelers 40 yard line, down by 4 with 9:14 left in Q4',
    chosenAction: 'Go for it',
    evChosen: 0.44,
    evBest: 0.44,
    isOptimal: true,
    outcome: 'Run stuffed for no gain — Steelers take over. The process was right; the execution failed.',
    outcomeSuccess: false,
    period: 'Q4',
    clock: '9:14',
  },
  {
    id: 'd6',
    gameId: 'g4',
    coachId: 'c2',
    coachName: 'Steve Callahan',
    team: 'Chiefs',
    sport: 'NFL',
    date: 'Jan 14, 2026',
    opponent: 'Chargers',
    type: '2pt_conversion',
    situation: 'Down by 1 with 0:14 left after a touchdown — 2-point conversion wins the game',
    chosenAction: 'Go for 2',
    evChosen: 0.49,
    evBest: 0.49,
    isOptimal: true,
    outcome: 'Conversion fails — Chiefs lose by 1. Optimal decision, unlucky outcome.',
    outcomeSuccess: false,
    period: 'Q4',
    clock: '0:14',
  },
  {
    id: 'd7',
    gameId: 'g1',
    coachId: 'c10',
    coachName: 'Steve Kerrman',
    team: 'Warriors',
    sport: 'NBA',
    date: 'Feb 8, 2026',
    opponent: 'Lakers',
    type: 'timeout',
    situation: 'Trailing by 2 with 0:12 left in Q4 — deciding whether to foul immediately to stop the clock',
    chosenAction: 'Foul immediately',
    evChosen: 0.41,
    evBest: 0.41,
    isOptimal: true,
    outcome: 'Foul sent the Lakers to the line; the Warriors final shot rimmed out. Optimal process, unlucky bounce.',
    outcomeSuccess: false,
    period: 'Q4',
    clock: '0:12',
  },
];
