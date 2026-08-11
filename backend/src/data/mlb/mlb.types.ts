// Raw response types for the MLB Stats API (https://statsapi.mlb.com/api/v1).
// Official and free — no auth, no documented rate limit. Shapes verified live.

export interface MlbTeam {
  id: number;
  name: string;
  abbreviation: string;
  teamName?: string;
  locationName?: string;
  season?: number;
  active?: boolean;
  league?: { id?: number; name?: string };
  division?: { id?: number; name?: string };
  venue?: { id?: number; name?: string };
}

export interface MlbTeamsResponse {
  teams?: MlbTeam[];
}

export interface MlbScheduleResponse {
  dates?: MlbScheduleDate[];
}

export interface MlbScheduleDate {
  date: string;
  games?: MlbScheduleGame[];
}

export interface MlbScheduleGame {
  gamePk: number;
  gameDate: string; // ISO timestamp
  gameType?: string; // "R" regular, "P" playoff
  season?: string;
  officialDate?: string;
  status?: {
    abstractGameState?: string; // "Preview" / "Live" / "Final"
    detailedState?: string;
    statusCode?: string;
  };
  teams: {
    home?: MlbScheduleTeam;
    away?: MlbScheduleTeam;
  };
  venue?: { name?: string };
}

export interface MlbScheduleTeam {
  team: MlbTeam;
  score?: number;
  isWinner?: boolean;
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
  jerseyNumber?: string;
  position?: { code?: string; name?: string; abbreviation?: string };
  stats?: {
    batting?: Record<string, string | number | null>;
    pitching?: Record<string, string | number | null>;
    fielding?: Record<string, string | number | null>;
  };
}

export interface MlbPlayByPlayResponse {
  allPlays?: MlbPlay[];
}

export interface MlbPlay {
  about: {
    atBatIndex?: number;
    inning?: number;
    halfInning?: string; // "top" / "bottom"
    isTopInning?: boolean;
    isComplete?: boolean;
    isScoringPlay?: boolean;
    hasOut?: boolean;
  };
  result: {
    event?: string; // "Home Run", "Strikeout", "Walk", ...
    eventType?: string;
    description?: string;
    rbi?: number;
    homeScore?: number;
    awayScore?: number;
    isOut?: boolean;
  };
  count?: {
    balls?: number;
    strikes?: number;
    outs?: number;
  };
  matchup?: {
    batter?: { id?: number; fullName?: string };
    pitcher?: { id?: number; fullName?: string };
  };
}

export interface MlbRosterResponse {
  roster?: MlbRosterEntry[];
}

export interface MlbRosterEntry {
  person?: { id?: number; fullName?: string };
  jerseyNumber?: string;
  position?: { code?: string; name?: string; abbreviation?: string };
  status?: { code?: string; description?: string };
}

// Per-player game logs via /people/{id}?hydrate=stats(group=[hitting,pitching],type=[gameLog])
export interface MlbGameLogResponse {
  people?: Array<{
    id: number;
    fullName: string;
    stats?: Array<{
      group?: { displayName?: string };
      type?: { displayName?: string };
      splits?: MlbGameLogSplit[];
    }>;
  }>;
}

export interface MlbGameLogSplit {
  date: string;
  season?: string;
  gameType?: string;
  isHome?: boolean;
  isWin?: boolean;
  team?: { id?: number; name?: string };
  opponent?: { id?: number; name?: string };
  game?: { gamePk?: number };
  stat: Record<string, string | number | null>;
}
