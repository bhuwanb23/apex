// Raw response types for the MLB Stats API (https://statsapi.mlb.com/api/v1).
// Official and free — no auth, no documented rate limit.

export interface MlbTeam {
  id: number;
  name: string;
  abbreviation: string;
  venue?: { name?: string };
}

export interface MlbScheduleResponse {
  dates: MlbScheduleDate[];
}

export interface MlbScheduleDate {
  date: string;
  games: MlbScheduleGame[];
}

export interface MlbScheduleGame {
  gamePk: number;
  gameDate: string; // ISO timestamp
  status?: { abstractGameState?: string }; // "Preview" / "Final" / ...
  teams: {
    home?: MlbScheduleTeam;
    away?: MlbScheduleTeam;
  };
  venue?: { name?: string };
}

export interface MlbScheduleTeam {
  team: MlbTeam;
  score?: number;
}

export interface MlbBoxscoreResponse {
  teams: {
    home?: MlbBoxscoreTeam;
    away?: MlbBoxscoreTeam;
  };
  info?: unknown[];
}

export interface MlbBoxscoreTeam {
  team?: MlbTeam;
  battingOrder?: number[];
  players?: Record<string, MlbBoxscorePlayer>;
}

export interface MlbBoxscorePlayer {
  person?: { id?: number; fullName?: string };
  stats?: {
    batting?: Record<string, string | number | null>;
    pitching?: Record<string, string | number | null>;
  };
  position?: { abbreviation?: string };
}

export interface MlbPlay {
  about: {
    inning?: number;
    halfInning?: string; // "top" / "bottom"
    outs?: number;
    isScoringPlay?: boolean;
  };
  result: {
    event?: string;
    description?: string;
    homeScore?: number;
    awayScore?: number;
  };
  matchup?: {
    batter?: { id?: number; fullName?: string };
    pitcher?: { id?: number; fullName?: string };
  };
}
