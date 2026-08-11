// Raw response types for the BallDontLie API (https://api.balldontlie.io/v1).
// These mirror the API payloads (docs: https://docs.balldontlie.io);
// normalized DB-ready records live in db.writer.ts.

export interface NBATeam {
  id: number;
  name: string;
  abbreviation: string;
  city: string;
  conference: string | null; // "East" / "West"
  division: string | null;
  full_name: string;
}

export interface NBAPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string | null; // "G", "F", "C", ...
  team?: NBATeam | null;
  height?: string | null; // "6-2" (feet-inches string)
  weight?: string | null; // "185" (lbs string)
  jersey_number?: string | null;
}

export interface NBAGame {
  id: number;
  date: string; // "2025-01-05"
  datetime?: string; // ISO timestamp
  season: number; // e.g. 2024 (season start year)
  status: string; // "Final", "1st Qtr", ...
  period?: number;
  time?: string;
  postseason?: boolean;
  postponed?: boolean;
  home_team: NBATeam;
  visitor_team: NBATeam;
  home_team_score: number;
  visitor_team_score: number;
}

export interface NBAStats {
  id: number;
  player: NBAPlayer;
  team?: NBATeam;
  game: NBAGame;
  min: string | null; // "32:14" or "30" — convert to decimal in the transformer
  pts: number;
  reb: number;
  ast: number;
  blk?: number;
  stl?: number;
  turnover?: number;
  oreb?: number;
  dreb?: number;
  pf?: number;
  fgm?: number;
  fga?: number;
  fg_pct?: number;
  fg3m?: number;
  fg3a?: number;
  fg3_pct?: number;
  ftm?: number;
  fta?: number;
  ft_pct?: number;
  plus_minus?: number;
}

/** Standard paginated BallDontLie envelope (cursor-based, no total pages). */
export interface NBAPaginatedResponse<T> {
  data: T[];
  meta?: {
    next_cursor?: number | null;
    per_page?: number;
  };
}
