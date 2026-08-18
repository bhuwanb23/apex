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

// ---------------------------------------------------------------------------
// ESPN public API (https://site.api.espn.com/apis/site/v2/sports/basketball/nba)
// Play-by-play source — BallDontLie has no /plays endpoint on the free tier.
// ---------------------------------------------------------------------------

export interface EspnNbaScoreboardResponse {
  events?: EspnNbaEvent[];
}

export interface EspnNbaEvent {
  id: string;
  date: string; // ISO timestamp
  competitions?: Array<{
    competitors?: Array<{
      team?: { id?: string; abbreviation?: string; displayName?: string };
      homeAway?: 'home' | 'away';
    }>;
  }>;
}

/** Basketball summary — `plays` is the rich full play-by-play list. */
export interface EspnNbaSummaryResponse {
  /** Header teams — the ONLY place ESPN exposes team id → abbreviation. */
  header?: {
    competitions?: Array<{
      competitors?: Array<{
        team?: { id?: string; abbreviation?: string };
        homeAway?: 'home' | 'away';
      }>;
    }>;
  };
  /** Full play-by-play (shots, fouls, timeouts, rebounds …). */
  plays?: EspnNbaPlay[];
  /** Legacy sparse fallback for very old games without a plays list. */
  scoringPlays?: EspnNbaScoringPlay[];
}

/** One ESPN basketball play (shot-clock era summaries). */
export interface EspnNbaPlay {
  id?: string;
  /** Monotonic game sequence — used as the stable play_id. */
  sequenceNumber?: string;
  type?: { text?: string };
  text?: string;
  /** Running scores AFTER the play. */
  homeScore?: number;
  awayScore?: number;
  period?: { number?: number };
  clock?: { displayValue?: string }; // "8:34"
  scoringPlay?: boolean;
  shootingPlay?: boolean;
  /** Points scored on this play (0 for non-scoring). */
  scoreValue?: number;
  /** The play's team — numeric ESPN team id (map via the header). */
  team?: { id?: string };
  /** Players involved — index 0 is the primary actor. NOTE: participants
   *  never carry team info on the NBA summary; team attribution uses the
   *  top-level `team` field instead. */
  participants?: Array<{
    athlete?: { team?: { id?: string; abbreviation?: string } };
    type?: string;
  }>;
}

export interface EspnNbaScoringPlay {
  id?: string;
  period?: { number?: number };
  clock?: { displayValue?: string };
  team?: { id?: string; abbreviation?: string };
  type?: { text?: string };
  text?: string;
  homeScore?: number;
  awayScore?: number;
}

/**
 * Normalized NBA play (mirrors NflPlay) — what the NBA transformer maps into
 * PlayByPlayRecord rows. `team` is the scoring/acting team's abbreviation;
 * `home_team`/`away_team` let the transformer attribute scoring plays from the
 * score delta when the raw play has no participant team.
 */
export interface NbaPlay {
  game_id: string;
  play_id: number;
  desc: string;
  period: number | null;
  clock: string | null;
  /** Seconds ELAPSED in the game (basketball convention — ascending). */
  event_time_seconds: number | null;
  team: string | null; // team abbreviation (matches Teams.abbreviation)
  home_team: string | null; // home abbreviation, for delta attribution
  away_team: string | null; // away abbreviation, for delta attribution
  home_score: number | null;
  away_score: number | null;
  is_scoring: boolean;
  event_type: string;
}

/**
 * NBA coach decision extracted from play-by-play.
 * Represents a strategic choice by the coach (timeout, challenge, substitution, foul strategy).
 */
export interface NbaCoachDecision {
  gameId: string;
  team: string; // team abbreviation
  decisionType: string; // 'timeout', 'challenge', 'lineup', 'foul_strategy'
  period: number;
  clock: string | null;
  gameTimeSeconds: number | null;
  scoreDiff: number | null;
  context: Record<string, unknown>;
  chosenAction: string;
  outcome: string | null;
  outcomeSuccess: boolean | null;
}
