import axios, { type AxiosInstance } from 'axios';
import { env } from '../../config/env.js';
import type { DateRange, SportFetcher } from '../fetcher.manager.js';
import type { NBAGame, NBAPaginatedResponse, NBAPlayer, NBAStats, NBATeam } from './nba.types.js';

const NBA_API_BASE = 'https://api.balldontlie.io/v1';
const PER_PAGE = 100; // API max
const REQUEST_TIMEOUT_MS = 10_000; // 10s per request (docs recommend a client timeout)

/**
 * Shared axios client: single configured instance for all BallDontLie calls.
 * Auth per official docs — `Authorization: YOUR_API_KEY` (raw key, no Bearer).
 */
function createDefaultClient(): AxiosInstance {
  return axios.create({
    baseURL: NBA_API_BASE,
    headers: {
      // Only sent when a key is configured; live calls 401 without one.
      ...(env.BALLDONTLIE_API_KEY ? { Authorization: env.BALLDONTLIE_API_KEY } : {}),
      'Content-Type': 'application/json',
    },
    timeout: REQUEST_TIMEOUT_MS,
  });
}

/**
 * Maps a season ("2024-25" or "2024") to the API's season year (2024).
 * Throws for unresolvable values (e.g. the manager's 'current' placeholder)
 * instead of sending a NaN query param that the API rejects with a 400.
 */
function toApiSeason(season: string): string {
  const startYear = season.split('-')[0];
  if (startYear !== undefined && /^\d{4}$/.test(startYear)) return startYear;
  throw new Error(`Cannot map season "${season}" to a BallDontLie season year`);
}

/**
 * Pulls raw NBA data from the BallDontLie API — no transformation here,
 * fetch and return exactly what the API gives.
 *
 * Rate limiting + retries live in the fetcher.manager (pacing per bucket,
 * 429 → 60s wait, 5xx/network → exponential backoff, 3 attempts).
 */
export class NbaFetcher implements SportFetcher {
  readonly sport = 'nba';
  readonly apiName = 'balldontlie';

  private readonly client: AxiosInstance;

  /** `client` is injectable for tests (mock server) — the app uses the default. */
  constructor(client?: AxiosInstance) {
    this.client = client ?? createDefaultClient();
  }

  /** GET /teams — all NBA teams (single unpaginated response, ~30 rows). */
  async fetchTeams(): Promise<NBATeam[]> {
    return this.fetchAllPages<NBATeam>('/teams', {});
  }

  /** GET /players — paginated roster, optionally filtered by team. */
  async fetchPlayers(teamId?: string): Promise<NBAPlayer[]> {
    const params: Record<string, unknown> = {};
    const teamIdNum = Number(teamId);
    if (Number.isFinite(teamIdNum)) {
      params['team_ids[]'] = [teamIdNum];
    }
    return this.fetchAllPages<NBAPlayer>('/players', params);
  }

  /** GET /games — schedule + results for a season, optionally a date range. */
  async fetchGames(season: string, dateRange?: DateRange): Promise<NBAGame[]> {
    const params: Record<string, unknown> = {
      'seasons[]': [Number(toApiSeason(season))],
    };
    if (dateRange) {
      params.start_date = dateRange.startDate.toISOString().slice(0, 10);
      params.end_date = dateRange.endDate.toISOString().slice(0, 10);
    }
    return this.fetchAllPages<NBAGame>('/games', params);
  }

  /** GET /stats — per-game box scores for one player across a season. */
  async fetchPlayerGameLogs(playerId: string, season: string): Promise<NBAStats[]> {
    const params: Record<string, unknown> = {
      'player_ids[]': [Number(playerId)],
      'seasons[]': [Number(toApiSeason(season))],
    };
    return this.fetchAllPages<NBAStats>('/stats', params);
  }

  // BallDontLie's play-by-play endpoint (/plays) is GOAT-tier only; on the
  // free/ALL-STAR tiers it 401s. Not part of the MVP — fail fast.
  async fetchPlayByPlay(_gameId: string): Promise<unknown> {
    throw new Error('Play-by-play is not available for NBA on the BallDontLie free/ALL-STAR tiers');
  }

  /** GET /players?team_ids[]= — same endpoint as fetchPlayers, team-filtered. */
  async fetchRosters(teamId: string): Promise<NBAPlayer[]> {
    return this.fetchPlayers(teamId);
  }

  /**
   * Follows meta.next_cursor until null, combining every page into one array.
   * Endpoints that return a single unpaginated response (e.g. /teams has no
   * meta) stop after the first page.
   */
  private async fetchAllPages<T>(path: string, params: Record<string, unknown>): Promise<T[]> {
    return this.collectPages<T>(path, params, null, []);
  }

  /**
   * One paginated request, recursing while next_cursor is non-null.
   * Recursion (rather than a reassigned loop variable) keeps the cursor a
   * typed parameter and avoids TS circular-inference errors.
   */
  private async collectPages<T>(
    path: string,
    params: Record<string, unknown>,
    cursor: number | null,
    acc: T[]
  ): Promise<T[]> {
    const res = await this.client.get<NBAPaginatedResponse<T>>(path, {
      params: {
        ...params,
        per_page: PER_PAGE,
        ...(cursor !== null ? { cursor } : {}),
      },
    });
    const combined: T[] = [...acc, ...res.data.data];
    const next: number | null = res.data.meta?.next_cursor ?? null;
    if (next === null) return combined;
    return this.collectPages<T>(path, params, next, combined);
  }
}
