/** Supported sports and their demo configuration. */

export type SportId = 'NBA' | 'NFL' | 'MLB' | 'NHL';

export interface Sport {
  id: SportId;
  name: string;
  short: string;
  hook: string;
  gradient: [string, string];
  teams: string[];
}

export const SPORTS: Sport[] = [
  {
    id: 'NBA',
    name: 'Basketball',
    short: 'NBA',
    hook: '30 teams, 450 players tracked',
    gradient: ['#FF8A5C', '#FF5C8A'],
    teams: [
      'Lakers',
      'Celtics',
      'Warriors',
      'Bucks',
      'Nuggets',
      'Heat',
      'Suns',
      'Knicks',
      '76ers',
      'Mavericks',
      'Cavaliers',
      'Thunder',
    ],
  },
  {
    id: 'NFL',
    name: 'Football',
    short: 'NFL',
    hook: '4th down decisions graded weekly',
    gradient: ['#5C9DFF', '#5856D6'],
    teams: ['Chiefs', 'Eagles', '49ers', 'Ravens', 'Bills', 'Cowboys', 'Lions', 'Bengals'],
  },
  {
    id: 'MLB',
    name: 'Baseball',
    short: 'MLB',
    hook: 'Pitch by pitch momentum analysis',
    gradient: ['#2FA36B', '#4CC38A'],
    teams: ['Yankees', 'Dodgers', 'Braves', 'Astros', 'Red Sox', 'Phillies'],
  },
  {
    id: 'NHL',
    name: 'Hockey',
    short: 'NHL',
    hook: 'Strongest momentum effect of any sport',
    gradient: ['#FFA058', '#FF5C8A'],
    teams: ['Rangers', 'Bruins', 'Oilers', 'Avalanche', 'Maple Leafs', 'Golden Knights'],
  },
];

export const SPORT_BY_ID: Record<SportId, Sport> = Object.fromEntries(
  SPORTS.map(s => [s.id, s])
) as Record<SportId, Sport>;

/** Momentum verdict per sport (Cox hazard model summary). */
export interface MomentumVerdict {
  sport: SportId;
  verdict: 'real' | 'myth' | 'inconclusive';
  effectSize: number;
  pValue: number;
  hazardCoefficient: number;
  ciLow: number;
  ciHigh: number;
  gamesAnalyzed: number;
  season: string;
  explanation: string;
}

export const MOMENTUM_VERDICTS: MomentumVerdict[] = [
  {
    sport: 'NHL',
    verdict: 'real',
    effectSize: 0.42,
    pValue: 0.001,
    hazardCoefficient: 1.52,
    ciLow: 1.18,
    ciHigh: 1.96,
    gamesAnalyzed: 1012,
    season: '2024-25',
    explanation:
      'After a team scores 2+ consecutive goals, the opponent is 52% more likely to score next — momentum is a measurable, real effect in hockey.',
  },
  {
    sport: 'NBA',
    verdict: 'real',
    effectSize: 0.31,
    pValue: 0.004,
    hazardCoefficient: 1.36,
    ciLow: 1.11,
    ciHigh: 1.67,
    gamesAnalyzed: 1187,
    season: '2024-25',
    explanation:
      'A 10-0 run meaningfully shifts win probability. Momentum shows up as a short-term scoring surge that fades within about 6 minutes.',
  },
  {
    sport: 'NFL',
    verdict: 'inconclusive',
    effectSize: 0.18,
    pValue: 0.09,
    hazardCoefficient: 1.2,
    ciLow: 0.97,
    ciHigh: 1.49,
    gamesAnalyzed: 271,
    season: '2024-25',
    explanation:
      'Momentum appears in bursts after big plays (turnovers, 40+ yard gains) but does not persist — the evidence is suggestive, not conclusive.',
  },
  {
    sport: 'MLB',
    verdict: 'myth',
    effectSize: 0.04,
    pValue: 0.61,
    hazardCoefficient: 1.05,
    ciLow: 0.87,
    ciHigh: 1.27,
    gamesAnalyzed: 2430,
    season: '2024-25',
    explanation:
      'Scoring runs does not change the opponent’s hazard of scoring. In baseball, momentum is a story fans tell — not a measurable effect.',
  },
];
