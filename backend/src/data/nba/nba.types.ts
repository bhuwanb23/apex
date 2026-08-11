// Raw response types for the BallDontLie API (https://api.balldontlie.io/v1).
// These mirror the API payloads; normalized DB-ready records live in db.writer.ts.

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
  position: string | null; // "PG", "SF", ...
  team?: NBATeam | null;
  height_feet?: number | null;
  height_inches?: number | null;
  weight_pounds?: number | null;
  jersey_number?: string | null;
}

export interface NBAGame {
  id: number;
  date: string; // ISO date
  home_team: NBATeam;
  visitor_team: NBATeam;
  home_team_score: number;
  visitor_team_score: number;
  status: string; // "Final", ...
  season: number; // e.g. 2024
  period?: number;
  time?: string;
  postseason?: boolean;
}

export interface NBAStats {
  id: number;
  player: NBAPlayer;
  game: NBAGame;
  team?: NBATeam;
  min: string | null; // minutes played, e.g. "36:42"
  pts: number;
  reb: number;
  ast: number;
  blk?: number;
  stl?: number;
  turnover?: number;
  oreb?: number;
  dreb?: number;
  pf?: number;
  fg_pct?: number;
  fg3_pct?: number;
  ft_pct?: number;
}

/** Standard paginated BallDontLie envelope (cursor-based, no total pages). */
export interface NBAPaginatedResponse<T> {
  data: T[];
  meta: {
    next_cursor?: number | null;
    per_page?: number;
  };
}
