/** Mock games + momentum timeline data for the demo screens. */

import type { SportId } from './sports';
import type { Decision } from './coaches';

export interface MomentumPoint {
  time: number; // seconds into game
  label: string; // "Q1 - 8:12"
  home: number; // -100..100 home momentum
  away: number; // -100..100 away momentum
}

export interface MomentEvent {
  time: number;
  label: string;
  description: string;
  team: 'home' | 'away';
  swing: number; // momentum points gained
}

export interface Game {
  id: string;
  sport: SportId;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  date: string;
  season: string;
  homeCoach: string;
  awayCoach: string;
  homeEvRate: number;
  awayEvRate: number;
  momentumShifts: number;
  longestStreak: string;
  momentumLeader: string;
  verdict: string;
  timeline: MomentumPoint[];
  events: MomentEvent[];
  decisions: Decision[];
}

export const GAMES: Game[] = [
  {
    id: 'g1',
    sport: 'NBA',
    homeTeam: 'Lakers',
    awayTeam: 'Warriors',
    homeScore: 112,
    awayScore: 108,
    date: 'Feb 8, 2026',
    season: '2025-26',
    homeCoach: 'Darvin Ramsey',
    awayCoach: 'Steve Kerrman',
    homeEvRate: 71.2,
    awayEvRate: 64.8,
    momentumShifts: 14,
    longestStreak: 'Warriors · 9 min',
    momentumLeader: 'Lakers',
    verdict: 'Lakers closed on an 11-2 run to take the lead with 1:40 left.',
    timeline: [
      { time: 0, label: 'Q1 - 12:00', home: 5, away: 5 },
      { time: 360, label: 'Q1 - 6:00', home: 28, away: -10 },
      { time: 720, label: 'Q1 - 0:00', home: 35, away: -22 },
      { time: 1080, label: 'Q2 - 6:00', home: 18, away: 8 },
      { time: 1440, label: 'Q2 - 0:00', home: -12, away: 30 },
      { time: 1800, label: 'Q3 - 6:00', home: -30, away: 44 },
      { time: 2160, label: 'Q3 - 0:00', home: -18, away: 26 },
      { time: 2520, label: 'Q4 - 6:00', home: 10, away: -4 },
      { time: 2880, label: 'Q4 - 0:00', home: 62, away: -38 },
    ],
    events: [
      { time: 300, label: 'Q1 - 7:00', description: 'Lakers 8-0 run — AD and Reaves connect on three straight baskets.', team: 'home', swing: 18 },
      { time: 1180, label: 'Q2 - 4:20', description: 'Warriors hit four threes in five possessions to flip the script.', team: 'away', swing: 22 },
      { time: 1860, label: 'Q3 - 5:00', description: 'Warriors open the half on a 12-2 run, largest lead of the night.', team: 'away', swing: 24 },
      { time: 2520, label: 'Q4 - 6:00', description: 'Lakers bench sparks an 11-2 run; crowd back in it.', team: 'home', swing: 20 },
      { time: 2840, label: 'Q4 - 0:40', description: 'Go-ahead three from Johnson — Lakers never trail again.', team: 'home', swing: 26 },
    ],
    decisions: [],
  },
  {
    id: 'g2',
    sport: 'NBA',
    homeTeam: 'Celtics',
    awayTeam: 'Bucks',
    homeScore: 121,
    awayScore: 115,
    date: 'Feb 7, 2026',
    season: '2025-26',
    homeCoach: 'Joe Mazzulla',
    awayCoach: 'Doc Rivers',
    homeEvRate: 73.5,
    awayEvRate: 58.1,
    momentumShifts: 11,
    longestStreak: 'Celtics · 12 min',
    momentumLeader: 'Celtics',
    verdict: 'Celtics controlled the second half behind a 19-4 third-quarter stretch.',
    timeline: [
      { time: 0, label: 'Q1 - 12:00', home: 8, away: 2 },
      { time: 720, label: 'Q1 - 0:00', home: 24, away: -8 },
      { time: 1440, label: 'Q2 - 0:00', home: 12, away: 12 },
      { time: 2160, label: 'Q3 - 0:00', home: 42, away: -20 },
      { time: 2880, label: 'Q4 - 0:00', home: 48, away: -28 },
    ],
    events: [
      { time: 1600, label: 'Q3 - 9:20', description: 'Celtics explode for a 19-4 run powered by three straight steals.', team: 'home', swing: 28 },
    ],
    decisions: [],
  },
  {
    id: 'g3',
    sport: 'NFL',
    homeTeam: 'Eagles',
    awayTeam: 'Cowboys',
    homeScore: 27,
    awayScore: 24,
    date: 'Jan 18, 2026',
    season: '2025-26',
    homeCoach: 'Mike Brennan',
    awayCoach: 'Greg Fowler',
    homeEvRate: 78.4,
    awayEvRate: 61.3,
    momentumShifts: 8,
    longestStreak: 'Cowboys · 6 min',
    momentumLeader: 'Eagles',
    verdict: 'Eagles won the 4th quarter decisions — two optimal calls sealed the game.',
    timeline: [
      { time: 0, label: 'Q1 - 15:00', home: 10, away: -5 },
      { time: 900, label: 'Q2 - 0:00', home: -15, away: 20 },
      { time: 1800, label: 'Q3 - 0:00', home: 5, away: -2 },
      { time: 2400, label: 'Q4 - 8:00', home: 18, away: -6 },
      { time: 3600, label: 'Q4 - 0:00', home: 42, away: -30 },
    ],
    events: [
      { time: 850, label: 'Q2 - 6:00', description: 'Cowboys pick-six flips momentum entirely.', team: 'away', swing: 30 },
      { time: 2800, label: 'Q4 - 4:22', description: 'Brennan goes for it on 4th and 2 — converts, drives for the lead.', team: 'home', swing: 26 },
    ],
    decisions: [],
  },
  {
    id: 'g4',
    sport: 'NFL',
    homeTeam: 'Chiefs',
    awayTeam: 'Chargers',
    homeScore: 31,
    awayScore: 33,
    date: 'Jan 14, 2026',
    season: '2025-26',
    homeCoach: 'Steve Callahan',
    awayCoach: 'Jim Harbaugh',
    homeEvRate: 74.1,
    awayEvRate: 66.2,
    momentumShifts: 9,
    longestStreak: 'Chiefs · 8 min',
    momentumLeader: 'Chargers',
    verdict: 'A wild back-and-forth finish decided by a failed 2-point conversion with 14 seconds left.',
    timeline: [
      { time: 0, label: 'Q1 - 15:00', home: 8, away: -2 },
      { time: 900, label: 'Q2 - 0:00', home: 24, away: -10 },
      { time: 1800, label: 'Q3 - 0:00', home: -5, away: 12 },
      { time: 2700, label: 'Q4 - 5:00', home: -22, away: 30 },
      { time: 3600, label: 'Q4 - 0:00', home: 10, away: -6 },
    ],
    events: [
      { time: 2900, label: 'Q4 - 0:14', description: 'Callahan goes for 2 to win it — conversion fails.', team: 'away', swing: 18 },
    ],
    decisions: [],
  },
  {
    id: 'g5',
    sport: 'NFL',
    homeTeam: 'Ravens',
    awayTeam: 'Bengals',
    homeScore: 20,
    awayScore: 23,
    date: 'Jan 17, 2026',
    season: '2025-26',
    homeCoach: 'Tony Marchetti',
    awayCoach: 'Paul Deering',
    homeEvRate: 68.2,
    awayEvRate: 52.4,
    momentumShifts: 6,
    longestStreak: 'Bengals · 5 min',
    momentumLeader: 'Bengals',
    verdict: 'Bengals stole momentum late with a game-winning field goal drive.',
    timeline: [
      { time: 0, label: 'Q1 - 15:00', home: 12, away: -8 },
      { time: 1800, label: 'Q3 - 0:00', home: -6, away: 10 },
      { time: 3540, label: 'Q4 - 0:06', home: -28, away: 22 },
    ],
    events: [
      { time: 3420, label: 'Q4 - 1:12', description: 'Marchetti burns a timeout that fails to stop the Bengals drive.', team: 'away', swing: 14 },
    ],
    decisions: [],
  },
  {
    id: 'g6',
    sport: 'NFL',
    homeTeam: 'Bengals',
    awayTeam: 'Steelers',
    homeScore: 17,
    awayScore: 24,
    date: 'Jan 15, 2026',
    season: '2025-26',
    homeCoach: 'Paul Deering',
    awayCoach: 'Mike Tomlin',
    homeEvRate: 52.4,
    awayEvRate: 71.1,
    momentumShifts: 7,
    longestStreak: 'Steelers · 9 min',
    momentumLeader: 'Steelers',
    verdict: 'Two questionable 4th-down decisions cost the Bengals any chance at a comeback.',
    timeline: [
      { time: 0, label: 'Q1 - 15:00', home: 4, away: -4 },
      { time: 1800, label: 'Q3 - 0:00', home: -16, away: 20 },
      { time: 3540, label: 'Q4 - 0:06', home: -24, away: 18 },
    ],
    events: [
      { time: 2200, label: 'Q4 - 9:14', description: 'Deering goes for it on 4th and 1 — stuffed at the line.', team: 'away', swing: 16 },
    ],
    decisions: [],
  },
];

export const HOME_GAMES = GAMES.slice(0, 2);
export const DECISION_GAMES = GAMES.filter(g => g.sport === 'NFL');
