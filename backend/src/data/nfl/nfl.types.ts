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
  location?: string;
  conferenceId?: string;
  logos?: { href: string }[];
}

export interface EspnScoreboardResponse {
  events: EspnEvent[];
}

export interface EspnEvent {
  id: string;
  date: string; // ISO timestamp
  name: string;
  season?: { year: number; type: number };
  status?: { type?: { completed?: boolean } };
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
  score_differential: number | null;
  game_seconds_remaining: number | null;
  fourth_down_converted: boolean | null;
  fourth_down_failed: boolean | null;
  timeout: boolean | null;
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
