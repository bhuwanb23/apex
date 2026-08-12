/**
 * In-memory cache service (Phase 7, Step 3 — 7.1).
 *
 * Typed helpers + statistics on top of the shared node-cache instance in
 * src/cache/memoryCache.ts. There is exactly ONE node-cache instance in the
 * app — the middleware and every service share it, so keys and hit/miss stats
 * are consistent. Use the typed helpers here instead of raw keys.
 *
 * Mapping of the Step 3.1 generic functions (they live in memoryCache.ts):
 *   get(key)      → cacheGet<T>(key)
 *   set(k,v,ttl?) → cacheSet(key, value, ttlSeconds?)
 *   del(key[])    → cacheDel(key)
 *   flush()       → cacheFlush()
 *   getStats()    → getMemoryCacheStats() (below)
 *
 * Key conventions (Step 3.3): lowercase, colon-separated segments, most
 * specific segment last, no spaces/special characters. The builders below are
 * the single place memory keys are constructed — Step 5 centralizes all of
 * them in utils/cache.keys.ts.
 */
import { cacheGet, cacheSet, memoryCache } from '../cache/memoryCache.js';
import { IN_MEMORY_TTL } from '../utils/cache.config.js';
import { logger } from '../utils/logger.util.js';

// ---------------------------------------------------------------------------
// Statistics (Step 3.1 — getStats)
// ---------------------------------------------------------------------------

export interface MemoryCacheStats {
  /** Total keys currently stored. */
  keys: number;
  /** Total cache hits since process start. */
  hits: number;
  /** Total cache misses since process start. */
  misses: number;
  /** Percentage of lookups that hit (0-100). */
  hitRate: number;
  /** Approximate memory used by cached keys, in bytes. */
  ksize: number;
}

/** node-cache statistics → the documented shape (hitRate calculated). */
export function getMemoryCacheStats(): MemoryCacheStats {
  const stats = memoryCache.getStats();
  const total = stats.hits + stats.misses;
  return {
    keys: stats.keys,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: total > 0 ? Math.round((stats.hits / total) * 10_000) / 100 : 0,
    ksize: stats.ksize,
  };
}

// ---------------------------------------------------------------------------
// Key builders (Step 3.3 conventions)
// ---------------------------------------------------------------------------

/** "search:players:{sport}:{query}" — e.g. search:players:NBA:lebr */
function searchPlayersKey(sport: string, query: string): string {
  return `search:players:${sport}:${query.trim().toLowerCase()}`;
}

/** "teams:{sport}" — e.g. teams:NBA */
function teamListKey(sport: string): string {
  return `teams:${sport}`;
}

/** "alerts:{sport}:{zone}" — e.g. alerts:NBA:red */
function alertsKey(sport: string, zone: string): string {
  return `alerts:${sport}:${zone}`;
}

/** "player:info:{playerId}" — e.g. player:info:237 */
function playerInfoKey(playerId: number): string {
  return `player:info:${playerId}`;
}

/** "sport:config:{sport}" — e.g. sport:config:NFL */
function sportConfigKey(sport: string): string {
  return `sport:config:${sport}`;
}

/** "ml:health" — single well-known key. */
const ML_HEALTH_KEY = 'ml:health';

// ---------------------------------------------------------------------------
// Typed helpers (Step 3.2)
// ---------------------------------------------------------------------------

/** Cache player autocomplete results for (query, sport) — TTL 1 hour.
 *  Signature order follows the Phase 7 doc (query first, then sport). */
export function cacheSearchResults<T>(query: string, sport: string, results: T[]): boolean {
  const key = searchPlayersKey(sport, query);
  const ok = cacheSet(key, results, IN_MEMORY_TTL.SEARCH_RESULTS);
  if (ok) logger.debug({ key, count: results.length }, 'cache: search results stored');
  return ok;
}

/** Player autocomplete results for (query, sport), or undefined on miss. */
export function getSearchResults<T>(query: string, sport: string): T[] | undefined {
  return cacheGet<T[]>(searchPlayersKey(sport, query));
}

/** Cache a sport's team list — TTL 24 hours. */
export function cacheTeamList<T>(sport: string, teams: T[]): boolean {
  return cacheSet(teamListKey(sport), teams, IN_MEMORY_TTL.TEAM_LISTS);
}

/** A sport's team list, or undefined on miss. */
export function getTeamList<T>(sport: string): T[] | undefined {
  return cacheGet<T[]>(teamListKey(sport));
}

/** Cache risk alerts for (sport, zone) — TTL 30 minutes. */
export function cacheActiveAlerts<T>(sport: string, zone: string, alerts: T[]): boolean {
  return cacheSet(alertsKey(sport, zone), alerts, IN_MEMORY_TTL.ACTIVE_ALERTS);
}

/** Risk alerts for (sport, zone), or undefined on miss. */
export function getActiveAlerts<T>(sport: string, zone: string): T[] | undefined {
  return cacheGet<T[]>(alertsKey(sport, zone));
}

/** Cache a player's basic info — TTL 24 hours. */
export function cachePlayerInfo<T>(playerId: number, info: T): boolean {
  return cacheSet(playerInfoKey(playerId), info, IN_MEMORY_TTL.PLAYER_BASIC_INFO);
}

/** A player's basic info, or undefined on miss. */
export function getPlayerInfo<T>(playerId: number): T | undefined {
  return cacheGet<T>(playerInfoKey(playerId));
}

/** Cache a sport's config — TTL 24 hours. */
export function cacheSportConfig<T>(sport: string, config: T): boolean {
  return cacheSet(sportConfigKey(sport), config, IN_MEMORY_TTL.SPORT_CONFIG);
}

/** A sport's config, or undefined on miss. */
export function getSportConfig<T>(sport: string): T | undefined {
  return cacheGet<T>(sportConfigKey(sport));
}

/** Cache the Python ML service health payload — TTL 15 minutes. */
export function cacheMLHealth(status: Record<string, unknown>): boolean {
  return cacheSet(ML_HEALTH_KEY, status, IN_MEMORY_TTL.ML_SERVICE_HEALTH);
}

/** The cached ML health payload, or undefined on miss. */
export function getMLHealthStatus(): Record<string, unknown> | undefined {
  return cacheGet<Record<string, unknown>>(ML_HEALTH_KEY);
}
