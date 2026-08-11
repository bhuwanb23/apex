import axios, { type AxiosInstance } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { DateRange, SportFetcher } from '../fetcher.manager.js';
import { toSeasonYear } from '../season.util.js';
import type {
  EspnAthlete,
  EspnEvent,
  EspnRosterResponse,
  EspnScoreboardResponse,
  EspnSummaryResponse,
  EspnTeam,
  EspnTeamsResponse,
  NflPlay,
} from './nfl.types.js';

const ESPN_NFL_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const REGULAR_SEASON_TYPE = 2;

/**
 * Pulls NFL data from two sources (both implemented, whichever is available):
 * - Approach B — ESPN public API (no key): teams, scoreboards, summaries, rosters.
 * - Approach A — Python microservice → nfl-data-py: full down-by-down play-by-play.
 *   fetchPlayByPlay tries Python first and falls back to ESPN scoring plays.
 */
export class NflFetcher implements SportFetcher {
  readonly sport = 'nfl';
  readonly apiName = 'espn';

  private readonly espn: AxiosInstance;
  private readonly python: AxiosInstance;

  /** Clients are injectable for tests (mock servers) — the app uses the defaults. */
  constructor(espn?: AxiosInstance, python?: AxiosInstance) {
    this.espn = espn ?? axios.create({ baseURL: ESPN_NFL_BASE, timeout: 15_000 });
    // Short timeout so the ESPN fallback is fast when the Python service is down.
    this.python = python ?? axios.create({ baseURL: env.PYTHON_ML_URL, timeout: 5_000 });
  }

  /** GET /teams — all 32 NFL teams (nested under sports[].leagues[].teams[].team). */
  async fetchTeams(): Promise<EspnTeam[]> {
    const res = await this.espn.get<EspnTeamsResponse>('/teams');
    const teams = res.data.sports?.[0]?.leagues?.[0]?.teams ?? [];
    return teams.map(t => t.team);
  }

  /** NFL has no all-players endpoint on ESPN — rosters are per team. */
  async fetchPlayers(teamId?: string): Promise<unknown> {
    if (!teamId) {
      throw new Error('NFL players require a teamId (roster) — use fetchRosters');
    }
    return this.fetchRosters(teamId);
  }

  /**
   * GET /scoreboard — schedule + results.
   * With a date range → dates=YYYYMMDD-YYYYMMDD. Without → the full regular
   * season span (Sep 1 of the season year → Feb 15 of the next year), which
   * works for historical seasons too (ESPN scoreboard has no season-year param).
   */
  async fetchGames(season: string, dateRange?: DateRange): Promise<EspnEvent[]> {
    if (dateRange) {
      return this.fetchScoreboard(this.espnDateParam(dateRange));
    }
    const startYear = Number(toSeasonYear(season));
    const span = `${startYear}0901-${startYear + 1}0215`;
    return this.fetchScoreboard(span);
  }

  /**
   * Approach A — POST {PYTHON_ML_URL}/nfl/plays via the microservice.
   * nfl-data-py pbp is season/week scoped; game_id narrows it server-side.
   */
  async fetchPlayByPlay(gameId: string): Promise<NflPlay[]> {
    try {
      const res = await this.python.post<{ plays: NflPlay[] }>('/nfl/plays', { game_id: gameId });
      return res.data.plays ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { gameId, error: message },
        'Python NFL plays unavailable — falling back to ESPN summary'
      );
      return this.fetchSummaryAsPlays(gameId);
    }
  }

  /**
   * Approach A, bulk form — POST /nfl/plays with the exact microservice
   * contract: season + optional week/team filters. This is the feed for
   * Module 2 (coach decision extraction).
   */
  async fetchSeasonPlays(season: string, week?: number, team?: string): Promise<NflPlay[]> {
    const body: Record<string, unknown> = { season: Number(toSeasonYear(season)) };
    if (week !== undefined) body.week = week;
    if (team) body.team = team;
    const res = await this.python.post<{ plays: NflPlay[] }>('/nfl/plays', body);
    return res.data.plays ?? [];
  }

  /** GET /teams/{teamId}/roster — active roster with positions and jersey numbers. */
  async fetchRosters(teamId: string): Promise<EspnAthlete[]> {
    const res = await this.espn.get<EspnRosterResponse>(`/teams/${teamId}/roster`);
    return res.data.athletes ?? [];
  }

  // TODO(phase-4): per-player game logs via the Python microservice (nfl_data_py)
  async fetchPlayerGameLogs(_playerId: string, _season: string): Promise<unknown> {
    throw new Error(
      'Not implemented: NflFetcher.fetchPlayerGameLogs (Python microservice route planned)'
    );
  }

  // -- Internal helpers ------------------------------------------------------

  private async fetchScoreboard(dates: string): Promise<EspnEvent[]> {
    const params: Record<string, unknown> = { seasontype: REGULAR_SEASON_TYPE, limit: 300 };
    if (dates) params.dates = dates;
    const res = await this.espn.get<EspnScoreboardResponse>('/scoreboard', { params });
    return res.data.events ?? [];
  }

  /** Approach B — GET /summary?event={id}; maps scoring plays into NflPlay shape. */
  private async fetchSummaryAsPlays(gameId: string): Promise<NflPlay[]> {
    const res = await this.espn.get<EspnSummaryResponse>('/summary', {
      params: { event: gameId },
    });
    const scoringPlays = res.data.scoringPlays ?? [];
    return scoringPlays.map(sp => ({
      game_id: gameId,
      play_id: Number(sp.id) || 0,
      desc: sp.text ?? '',
      down: null,
      ydstogo: null,
      yardline_100: null,
      play_type: 'score',
      yards_gained: null,
      posteam: sp.team?.id ?? null,
      defteam: null,
      score_differential: (sp.homeScore ?? 0) - (sp.awayScore ?? 0),
      game_seconds_remaining: null,
      qtr: sp.period?.number ?? null,
      fourth_down_converted: null,
      fourth_down_failed: null,
      timeout: false,
      timeout_team: null,
      two_point_conv_result: null,
    }));
  }

  /** "2024-25" / "2024" → "2024" (ESPN dates are YYYYMMDD). */
  private espnDateParam(range: DateRange): string {
    const start = range.startDate.toISOString().slice(0, 10).replaceAll('-', '');
    const end = range.endDate.toISOString().slice(0, 10).replaceAll('-', '');
    return `${start}-${end}`;
  }
}
