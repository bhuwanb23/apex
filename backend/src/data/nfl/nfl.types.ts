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
