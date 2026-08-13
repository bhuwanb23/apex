/**
 * Cache middleware (Phase 7, Step 6 — 7.3).
 *
 * createCacheMiddleware(options) returns an Express middleware that sits
 * between the router and the controller:
 *
 *   HIT   → cached response returned immediately (controller never runs)
 *   MISS  → controller runs, response stored for next time
 *   STALE → cached data older than staleThreshold returned immediately while a
 *           background refresh recomputes and repopulates the cache
 *
 * Layers (Step 6.1):
 *   memory → node-cache only (searches, team lists, alerts)
 *   sqlite → CacheMetadata registry (Step 4) — a fresh registry row means the
 *            controller reads fresh persisted data from its proper table, so
 *            responses survive a server restart (X-Cache-Layer: sqlite)
 *   both   → memory fast path + sqlite persistence
 *
 * Keys:
 *   Response bodies live in memory under "resp:<key>" so they can never
 *   collide with the service-level caches (search, leaderboard) that use the
 *   same Step 5 key builders in node-cache. The SQLite registry keeps the
 *   plain Step 5 key. varyBy query params are appended to the memory key only
 *   (they change the response shape, not the underlying data freshness).
 *
 * Headers (Step 6.3) on every cached response:
 *   X-Cache-Status: HIT | MISS | STALE
 *   X-Cache-Age / X-Cache-TTL: seconds
 *   X-Cache-Layer: memory | sqlite | fresh
 *
 * Degraded responses (payloads carrying a `warning`, e.g. an ML-service
 * fallback) are never cached — they must be recomputed as soon as the ML
 * service recovers.
 */
import type { Request, RequestHandler, Response } from 'express';
import { cacheDel, cacheGet, cacheSet, memoryCache } from '../cache/memoryCache.js';
import { env } from '../config/env.js';
import {
  getCacheInfo,
  isCacheStale,
  isCacheValid,
  isStoryFresh,
  markCacheValid,
} from '../services/sqlite.cache.service.js';
import {
  CacheDataType,
  IN_MEMORY_TTL,
  SQLITE_TTL,
  STALE_WHILE_REVALIDATE,
} from '../utils/cache.config.js';
import {
  alertsKey,
  coachDetailKey,
  leaderboardKey,
  momentumComparisonKey,
  momentumSeasonKey,
  riskScoreKey,
  searchPlayersKey,
  searchTeamsKey,
  storyKey,
  teamListKey,
  teamRiskKey,
  timeoutKey,
} from '../utils/cache.keys.js';
import { logger } from '../utils/logger.util.js';

// ---------------------------------------------------------------------------
// Types + helpers
// ---------------------------------------------------------------------------

type CacheLayer = 'memory' | 'sqlite' | 'both';
type CacheStatus = 'HIT' | 'MISS' | 'STALE';
type CacheLayerHeader = 'memory' | 'sqlite' | 'fresh';

// ---------------------------------------------------------------------------
// Performance tracking (Step 9 — /api/cache/stats performance block)
// ---------------------------------------------------------------------------
// Rolling sums of response times split by how the response was produced:
// 'hit'  = served from a cache (HIT or STALE — fast)
// 'miss' = freshly computed (controller ran — slower)
// Background refreshes are excluded (they run off-request).

let hitSamples = 0;
let hitTotalMs = 0;
let missSamples = 0;
let missTotalMs = 0;

function recordTiming(kind: 'hit' | 'miss', ms: number): void {
  if (kind === 'hit') {
    hitSamples += 1;
    hitTotalMs += ms;
  } else {
    missSamples += 1;
    missTotalMs += ms;
  }
}

/** Average response time for cache-served vs freshly-computed responses. */
export function getCachePerformanceStats(): {
  avgHitResponseMs: number;
  avgMissResponseMs: number;
  hitSamples: number;
  missSamples: number;
} {
  return {
    avgHitResponseMs: hitSamples > 0 ? Math.round(hitTotalMs / hitSamples) : 0,
    avgMissResponseMs: missSamples > 0 ? Math.round(missTotalMs / missSamples) : 0,
    hitSamples,
    missSamples,
  };
}

interface CachedResponse {
  status: number;
  body: unknown;
}

export interface CacheMiddlewareOptions {
  /** How long to cache in seconds. */
  ttl: number;
  /** Builds the base cache key from the request (use the Step 5 builders). */
  keyBuilder: (req: Request) => string;
  /** Which layers to use. Default 'memory'. */
  cacheLayer?: CacheLayer;
  /** Enable stale-while-revalidate. Default false. */
  allowStale?: boolean;
  /** Seconds after which a cached entry is served stale while refreshing. */
  staleThreshold?: number;
  /** Query params that change the response — appended to the memory key. */
  varyBy?: string[];
  /** CacheMetadata dataType written for sqlite/both layers. */
  dataType?: CacheDataType;
  /** Custom "fresh in the persistent layer" check — the story route checks the
   *  StoryLogs table directly instead of the CacheMetadata registry. */
  sqliteFresh?: (key: string) => Promise<boolean>;
  /** Skip the cache read path (but still cache the response) — e.g. a
   *  ?recalculate=true flag that must always force fresh computation. */
  skipRead?: (req: Request) => boolean;
}

/**
 * A response is "degraded" when its payload carries a `warning` — services add
 * one (e.g. "ML service unavailable — showing last computed score…") when they
 * fall back to cached/stale data because the Python ML service was unreachable.
 * Degraded responses are never cached (see file header).
 */
function isDegraded(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const root = body as Record<string, unknown>;
  const hasWarning = (v: unknown): boolean =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).warning === 'string' &&
    ((v as Record<string, unknown>).warning as string).length > 0;
  return hasWarning(root) || hasWarning(root.data);
}

function setCacheHeaders(
  res: Response,
  status: CacheStatus,
  layer: CacheLayerHeader,
  ageSeconds: number,
  ttlSeconds: number
): void {
  res.setHeader('X-Cache-Status', status);
  res.setHeader('X-Cache-Age', String(Math.max(0, Math.round(ageSeconds))));
  res.setHeader('X-Cache-TTL', String(Math.max(0, Math.round(ttlSeconds))));
  res.setHeader('X-Cache-Layer', layer);
}

/** Appends the varyBy query params (sorted, only those present) to the key. */
function appendVaryBy(base: string, req: Request, varyBy: string[]): string {
  const parts = varyBy
    .filter(name => req.query[name] !== undefined)
    .sort()
    .map(name => `${name}=${String(req.query[name])}`);
  return parts.length > 0 ? `${base}:${parts.join(':')}` : base;
}

/**
 * Background refresh: re-issue the same request with an x-cache-refresh header
 * so the middleware bypasses the read path, the controller recomputes, and the
 * fresh response repopulates the memory + registry caches. The response itself
 * is discarded. Errors are logged at debug — a failed refresh just means the
 * next request serves stale again or recomputes.
 */
function scheduleBackgroundRefresh(req: Request): void {
  const url = `http://127.0.0.1:${env.PORT}${req.originalUrl}`;
  fetch(url, { headers: { 'x-cache-refresh': '1' } }).catch(err => {
    logger.debug(
      { url, error: err instanceof Error ? err.message : String(err) },
      'cache: background refresh failed'
    );
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCacheMiddleware(options: CacheMiddlewareOptions): RequestHandler {
  const {
    ttl,
    keyBuilder,
    cacheLayer = 'memory',
    allowStale = false,
    staleThreshold = ttl,
    varyBy = [],
    dataType,
    sqliteFresh,
    skipRead,
  } = options;

  // Dog-pile prevention (Step 10, Test 7): one in-flight computation per memory
  // key. When a miss arrives while another request is already computing the
  // same key, it awaits the leader instead of recomputing — N simultaneous
  // misses trigger exactly ONE controller run.
  const inFlight = new Map<string, Promise<void>>();

  /**
   * Serves a cached entry from memory with the correct headers (HIT, or STALE
   * + background refresh past staleThreshold). Evicts + returns false for
   * degraded entries so the caller falls through to a fresh compute. Shared by
   * the direct read path and single-flight followers.
   */
  function serveFromMemory(
    req: Request,
    res: Response,
    memKey: string,
    entry: CachedResponse,
    startedAt: number
  ): boolean {
    if (isDegraded(entry.body)) {
      // Should never happen (degraded responses aren't cached) — evict any
      // legacy entry so the next request recomputes live.
      cacheDel(memKey);
      return false;
    }
    // node-cache's getTtl returns the ABSOLUTE expiry timestamp in ms (not the
    // remaining TTL) — subtract now for the remaining time.
    const expiryMs = memoryCache.getTtl(memKey) ?? 0;
    const remainingMs = Math.max(0, expiryMs - Date.now());
    // Fractional age drives the stale check; the header rounds for display.
    const age = Math.max(0, ttl - remainingMs / 1000);
    const ttlRemaining = Math.max(0, Math.round(remainingMs / 1000));
    recordTiming('hit', Date.now() - startedAt);
    if (!allowStale || age <= staleThreshold) {
      setCacheHeaders(res, 'HIT', 'memory', Math.round(age), ttlRemaining);
      res.status(entry.status).json(entry.body);
    } else {
      // Stale — serve now, refresh in the background.
      setCacheHeaders(res, 'STALE', 'memory', Math.round(age), ttlRemaining);
      res.status(entry.status).json(entry.body);
      scheduleBackgroundRefresh(req);
    }
    return true;
  }

  return (req, res, next) => {
    const startedAt = Date.now();
    void (async () => {
      try {
        if (req.method !== 'GET') {
          next();
          return;
        }
        // Background-refresh bypass — recompute and store, never serve. The
        // result is as fresh as a normal miss, so the SQLite registry is
        // re-validated too (otherwise a stale-while-revalidate cycle would
        // leave the registry expired and the data would be served stale again
        // after the next server restart). Timing is not recorded — this runs
        // off-request and would skew the performance stats.
        if (req.header('x-cache-refresh') === '1') {
          const bypassKey = keyBuilder(req);
          runController(req, res, next, {
            memKey: `resp:${appendVaryBy(bypassKey, req, varyBy)}`,
            registryKey: bypassKey,
            status: 'MISS',
            layer: 'fresh',
            markRegistry: cacheLayer !== 'memory' && !sqliteFresh && dataType != null,
            startedAt,
            recordTiming: false,
          });
          return;
        }

        const base = keyBuilder(req);
        const memKey = `resp:${appendVaryBy(base, req, varyBy)}`;

        // Step 2 — memory layer first.
        if (!skipRead?.(req)) {
          const entry = cacheGet<CachedResponse>(memKey);
          if (entry && serveFromMemory(req, res, memKey, entry, startedAt)) {
            return;
          }

          // Step 3 — SQLite registry (sqlite / both layers).
          if (cacheLayer !== 'memory') {
            const fresh = sqliteFresh ? await sqliteFresh(base) : await isCacheValid(base);
            if (fresh) {
              // Fresh in the persistent layer → the controller reads fresh data
              // from its proper table (fast) and we label it a sqlite hit.
              const info = sqliteFresh ? null : await getCacheInfo(base);
              const age = info
                ? Math.max(0, Math.round((Date.now() - info.cachedAt.getTime()) / 1000))
                : 0;
              const ttlRemaining = info
                ? Math.max(0, Math.round((info.expiresAt.getTime() - Date.now()) / 1000))
                : ttl;
              runController(req, res, next, {
                memKey,
                registryKey: base,
                status: 'HIT',
                layer: 'sqlite',
                age,
                ttlRemaining,
                markRegistry: false,
                startedAt,
              });
              return;
            }
            // Step 4 — stale-while-revalidate: data exists but past expiry.
            if (allowStale && !sqliteFresh) {
              const stale = await isCacheStale(base);
              if (stale.isStale) {
                const info = await getCacheInfo(base);
                const age = info
                  ? Math.max(0, Math.round((Date.now() - info.cachedAt.getTime()) / 1000))
                  : ttl;
                const ttlRemaining = info
                  ? Math.max(0, Math.round((info.expiresAt.getTime() - Date.now()) / 1000))
                  : 0;
                runController(req, res, next, {
                  memKey,
                  registryKey: base,
                  status: 'STALE',
                  layer: 'sqlite',
                  age,
                  ttlRemaining,
                  markRegistry: false,
                  startedAt,
                });
                scheduleBackgroundRefresh(req);
                return;
              }
            }
          }
        }

        // Step 5/6 — miss: run the controller, intercept and cache the response.
        // Dog-pile prevention: if another request is already computing this
        // key, wait for it and serve its result instead of computing again.
        const inflight = inFlight.get(memKey);
        if (inflight) {
          await inflight;
          const entry = cacheGet<CachedResponse>(memKey);
          if (entry && serveFromMemory(req, res, memKey, entry, startedAt)) {
            return; // follower served the leader's result (counted as a hit)
          }
          // Leader produced nothing cacheable (error/degraded) — compute below.
        }

        let resolveInflight: () => void = () => {};
        const inflightPromise = new Promise<void>(resolve => {
          resolveInflight = resolve;
        });
        inFlight.set(memKey, inflightPromise);
        let settled = false;
        const settle = (): void => {
          if (settled) return;
          settled = true;
          inFlight.delete(memKey);
          resolveInflight();
        };
        // Resolve when the response is fully sent (finish) or the connection
        // dropped (close) — both cover error paths where res.json never fires.
        res.on('finish', settle);
        res.on('close', settle);

        runController(req, res, next, {
          memKey,
          registryKey: base,
          status: 'MISS',
          layer: 'fresh',
          markRegistry: cacheLayer !== 'memory' && !sqliteFresh && dataType != null,
          startedAt,
        });
      } catch (err) {
        // A cache-layer failure must never break the request — fall through to
        // the controller, which computes fresh.
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'cache middleware error — continuing without cache'
        );
        next();
      }
    })();
  };

  /** Runs the controller, intercepting res.json to store the response. */
  function runController(
    req: Request,
    res: Response,
    next: () => void,
    meta: {
      memKey: string;
      registryKey: string;
      status: CacheStatus;
      layer: CacheLayerHeader;
      age?: number;
      ttlRemaining?: number;
      markRegistry: boolean;
      /** When the request started — drives the performance stats. */
      startedAt: number;
      /** False for background refreshes (off-request, would skew stats). */
      recordTiming?: boolean;
    }
  ): void {
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (meta.recordTiming !== false) {
        recordTiming(meta.status === 'MISS' ? 'miss' : 'hit', Date.now() - meta.startedAt);
      }
      if (res.statusCode >= 200 && res.statusCode < 400 && !isDegraded(body)) {
        setCacheHeaders(res, meta.status, meta.layer, meta.age ?? 0, meta.ttlRemaining ?? ttl);
        cacheSet(meta.memKey, { status: res.statusCode, body }, ttl);
        if (meta.markRegistry) {
          markCacheValid(meta.registryKey, dataType!, { ttl }).catch(err => {
            logger.debug(
              { key: meta.registryKey, error: err instanceof Error ? err.message : String(err) },
              'sqlite cache: registry mark failed'
            );
          });
        }
      }
      return originalJson(body);
    }) as typeof res.json;
    next();
  }
}

// ---------------------------------------------------------------------------
// Step 6.2 — Route-specific middleware instances
// ---------------------------------------------------------------------------

/** Search players (Step 6.2 searchCacheMiddleware — memory, 1h, fresh only). */
export const searchPlayersCacheMiddleware = createCacheMiddleware({
  ttl: IN_MEMORY_TTL.SEARCH_RESULTS,
  cacheLayer: 'memory',
  allowStale: false,
  keyBuilder: req =>
    searchPlayersKey(String(req.query.sport ?? 'all'), String(req.query.q ?? '')),
  varyBy: ['limit'],
});

/** Search teams (same config, team key). */
export const searchTeamsCacheMiddleware = createCacheMiddleware({
  ttl: IN_MEMORY_TTL.SEARCH_RESULTS,
  cacheLayer: 'memory',
  allowStale: false,
  keyBuilder: req => searchTeamsKey(String(req.query.sport ?? 'all'), String(req.query.q ?? '')),
});

/** Team list (Step 6.2 — 24h, stale-while-revalidate after 12h). */
export const teamListCacheMiddleware = createCacheMiddleware({
  ttl: IN_MEMORY_TTL.TEAM_LISTS,
  cacheLayer: 'memory',
  allowStale: true,
  staleThreshold: 43_200, // 12h per Step 6.2
  keyBuilder: req => teamListKey(String(req.params.sport)),
});

/** League alerts (Step 6.2 — 30min, stale after 15min). */
export const alertsCacheMiddleware = createCacheMiddleware({
  ttl: IN_MEMORY_TTL.ACTIVE_ALERTS,
  cacheLayer: 'memory',
  allowStale: true,
  staleThreshold: STALE_WHILE_REVALIDATE.ALERTS_STALE_AFTER,
  keyBuilder: req => alertsKey(String(req.params.sport), String(req.query.zone ?? 'red')),
  varyBy: ['limit'],
});

/** Coach leaderboard (Step 6.2 — both layers, 24h, stale after 12h). */
export const leaderboardCacheMiddleware = createCacheMiddleware({
  ttl: SQLITE_TTL.COACH_LEADERBOARD,
  cacheLayer: 'both',
  allowStale: true,
  staleThreshold: STALE_WHILE_REVALIDATE.LEADERBOARD_STALE_AFTER,
  dataType: CacheDataType.COACH_LEADERBOARD,
  keyBuilder: req =>
    leaderboardKey(
      String(req.params.sport),
      String(req.query.season ?? ''),
      String(req.query.decisionType ?? 'all'),
      String(req.query.gameType ?? 'all')
    ),
  varyBy: ['page', 'limit'],
});

/** Momentum season analysis (Step 6.2 — both layers, 24h, stale after 12h). */
export const momentumCacheMiddleware = createCacheMiddleware({
  ttl: SQLITE_TTL.MOMENTUM_ANALYSIS,
  cacheLayer: 'both',
  allowStale: true,
  staleThreshold: STALE_WHILE_REVALIDATE.MOMENTUM_STALE_AFTER,
  dataType: CacheDataType.MOMENTUM_ANALYSIS,
  keyBuilder: req => momentumSeasonKey(String(req.params.sport), String(req.query.season ?? '')),
});

/**
 * Risk score (Step 6.2 — sqlite layer, 6h, stale after 3h; the data survives
 * restart in InjuryRiskScores). ?recalculate=true bypasses the cache read so a
 * fresh ML computation always runs.
 */
export const riskScoreCacheMiddleware = createCacheMiddleware({
  ttl: SQLITE_TTL.RISK_SCORES,
  cacheLayer: 'sqlite',
  allowStale: true,
  staleThreshold: 10_800, // 3h per Step 6.2
  dataType: CacheDataType.RISK_SCORES,
  keyBuilder: req => riskScoreKey(String(req.params.playerId)),
  skipRead: req => req.query.recalculate === 'true',
});

/**
 * Story (Step 6.2 — 1h). Persistence lives in the StoryLogs table (the
 * controller owns it), so the "sqlite" freshness check is isStoryFresh —
 * StoryLogs directly, not the CacheMetadata registry.
 */
export const storyCacheMiddleware = createCacheMiddleware({
  ttl: SQLITE_TTL.STORY_TEXT,
  cacheLayer: 'sqlite',
  allowStale: false,
  sqliteFresh: isStoryFresh,
  keyBuilder: req =>
    storyKey(
      String(req.params.module),
      String(req.params.sport),
      String(req.query.role ?? 'analyst'),
      req.query.entityId ? String(req.query.entityId) : undefined,
      req.query.season ? String(req.query.season) : undefined
    ),
});

// ---------------------------------------------------------------------------
// Step 8 — remaining route instances (team risk, coach detail, comparison,
// timeout). These complete the Step 6.2 set.
// ---------------------------------------------------------------------------

/**
 * Team risk dashboard (Step 8 — sqlite layer, 6h, stale after 3h; the roster's
 * risk data survives restart in InjuryRiskScores). Mirrors the risk score
 * route config — same data family.
 */
export const teamRiskCacheMiddleware = createCacheMiddleware({
  ttl: SQLITE_TTL.RISK_SCORES,
  cacheLayer: 'sqlite',
  allowStale: true,
  staleThreshold: 10_800, // 3h — same pattern as the risk score route
  dataType: CacheDataType.RISK_SCORES,
  keyBuilder: req => teamRiskKey(String(req.params.teamId)),
});

/** Coach decision drill-down (Step 8 — 1 hour TTL, both layers). */
export const coachDetailCacheMiddleware = createCacheMiddleware({
  ttl: SQLITE_TTL.COACH_DETAIL,
  cacheLayer: 'both',
  allowStale: true,
  staleThreshold: 1800, // 30 min
  dataType: CacheDataType.COACH_DECISIONS,
  keyBuilder: req => coachDetailKey(String(req.params.coachId)),
  varyBy: ['season', 'decisionType', 'isOptimal', 'page', 'limit'],
});

/** Sport comparison (Step 8 — 24h, both layers, stale after 12h). */
export const comparisonCacheMiddleware = createCacheMiddleware({
  ttl: SQLITE_TTL.MOMENTUM_ANALYSIS,
  cacheLayer: 'both',
  allowStale: true,
  staleThreshold: STALE_WHILE_REVALIDATE.MOMENTUM_STALE_AFTER,
  dataType: CacheDataType.MOMENTUM_ANALYSIS,
  keyBuilder: req =>
    momentumComparisonKey(req.query.season ? String(req.query.season) : undefined),
});

/**
 * Timeout optimizer (Step 8 — 30 day TTL, scenarios are static per game
 * state; the underlying TimeoutRecommendations row refreshes on the same
 * window). The scenario key is built from the validated situation params, so
 * each distinct game state gets its own cached recommendation.
 */
export const timeoutCacheMiddleware = createCacheMiddleware({
  ttl: SQLITE_TTL.TIMEOUT_RECOMMENDATIONS,
  cacheLayer: 'both',
  allowStale: false,
  dataType: CacheDataType.TIMEOUT_RECOMMENDATIONS,
  keyBuilder: req =>
    timeoutKey(
      String(req.params.sport),
      [
        String(req.query.consecutiveScores ?? '0'),
        String(req.query.scoreDiff ?? '0'),
        String(req.query.timeRemaining ?? '0'),
        String(req.query.period ?? '0'),
        String(req.query.timeoutsAvailable ?? '0'),
      ].join('|')
    ),
});
