/**
 * Cache invalidation system (Phase 7, Step 7).
 *
 * When underlying data changes we must drop the old cached versions, or stale
 * data gets served indefinitely. Every invalidation function below:
 *   - removes the affected entries from the in-memory cache (both the
 *     service-level keys AND the middleware's "resp:" response entries —
 *     see Step 6 keys), and
 *   - marks the CacheMetadata registry rows invalid (isValid = false) so the
 *     next freshness check recomputes.
 *
 * It NEVER deletes the actual data (InjuryRiskScores, MomentumAnalysis, …) —
 * the registry is only a freshness flag; the data tables are untouched.
 *
 * Keys come from utils/cache.keys.ts (Step 5). Key families that span multiple
 * members (all alert zones, all leaderboard decisionTypes…) are invalidated by
 * prefix, mirroring the builder formats.
 *
 * Triggers (Step 7.2) are wired into the background jobs:
 *   data sync job     → invalidateSportCache(sport) per synced sport
 *   risk compute job  → invalidatePlayerCache + invalidateTeamCache per
 *                       player whose zone changed
 *   momentum job      → invalidateMomentumAnalysis(sport, season) per updated
 *                       sport
 */
import { cacheDel, cacheDelPrefix, cacheFlush } from '../cache/memoryCache.js';
import { CacheDataType } from '../utils/cache.config.js';
import {
  alertsKey,
  playerInfoKey,
  riskScoreKey,
  teamListKey,
  teamRiskKey,
} from '../utils/cache.keys.js';
import { logger } from '../utils/logger.util.js';
import {
  markAllCacheInvalid,
  markCacheInvalid,
  markCacheInvalidByPrefix,
  markCacheInvalidBySport,
  resolveSportId,
} from './sqlite.cache.service.js';

/** Alerts are cached per (sport, zone) — these are the zones that exist (Step 3.3). */
const ALERT_ZONES = ['red', 'yellow', 'green'] as const;

/**
 * Removes a key from memory in BOTH forms: the service-level key itself and
 * the middleware's "resp:{key}" response entries (plus any varyBy suffix
 * under them, which cacheDelPrefix catches).
 */
function delMem(key: string): void {
  cacheDel(key);
  cacheDelPrefix(`resp:${key}`);
}

/** Deletes every memory entry in a key family (service + resp forms). */
function delMemFamily(prefix: string): void {
  cacheDelPrefix(prefix);
  cacheDelPrefix(`resp:${prefix}`);
}

// ---------------------------------------------------------------------------
// Step 7.1 — Invalidation functions
// ---------------------------------------------------------------------------

/**
 * Invalidates everything cached about one player — used after a manual
 * recalculate and by the risk compute job for zone-changed players.
 *
 * Memory:  "player:info:{playerId}", "risk:{playerId}" (+ resp: variants)
 * Registry: "risk:{playerId}" marked invalid
 */
export async function invalidatePlayerCache(playerId: number | string): Promise<void> {
  delMem(playerInfoKey(playerId));
  delMem(riskScoreKey(playerId));
  await markCacheInvalid(riskScoreKey(playerId));
  logger.debug({ playerId }, 'cache: player cache invalidated');
}

/**
 * Invalidates everything cached about one team — used by the risk compute job
 * so a team dashboard and its traffic-light alerts reflect fresh scores.
 *
 * Memory:  "risk:team:{teamId}", "alerts:{sport}:{zone}" for red/yellow/green,
 *          "teams:{sport}" (rosters may have changed)
 * Registry: "risk:team:{teamId}" marked invalid
 */
export async function invalidateTeamCache(teamId: number | string, sport: string): Promise<void> {
  delMem(teamRiskKey(teamId));
  for (const zone of ALERT_ZONES) {
    delMem(alertsKey(sport, zone));
  }
  delMem(teamListKey(sport));
  await markCacheInvalid(teamRiskKey(teamId));
  logger.debug({ teamId, sport }, 'cache: team cache invalidated');
}

/**
 * Invalidates every cache tied to a sport — used after a full data sync so
 * the next search, team, alert, leaderboard and momentum request recomputes
 * from the fresh rows.
 *
 * Memory: all search results, team list, alerts, sport config, leaderboard
 *         and momentum families for the sport (service + resp: forms)
 * Registry: two passes —
 *   1. key-prefix rows: leaderboard/momentum keys embed the sport in the key,
 *      which catches the middleware-marked rows (they don't store sportId);
 *   2. sportId-scoped rows: the fetch layer records sportId, so everything it
 *      touched for this sport (player_logs, play_by_play, …) is invalidated.
 */
export async function invalidateSportCache(sport: string): Promise<void> {
  // Memory — every family whose key embeds the sport.
  delMemFamily(`search:players:${sport}:`);
  delMemFamily(`search:teams:${sport}:`);
  delMemFamily(`teams:${sport}`);
  delMemFamily(`alerts:${sport}:`);
  delMemFamily(`sport:config:${sport}`);
  delMemFamily(`leaderboard:${sport}:`);
  delMemFamily(`momentum:season:${sport}:`);

  // Registry — key-prefix rows (leaderboard + momentum key families).
  await markCacheInvalidByPrefix(`leaderboard:${sport}:`);
  await markCacheInvalidByPrefix(`momentum:season:${sport}:`);

  // Registry — sportId-scoped rows (fetch-layer dataTypes).
  const sportId = await resolveSportId(sport);
  if (sportId != null) {
    await markCacheInvalidBySport(sportId, [
      CacheDataType.PLAYER_LOGS,
      CacheDataType.PLAY_BY_PLAY,
      CacheDataType.COACH_DECISIONS,
      CacheDataType.COACH_LEADERBOARD,
      CacheDataType.MOMENTUM_ANALYSIS,
      CacheDataType.GAME_MOMENTUM,
      CacheDataType.TEAM_DATA,
      CacheDataType.PLAYER_DATA,
      CacheDataType.TIMEOUT_RECOMMENDATIONS,
      CacheDataType.SEASON_DATA,
      // Fetch-layer dataTypes (fetcher.manager writes these — without them a
      // sport invalidation never touches teams/players/games rows, so a sync
      // whose DB write failed would keep skipping the stage on cache hits).
      CacheDataType.TEAMS,
      CacheDataType.PLAYERS,
      CacheDataType.GAMES,
      CacheDataType.COACHES,
    ]);
  }

  logger.info({ sport }, 'cache: sport cache invalidated');
}

/**
 * Invalidates cached coach leaderboards for a sport, optionally narrowed to
 * one season. Used after a leaderboard recompute / decisions data change.
 *
 * Memory:  "leaderboard:{sport}:{season}:*" (+ resp: variants)
 * Registry: same key family marked invalid
 */
export async function invalidateLeaderboard(sport: string, season?: string): Promise<void> {
  const prefix = `leaderboard:${sport}:${season ? `${season}:` : ''}`;
  delMemFamily(prefix);
  await markCacheInvalidByPrefix(prefix);
  logger.debug({ sport, season: season ?? null }, 'cache: leaderboard cache invalidated');
}

/**
 * Invalidates cached momentum analysis for a sport, optionally narrowed to one
 * season. Used by the momentum job after the Cox analysis is refreshed.
 *
 * Memory:  "momentum:season:{sport}[:{season}]" (+ resp: variants)
 * Registry: same key family marked invalid
 */
export async function invalidateMomentumAnalysis(sport: string, season?: string): Promise<void> {
  const prefix = `momentum:season:${sport}:${season ?? ''}`;
  delMemFamily(prefix);
  await markCacheInvalidByPrefix(prefix);
  logger.debug({ sport, season: season ?? null }, 'cache: momentum cache invalidated');
}

/**
 * Nuclear option — clears everything. Used in testing and after major schema
 * changes.
 *
 * Memory:  node-cache flushed completely
 * Registry: every CacheMetadata row marked invalid
 */
export async function invalidateAllCaches(): Promise<void> {
  cacheFlush();
  const count = await markAllCacheInvalid();
  logger.info({ memoryFlushed: true, registryInvalidated: count }, 'cache: ALL caches invalidated');
}
