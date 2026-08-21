// Raw response types for NFL data.
// Sources: ESPN public API (teams/schedules, no key) and nfl-data-py via the
// Python microservice (detailed play-by-play).

// ---------------------------------------------------------------------------
// ESPN public API (https://site.api.espn.com/apis/site/v2/sports/football/nfl)
// ---------------------------------------------------------------------------

export interface EspnTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName?: string;
  name?: string;
  location?: string;
  color?: string;
  logo?: string;
  conference?: { id?: string; name?: string };
  division?: { id?: string; name?: string };
}

export interface EspnTeamsResponse {
  sports?: Array<{
    leagues?: Array<{
      teams?: Array<{ team: EspnTeam }>;
    }>;
  }>;
}

export interface EspnScoreboardResponse {
  events?: EspnEvent[];
}

export interface EspnEvent {
  id: string;
  date: string; // ISO timestamp
  name: string;
  shortName?: string;
  season?: { year: number; type: number };
  status?: {
    type?: { detail?: string; state?: string; completed?: boolean };
  };
  competitions?: EspnCompetition[];
}

export interface EspnCompetition {
  competitors: EspnCompetitor[];
  venue?: { fullName?: string };
}

export interface EspnCompetitor {
  team: EspnTeam;
  score?: string;
  homeAway?: 'home' | 'away';
  winner?: boolean;
}

export interface EspnSummaryResponse {
  scoringPlays?: EspnScoringPlay[];
  /** Full drive-by-drive play list — the rich fallback source for NFL pbp. */
  drives?: {
    previous?: EspnDrive[];
    current?: EspnDrive[];
  };
  /** Game header — used to orient score_differential (posteam vs defteam). */
  header?: {
    competitions?: Array<{
      competitors?: Array<{
        team?: { id?: string };
        homeAway?: 'home' | 'away';
      }>;
    }>;
  };
}

/** One drive inside the summary's `drives` object (previous + current). */
export interface EspnDrive {
  plays?: EspnDrivePlay[];
}

/** A single play as exposed by the ESPN summary (much richer than scoringPlays). */
export interface EspnDrivePlay {
  id?: string;
  /** Monotonic game sequence (e.g. "18500") — used as the stable play_id. */
  sequenceNumber?: string;
  type?: { id?: string; text?: string; abbreviation?: string };
  text?: string;
  homeScore?: number;
  awayScore?: number;
  period?: { number?: number };
  clock?: { displayValue?: string };
  scoringPlay?: boolean;
  statYardage?: number;
  isTurnover?: boolean;
  start?: {
    down?: number;
    distance?: number;
    yardLine?: number;
    /** Distance from the possession team's own end zone — nfl_data_py's yardline_100 scale. */
    yardsToEndzone?: number;
    downDistanceText?: string;
    possessionText?: string;
    team?: { id?: string };
  };
  /** Teams involved — index 0 is the offense (and the timeout caller). */
  teamParticipants?: Array<{ id?: string; type?: string }>;
}

export interface EspnScoringPlay {
  id?: string;
  period?: { number?: number };
  clock?: { displayValue?: string };
  team?: { id?: string };
  type?: { text?: string };
  text?: string;
  homeScore?: number;
  awayScore?: number;
}

export interface EspnRosterResponse {
  athletes?: EspnAthlete[];
}

export interface EspnAthlete {
  id: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  position?: { abbreviation?: string };
  jersey?: string;
  team?: { id?: string; abbreviation?: string };
}

// ---------------------------------------------------------------------------
// nfl-data-py via Python microservice (play-by-play)
// ---------------------------------------------------------------------------

export interface NflPlay {
  game_id: string;
  play_id: number;
  desc: string;
  down: number | null;
  ydstogo: number | null;
  yardline_100: number | null;
  play_type: string | null;
  yards_gained: number | null;
  posteam: string | null;
  defteam: string | null;
  // nfl_data_py perspective: posteam score − defteam score (ESPN fallback: home − away)
  score_differential: number | null;
  // Absolute game scores at this play (nfl_data_py provides them; the ESPN
  // fallback maps scoring-plays homeScore/awayScore). Used for isScoring
  // detection and home/away score tracking.
  home_score?: number | null;
  away_score?: number | null;
  game_seconds_remaining: number | null;
  qtr: number | null; // quarter / period
  // nfl_data_py emits these as 0/1 integers; the ESPN fallback emits booleans
  fourth_down_converted: boolean | number | null;
  fourth_down_failed: boolean | number | null;
  timeout: boolean | number | null;
  timeout_team: string | null; // team that called the timeout
  two_point_conv_result: string | null; // "success" / "failure" / null
}

export interface NflSchedule {
  game_id: string;
  week: number;
  home_team: string;
  away_team: string;
  game_date: string;
  start_time: string | null;
  finished: boolean;
}

// ESPN athlete game log response
export interface EspnGameLogResponse {
  seasons?: EspnGameLogSeason[];
}

export interface EspnGameLogSeason {
  year?: number;
  types?: EspnGameLogType[];
}

export interface EspnGameLogType {
  type?: string;
  events?: EspnGameLogEvent[];
}

export interface EspnGameLogEvent {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  opponent?: { id?: string; displayName?: string; abbreviation?: string };
  result?: { winLoss?: string };
  stats?: EspnGameLogStats;
}

export interface EspnGameLogStats {
  gamesPlayed?: number;
  gamesStarted?: number;
  passingCompletions?: number;
  passingAttempts?: number;
  passingYards?: number;
  passingTouchdowns?: number;
  interceptions?: number;
  rushingAttempts?: number;
  rushingYards?: number;
  rushingTouchdowns?: number;
  receivingReceptions?: number;
  receivingYards?: number;
  receivingTouchdowns?: number;
  receivingTargets?: number;
  fumbles?: number;
  fumblesLost?: number;
  sacks?: number;
  totalTackles?: number;
  soloTackles?: number;
  assistedTackles?: number;
  tacklesForLoss?: number;
  passesDefended?: number;
  interceptionsCaught?: number;
}
