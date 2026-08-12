import axios, { type AxiosInstance } from 'axios';
import type { DateRange, SportFetcher } from '../fetcher.manager.js';
import { toSeasonYear } from '../season.util.js';
import type {
  MlbBoxscoreResponse,
  MlbCoachRosterEntry,
  MlbCoachRosterResponse,
  MlbGameLogResponse,
  MlbGameLogSplit,
  MlbPlay,
  MlbPlayByPlayResponse,
  MlbRosterEntry,
  MlbRosterResponse,
  MlbScheduleGame,
  MlbScheduleResponse,
  MlbTeam,
  MlbTeamsResponse,
} from './mlb.types.js';

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

/**
 * Pulls raw MLB data from the official MLB Stats API (free, no auth).
 * All shapes below were verified against the live API.
 */
export class MlbFetcher implements SportFetcher {
  readonly sport = 'mlb';
  readonly apiName = 'mlb';

  private readonly client: AxiosInstance;

  /** `client` is injectable for tests — the app uses the default. */
  constructor(client?: AxiosInstance) {
    this.client = client ?? axios.create({ baseURL: MLB_API_BASE, timeout: 15_000 });
  }

  /** GET /teams?sportId=1 — all 30 MLB teams. */
  async fetchTeams(): Promise<MlbTeam[]> {
    const res = await this.client.get<MlbTeamsResponse>('/teams', {
      params: { sportId: 1 },
    });
    return res.data.teams ?? [];
  }

  /** MLB has no all-players endpoint — rosters are per team. */
  async fetchPlayers(teamId?: string): Promise<unknown> {
    if (!teamId) {
      throw new Error('MLB players require a teamId (roster) — use fetchRosters');
    }
    return this.fetchRosters(teamId);
  }

  /** GET /schedule — games for a season, optionally a date range. */
  async fetchGames(season: string, dateRange?: DateRange): Promise<MlbScheduleGame[]> {
    const params: Record<string, unknown> = {
      sportId: 1,
      season: toSeasonYear(season),
      gameType: 'R', // regular season
    };
    if (dateRange) {
      params.startDate = dateRange.startDate.toISOString().slice(0, 10);
      params.endDate = dateRange.endDate.toISOString().slice(0, 10);
    }
    const res = await this.client.get<MlbScheduleResponse>('/schedule', { params });
    return (res.data.dates ?? []).flatMap(d => d.games ?? []);
  }

  /**
   * GET /people/{id}?hydrate=stats(group=[hitting,pitching],type=[gameLog],season=…)
   * — official per-player game-by-game logs (one split per game).
   */
  async fetchPlayerGameLogs(playerId: string, season: string): Promise<MlbGameLogSplit[]> {
    const year = toSeasonYear(season);
    const hydrate = `stats(group=[hitting,pitching],type=[gameLog],season=${year})`;
    const res = await this.client.get<MlbGameLogResponse>(`/people/${playerId}`, {
      params: { hydrate, season: year },
    });
    const person = res.data.people?.[0];
    return person?.stats?.flatMap(s => s.splits ?? []) ?? [];
  }

  /** GET /game/{gamePk}/playByPlay — full game log with about/result/matchup per play. */
  async fetchPlayByPlay(gameId: string): Promise<MlbPlay[]> {
    const res = await this.client.get<MlbPlayByPlayResponse>(`/game/${gameId}/playByPlay`);
    return res.data.allPlays ?? [];
  }

  /**
   * GET /game/{gamePk}/boxscore — full box score: team stats, per-player
   * batting/pitching/fielding stats, and starting/relief pitchers.
   */
  async fetchBoxscore(gamePk: string): Promise<MlbBoxscoreResponse> {
    const res = await this.client.get<MlbBoxscoreResponse>(`/game/${gamePk}/boxscore`);
    return res.data;
  }

  /**
   * GET /teams/{teamId}/roster — active roster with positions and jersey numbers.
   * Omit `season` for the current season's roster.
   */
  async fetchRosters(teamId: string, season?: string): Promise<MlbRosterEntry[]> {
    const params: Record<string, unknown> = {};
    if (season) params.season = toSeasonYear(season);
    const res = await this.client.get<MlbRosterResponse>(`/teams/${teamId}/roster`, { params });
    return res.data.roster ?? [];
  }

  /**
   * GET /teams/{teamId}/roster?rosterType=coach — the coaching staff
   * (Manager, Bench Coach, pitching/hitting coaches). Entries carry
   * `job`/`jobId`/`title` instead of `position`. Omit `season` for the
   * current season's staff.
   */
  async fetchCoaches(teamId: string, season?: string): Promise<MlbCoachRosterEntry[]> {
    const params: Record<string, unknown> = { rosterType: 'coach' };
    if (season) params.season = toSeasonYear(season);
    const res = await this.client.get<MlbCoachRosterResponse>(`/teams/${teamId}/roster`, {
      params,
    });
    return res.data.roster ?? [];
  }
}
