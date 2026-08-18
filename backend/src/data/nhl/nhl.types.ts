// Raw response types for the NHL public API (https://api-web.nhle.com/v1).
// Free — no auth required. Shapes verified against the live API.

export interface NhlTeam {
  id: number;
  name: string;
  abbreviation: string;
  teamName?: string;
  locationName?: string;
  conference?: { name?: string };
  division?: { name?: string };
  venue?: { name?: string };
  firstYearOfPlay?: string;
  active?: boolean;
}

export interface NhlTeamsResponse {
  teams: NhlTeam[];
}

export interface NhlScheduleResponse {
  games: NhlScheduleGame[];
  currentDate?: string;
}

export interface NhlScheduleGame {
  id: number;
  gameDate: string; // ISO timestamp
  gameType?: string; // "R" regular, "P" playoff, "PR" preseason
  season?: string;
  detailedState?: string; // "Final", "Live", "Preview"
  statusCode?: string;
  homeTeam: NhlScheduleTeam;
  awayTeam: NhlScheduleTeam;
  venue?: { default?: string };
}

export interface NhlScheduleTeam {
  id: number;
  name?: string;
  abbrev?: string;
  score?: number;
  sog?: number; // shots on goal
  winner?: boolean;
}

export interface NhlPlayByPlayResponse {
  plays: NhlPlay[];
  currentPlay?: NhlPlay;
  penaltyPlays?: number[];
  playsByPeriod?: number[][];
}

export interface NhlPlay {
  eventId: number;
  period: number;
  periodType?: string; // "REG", "OT", "SO"
  timeInPeriod?: string; // "12:34"
  timeRemaining?: string;
  description?: string;
  details?: {
    eventCode?: string;
    eventType?: string; // "GOAL", "SHOT", "PENALTY", etc.
    assist1Id?: number;
    assist2Id?: number;
    goalScorerId?: number;
    penaltySeverity?: string;
    penaltyMinutes?: number;
    shotType?: string;
    awayScore?: number;
    homeScore?: number;
  };
  coordinates?: {
    x?: number;
    y?: number;
  };
  teamAbbrev?: {
    default?: string;
  };
}

export interface NhlRosterResponse {
  forwards?: NhlRosterEntry[];
  defensemen?: NhlRosterEntry[];
  goalies?: NhlRosterEntry[];
}

export interface NhlRosterEntry {
  id: number;
  fullName?: string;
  firstName?: { default?: string };
  lastName?: { default?: string };
  positionCode?: string; // "C", "LW", "RW", "D", "G"
  jerseyNumber?: string;
  heightInInches?: number;
  weightInPounds?: number;
  nationality?: string;
  birthDate?: string;
}

// Standings response for season info
export interface NhlStandingsResponse {
  standings?: NhlStandingEntry[];
}

export interface NhlStandingEntry {
  teamAbbrev?: string;
  teamName?: { default?: string };
  gamesPlayed?: number;
  wins?: number;
  losses?: number;
  otLosses?: number;
  points?: number;
  leagueRecord?: { wins?: number; losses?: number; otLosses?: number };
}

// Player game log response
export interface NhlPlayerGameLogResponse {
  splits?: NhlPlayerGameLogEntry[];
}

export interface NhlPlayerGameLogEntry {
  gamePk?: number;
  date?: string;
  opponent?: string;
  result?: { win?: boolean; loss?: boolean; otLoss?: boolean };
  toi?: string; // time on ice "MM:SS"
  goals?: number;
  assists?: number;
  points?: number;
  plusMinus?: number;
  penaltyMinutes?: number;
  shots?: number;
  hits?: number;
  blocks?: number;
  giveaways?: number;
  takeaways?: number;
  faceoffWins?: number;
  faceoffLosses?: number;
  powerPlayGoals?: number;
  shortHandedGoals?: number;
  gameWinningGoals?: number;
}

/**
 * NHL coach decision extracted from play-by-play.
 * Represents a strategic choice by the coach (timeout, line change, goalie pull, penalty strategy).
 */
export interface NhlCoachDecision {
  gameId: string;
  team: string; // team abbreviation
  decisionType: string; // 'timeout', 'line_change', 'goalie_pull', 'penalty_strategy'
  period: number;
  clock: string | null;
  gameTimeSeconds: number | null;
  scoreDiff: number | null;
  context: Record<string, unknown>;
  chosenAction: string;
  outcome: string | null;
  outcomeSuccess: boolean | null;
}
