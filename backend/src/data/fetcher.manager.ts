import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../db/client.js';
import { updateCacheMetadata } from './db.writer.js';
import { isCacheValid } from '../services/sqlite.cache.service.js';
import { ExternalAPIError } from '../utils/errors.js';
import {
  classifyFetchError,
  logFetchFailure,
  logFetchStart,
  logFetchSuccess,
  logSyncComplete,
  logSyncStart,
} from './fetch.logger.js';
import { MlbFetcher } from './mlb/mlb.fetcher.js';
import { NbaFetcher } from './nba/nba.fetcher.js';
import { NflFetcher } from './nfl/nfl.fetcher.js';
import { NhlFetcher } from './nhl/nhl.fetcher.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Inclusive game date range. Construct the Dates from UTC (e.g. `new Date('2025-01-01T00:00:00Z')`)
 * so the API's YYYY-MM-DD date isn't shifted by the server's timezone offset.
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Result of a manager fetch. When `cached` is true the data was already fresh
 * in the DB (CacheMetadata says so) and `data` is null — callers read SQLite
 * instead of re-hitting the external API.
 */
export interface FetchResult<T = unknown> {
  data: T | null;
  cached: boolean;
  cacheKey: string;
  durationMs: number;
}

export interface SyncStageResult {
  cached: boolean;
  recordCount: number;
  durationMs: number;
}

export interface SyncAllResult {
  sport: string;
  season: string;
  stages: {
    teams: SyncStageResult;
    players: SyncStageResult;
    games: SyncStageResult;
  };
  durationMs: number;
}

/**
 * Common fetcher contract. Each sport fetcher implements the raw-data pullers;
 * the manager is the ONLY entry point the rest of the app calls.
 */
export interface SportFetcher {
  /** Sport abbreviation: 'nba' | 'nfl' | 'mlb' */
  readonly sport: string;
  /** Rate-limit bucket for the underlying API ('balldontlie' | 'espn' | 'mlb') */
  readonly apiName: string;
  fetchTeams(): Promise<unknown>;
  fetchPlayers(teamId?: string): Promise<unknown>;
  fetchGames(season: string, dateRange?: DateRange): Promise<unknown>;
  fetchPlayerGameLogs(playerId: string, season: string): Promise<unknown>;
  fetchPlayByPlay(gameId: string): Promise<unknown>;
  fetchRosters(teamId: string): Promise<unknown>;
  /** Coaching staff for a team (MLB: rosterType=coach). Unsupported sports throw. */
  fetchCoaches(teamId?: string): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Rate limiting — per-API sliding window
// ---------------------------------------------------------------------------

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Requests per minute per API. BallDontLie's current free tier allows 5
 * requests/minute (docs.balldontlie.io); paid tiers are 60/600 — tune via
 * BALLDONTLIE_RATE_LIMIT if your key is a higher tier.
 */
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  balldontlie: { maxRequests: env.BALLDONTLIE_RATE_LIMIT, windowMs: 60_000 },
  espn: { maxRequests: 60, windowMs: 60_000 },
  mlb: { maxRequests: 120, windowMs: 60_000 },
  nhl: { maxRequests: 60, windowMs: 60_000 },
  python_ml: { maxRequests: 60, windowMs: 60_000 },
};

const DEFAULT_RATE_LIMIT: RateLimitConfig = { maxRequests: 60, windowMs: 60_000 };

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/** Sliding-window pace keeper. Waits (queues) when the window is full. */
export class RateLimiter {
  private readonly windows = new Map<string, number[]>();

  constructor(private readonly limits: Record<string, RateLimitConfig> = RATE_LIMITS) {}

  async acquire(apiName: string): Promise<void> {
    const limit = this.limits[apiName] ?? DEFAULT_RATE_LIMIT;
    for (;;) {
      const now = Date.now();
      const active = (this.windows.get(apiName) ?? []).filter(t => now - t < limit.windowMs);
      if (active.length < limit.maxRequests) {
        active.push(now);
        this.windows.set(apiName, active);
        return;
      }
      const oldest = active[0] ?? now; // window is non-empty here, but TS can't prove it
      const waitMs = oldest + limit.windowMs - now + 25;
      logger.debug({ apiName, waitMs }, 'Rate limit reached — queuing request');
      await sleep(waitMs);
    }
  }
}

/** Whether a fetch error is worth retrying. 4xx (except 429) and local programming errors are permanent. */
function isRetryableError(err: unknown): boolean {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === undefined) return true; // network/connect failure — retry
    return status === 429 || status >= 500; // rate-limited or server error — retry
  }
  return false; // e.g. "Not implemented" shells — fail fast
}

/**
 * Phase 8 Step 3.3 — wraps a failed fetch (raw axios error or plain Error)
 * into the classified ExternalAPIError so the error contract holds end to end.
 * Already-classified errors pass through untouched.
 */
function toExternalAPIError(err: unknown, apiName: string): ExternalAPIError {
  if (err instanceof ExternalAPIError) return err;
  if (axios.isAxiosError(err)) {
    const apiStatus = err.response?.status;
    const retryAfterHeader = err.response?.headers?.['retry-after'];
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    if (apiStatus === 429) {
      return new ExternalAPIError('External API rate limit exceeded', {
        apiName,
        apiStatus,
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : 60,
      });
    }
    if (apiStatus !== undefined) {
      return new ExternalAPIError(`External API ${apiName} returned HTTP ${apiStatus}`, {
        apiName,
        apiStatus,
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
      });
    }
    return new ExternalAPIError(`External API ${apiName} is unreachable`, { apiName });
  }
  const message = err instanceof Error ? err.message : String(err);
  return new ExternalAPIError(`External API ${apiName} request failed: ${message}`, { apiName });
}

/**
 * Master coordinator — the single entry point for all data fetching.
 * Responsibilities:
 *   1. Cache-first: checks CacheMetadata, skips fresh fetches (returns cached flag)
 *   2. Routing: resolves the right sport fetcher
 *   3. Pacing: per-API rate limiting with queueing
 *   4. Retries: up to 3 attempts, exponential backoff (1s → 2s → 4s)
 *   5. Logging: what was fetched, duration, success/failure, record count
 *   6. Cache metadata: refreshes CacheMetadata after every fetch
 */
export class FetcherManager {
  private readonly registry = new Map<string, SportFetcher>();
  private readonly rateLimiter = new RateLimiter();
  private readonly sportIdCache = new Map<string, number | null>();

  constructor() {
    this.register(new NbaFetcher());
    this.register(new NflFetcher());
    this.register(new MlbFetcher());
    this.register(new NhlFetcher());
  }

  /** Protected so tests can subclass and swap in mock fetchers. */
  protected register(fetcher: SportFetcher): void {
    this.registry.set(fetcher.sport, fetcher);
  }

  /** Returns the fetcher for a sport abbreviation, or throws if unsupported. */
  getFetcher(sportAbbreviation: string): SportFetcher {
    const fetcher = this.registry.get(sportAbbreviation);
    if (!fetcher) {
      throw new Error(`Unsupported sport: ${sportAbbreviation}`);
    }
    return fetcher;
  }

  getSupportedSports(): string[] {
    return [...this.registry.keys()];
  }

  // -- Cache helpers ---------------------------------------------------------

  /** True when a fresh CacheMetadata entry exists (data is in SQLite, skip fetch).
   *  Delegates to the SQLite cache layer (Phase 7 Step 4) — the single place
   *  the freshness rule lives. */
  async checkCacheValid(cacheKey: string): Promise<boolean> {
    return isCacheValid(cacheKey);
  }

  private async resolveSportId(sport: string): Promise<number | null> {
    const cached = this.sportIdCache.get(sport);
    if (cached !== undefined) return cached;
    const row = await prisma.sports.findUnique({
      where: { abbreviation: sport },
      select: { id: true },
    });
    // Only cache resolved ids — never the null miss, so a late-seeded Sports
    // table is picked up instead of being cached as missing forever.
    if (row) this.sportIdCache.set(sport, row.id);
    return row?.id ?? null;
  }

  private async resolveSportSeason(sport: string): Promise<string> {
    const row = await prisma.sports.findUnique({
      where: { abbreviation: sport },
      select: { season: true },
    });
    // Fallback until the Sports table is seeded with the current season.
    return row?.season ?? 'current';
  }

  // -- Core fetch pipeline ---------------------------------------------------

  private async withFetch<T>(opts: {
    sport: string;
    apiName: string;
    dataType: string;
    cacheKey: string;
    endpoint: string;
    params?: Record<string, unknown>;
    entityId?: string;
    season?: string;
    fetchFn: () => Promise<T>;
  }): Promise<FetchResult<T>> {
    const started = Date.now();

    // Step 9.1 — cache check, then log the fetch start.
    const cacheValid = await this.checkCacheValid(opts.cacheKey);
    logFetchStart({
      apiName: opts.apiName,
      endpoint: opts.endpoint,
      params: opts.params,
      cacheCheck: true,
      cacheResult: cacheValid ? 'hit' : 'miss',
    });

    // 1. Cache hit — fresh data already in SQLite? Skip the external API.
    if (cacheValid) {
      logger.debug({ cacheKey: opts.cacheKey }, 'Cache hit — skipping external fetch');
      return {
        data: null,
        cached: true,
        cacheKey: opts.cacheKey,
        durationMs: Date.now() - started,
      };
    }

    // 2. Pace the external API, then fetch (with retries)
    await this.rateLimiter.acquire(opts.apiName);
    try {
      const data = await this.retryWithBackoff(opts.fetchFn, opts.cacheKey, 3, {
        apiName: opts.apiName,
        endpoint: opts.endpoint,
      });
      const durationMs = Date.now() - started;
      const recordCount = Array.isArray(data) ? data.length : 1;
      await updateCacheMetadata({
        cacheKey: opts.cacheKey,
        dataType: opts.dataType,
        sportId: await this.resolveSportId(opts.sport),
        entityId: opts.entityId ?? null,
        season: opts.season ?? null,
        recordCount,
        fetchDurationMs: durationMs,
      });
      // Step 9.2 — successful external fetch.
      logFetchSuccess({
        apiName: opts.apiName,
        endpoint: opts.endpoint,
        responseTimeMs: durationMs,
        recordCount,
        cacheUpdated: true,
      });
      return { data, cached: false, cacheKey: opts.cacheKey, durationMs };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await updateCacheMetadata({
          cacheKey: opts.cacheKey,
          dataType: opts.dataType,
          sportId: null,
          entityId: opts.entityId ?? null,
          season: opts.season ?? null,
          recordCount: 0,
          fetchDurationMs: Date.now() - started,
          lastError: message,
        });
      } catch {
        // Metadata write failed (e.g. DB down) — never mask the original fetch error.
      }
      logger.error({ sport: opts.sport, cacheKey: opts.cacheKey, error: message }, 'Fetch failed');
      // Phase 8 Step 3.3/4.2 — surface a classified ExternalAPIError instead of
      // the raw axios error so callers (and the global error middleware) can
      // respond with the standard error contract. Data already synced into
      // SQLite remains queryable regardless (handleAPIFallback in
      // middleware/fallback.handlers.ts serves it when the API is down).
      throw toExternalAPIError(err, opts.apiName);
    }
  }

  /**
   * Retry wrapper — up to `maxRetries` attempts with 1s → 2s → 4s backoff.
   * When `meta` (apiName + endpoint) is provided, every failure is logged via
   * the Step 9.3 fetch-failure logger (warn when retrying, error when giving
   * up); without it the older compact warn/error lines are used.
   */
  async retryWithBackoff<T>(
    fetchFn: () => Promise<T>,
    context: string,
    maxRetries = 3,
    meta?: { apiName: string; endpoint: string }
  ): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await fetchFn();
      } catch (err) {
        attempt += 1;
        const { type, statusCode } = classifyFetchError(err);
        if (attempt > maxRetries || !isRetryableError(err)) {
          if (meta) {
            logFetchFailure({
              apiName: meta.apiName,
              endpoint: meta.endpoint,
              errorType: type,
              statusCode,
              retryAttempt: attempt,
              willRetry: false,
            });
          } else {
            logger.error({ context, attempt }, 'Fetch failed permanently');
          }
          throw err;
        }
        const isRateLimited = axios.isAxiosError(err) && err.response?.status === 429;
        // 429 → wait out the full rate-limit window; otherwise exponential backoff.
        const delayMs = isRateLimited ? 60_000 : 1_000 * 2 ** (attempt - 1);
        if (meta) {
          logFetchFailure({
            apiName: meta.apiName,
            endpoint: meta.endpoint,
            errorType: type,
            statusCode,
            retryAttempt: attempt,
            retryIn: Math.round(delayMs / 1000),
            willRetry: true,
          });
        } else {
          logger.warn(
            { context, attempt, delayMs, isRateLimited },
            'Fetch failed — retrying with backoff'
          );
        }
        await sleep(delayMs);
      }
    }
  }

  // -- Public fetch API -------------------------------------------------------

  async fetchTeams(sport: string): Promise<FetchResult<unknown>> {
    const fetcher = this.getFetcher(sport);
    return this.withFetch({
      sport,
      apiName: fetcher.apiName,
      dataType: 'teams',
      cacheKey: `teams:${sport}`,
      endpoint: 'teams',
      fetchFn: () => fetcher.fetchTeams(),
    });
  }

  async fetchPlayers(sport: string, teamId?: string): Promise<FetchResult<unknown>> {
    const fetcher = this.getFetcher(sport);
    return this.withFetch({
      sport,
      apiName: fetcher.apiName,
      dataType: 'players',
      cacheKey: teamId ? `players:${sport}:${teamId}` : `players:${sport}`,
      endpoint: teamId ? `players?team_id=${teamId}` : 'players',
      params: teamId ? { team_id: teamId } : undefined,
      entityId: teamId,
      fetchFn: () => fetcher.fetchPlayers(teamId),
    });
  }

  async fetchGames(
    sport: string,
    season: string,
    dateRange?: DateRange
  ): Promise<FetchResult<unknown>> {
    const fetcher = this.getFetcher(sport);
    // A date range changes the payload, so it must be part of the cache key.
    const rangeKey = dateRange
      ? `:${dateRange.startDate.toISOString().slice(0, 10)}:${dateRange.endDate.toISOString().slice(0, 10)}`
      : '';
    return this.withFetch({
      sport,
      apiName: fetcher.apiName,
      dataType: 'games',
      cacheKey: `games:${sport}:${season}${rangeKey}`,
      endpoint: dateRange
        ? `games?season=${season}&from=${dateRange.startDate.toISOString().slice(0, 10)}&to=${dateRange.endDate.toISOString().slice(0, 10)}`
        : `games?season=${season}`,
      params: {
        season,
        ...(dateRange
          ? {
              from: dateRange.startDate.toISOString().slice(0, 10),
              to: dateRange.endDate.toISOString().slice(0, 10),
            }
          : {}),
      },
      season,
      fetchFn: () => fetcher.fetchGames(season, dateRange),
    });
  }

  async fetchPlayerGameLogs(
    sport: string,
    playerId: string,
    season: string
  ): Promise<FetchResult<unknown>> {
    const fetcher = this.getFetcher(sport);
    return this.withFetch({
      sport,
      apiName: fetcher.apiName,
      dataType: 'player_logs',
      cacheKey: `player_logs:${sport}:${playerId}:${season}`,
      endpoint: `player_logs/${playerId}?season=${season}`,
      params: { season },
      entityId: playerId,
      season,
      fetchFn: () => fetcher.fetchPlayerGameLogs(playerId, season),
    });
  }

  async fetchPlayByPlay(sport: string, gameId: string): Promise<FetchResult<unknown>> {
    const fetcher = this.getFetcher(sport);
    return this.withFetch({
      sport,
      apiName: fetcher.apiName,
      dataType: 'play_by_play',
      cacheKey: `play_by_play:${sport}:${gameId}`,
      endpoint: `play_by_play/${gameId}`,
      entityId: gameId,
      fetchFn: () => fetcher.fetchPlayByPlay(gameId),
    });
  }

  async fetchRosters(sport: string, teamId: string): Promise<FetchResult<unknown>> {
    // Rosters and player fetches hit the same underlying data — share one cache
    // entry so the API isn't called twice for the same payload.
    return this.fetchPlayers(sport, teamId);
  }

  async fetchCoaches(sport: string, teamId?: string): Promise<FetchResult<unknown>> {
    const fetcher = this.getFetcher(sport);
    return this.withFetch({
      sport,
      apiName: fetcher.apiName,
      dataType: 'coaches',
      cacheKey: teamId ? `coaches:${sport}:${teamId}` : `coaches:${sport}`,
      endpoint: teamId ? `coaches?team_id=${teamId}` : 'coaches',
      params: teamId ? { team_id: teamId } : undefined,
      entityId: teamId,
      fetchFn: () => fetcher.fetchCoaches(teamId),
    });
  }

  /**
   * Season-scoped play-by-play (NFL only, via the Python microservice) — the
   * feed for coach-decision extraction. Other sports fail fast (unsupported).
   */
  async fetchSeasonPlays(
    sport: string,
    season: string,
    week?: number,
    team?: string
  ): Promise<FetchResult<unknown>> {
    const fetcher = this.getFetcher(sport);
    // Narrow contract for the one fetcher that supports season-scoped plays.
    const seasonPlaysFetcher = fetcher as Partial<NflFetcher>;
    if (typeof seasonPlaysFetcher.fetchSeasonPlays !== 'function') {
      throw new Error(`fetchSeasonPlays is not supported for sport: ${sport}`);
    }
    const key = `season_plays:${sport}:${season}${week != null ? `:w${week}` : ''}${team ? `:${team}` : ''}`;
    return this.withFetch({
      sport,
      apiName: fetcher.apiName,
      dataType: 'play_by_play',
      cacheKey: key,
      endpoint: `season_plays?season=${season}${week != null ? `&week=${week}` : ''}${team ? `&team=${team}` : ''}`,
      params: { season, week, team },
      season,
      fetchFn: () => seasonPlaysFetcher.fetchSeasonPlays!(season, week, team),
    });
  }

  // -- Full sync -------------------------------------------------------------

  /**
   * Runs a full sync for a sport in order: teams → players → games.
   * Each stage is cache-aware (fresh stages skip the external API).
   * NOTE: the transform + SQLite write stages land with the transformers in later steps.
   */
  async syncAllData(sport: string, season?: string): Promise<SyncAllResult> {
    const started = Date.now();
    // Step 9.4 — sync start / completion around the stage pipeline.
    logSyncStart({
      sport,
      sections: ['teams', 'players', 'games'],
      triggeredBy: 'manager',
    });

    const resolvedSeason = season ?? (await this.resolveSportSeason(sport));
    const teams = await this.fetchTeams(sport);
    const players = await this.fetchPlayers(sport);
    const games = await this.fetchGames(sport, resolvedSeason);

    const toStage = (r: FetchResult<unknown>): SyncStageResult => ({
      cached: r.cached,
      recordCount: Array.isArray(r.data) ? r.data.length : 0,
      durationMs: r.durationMs,
    });

    const durationMs = Date.now() - started;
    logSyncComplete({
      sport,
      totalDurationMs: durationMs,
      recordsProcessed:
        (Array.isArray(teams.data) ? teams.data.length : 0) +
        (Array.isArray(players.data) ? players.data.length : 0) +
        (Array.isArray(games.data) ? games.data.length : 0),
      errors: 0,
      nextSyncAt: null,
      status: 'complete',
    });
    return {
      sport,
      season: resolvedSeason,
      stages: { teams: toStage(teams), players: toStage(players), games: toStage(games) },
      durationMs,
    };
  }
}

// Shared instance (import this, don't construct your own)
export const fetcherManager = new FetcherManager();
