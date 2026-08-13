/**
 * SQLite cache layer (Phase 7, Step 4 — 7.2).
 *
 * CacheMetadata is a persistent *registry*: it records what computed data
 * exists, when it was computed, when it expires and whether it is still valid.
 * The actual data is NEVER stored here — it lives in its own tables
 * (InjuryRiskScores, MomentumAnalysis, DecisionEVScores, …) so it stays
 * queryable (filter by zone, sort by evRate, join with players). Storing raw
 * JSON blobs in the cache table would destroy all of that.
 *
 * Layer 2 sits under the in-memory cache: after a server restart it is the
 * source of truth that tells the services "the SQLite data is fresh, serve
 * it" — the in-memory layer is lost on restart, this one survives.
 *
 * The data-fetch layer already maintains CacheMetadata rows for raw API pulls
 * (db.writer.updateCacheMetadata records them; FetcherManager.checkCacheValid
 * reads them) — this service is the single place that logic lives.
 */
import { prisma } from '../db/client.js';
import type { CacheMetadata } from '../generated/prisma/client.js';
import { CacheDataType, SQLITE_TTL } from '../utils/cache.config.js';
import { leaderboardKey, momentumSeasonKey, riskScoreKey } from '../utils/cache.keys.js';
import { logger } from '../utils/logger.util.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Meta payload for markCacheValid — mirrors the CacheMetadata columns. */
export interface CacheMeta {
  sportId?: number | null;
  entityId?: string | null;
  season?: string | null;
  recordCount?: number | null;
  /** TTL in seconds — pass one of the SQLITE_TTL constants. */
  ttl: number;
}

/** Result of isCacheStale — whether the entry exists but is past its freshness window. */
export interface CacheStaleness {
  isStale: boolean;
  /** When the entry went stale (its expiry time, or its invalidation time for
   *  explicitly invalidated rows). Null when there is nothing stale. */
  staleSince: Date | null;
}

/** Summary of every CacheMetadata entry — for monitoring/debug routes. */
export interface CacheStats {
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
  /** Count of entries per dataType. */
  byDataType: Record<string, number>;
  oldestEntry: CacheMetadata | null;
}

// ---------------------------------------------------------------------------
// Step 4.1 — Core registry functions
// ---------------------------------------------------------------------------

/**
 * True when a fresh CacheMetadata record exists for the key:
 *   cacheKey = key AND isValid = true AND expiresAt > now
 * False when missing, invalid, or expired.
 */
export async function isCacheValid(cacheKey: string): Promise<boolean> {
  const entry = await prisma.cacheMetadata.findUnique({ where: { cacheKey } });
  return entry != null && entry.isValid && entry.expiresAt.getTime() > Date.now();
}

/**
 * More nuanced than isCacheValid — true when data exists but is past its
 * freshness window (expired OR explicitly invalidated). Used by the
 * stale-while-revalidate pattern: serve the old data immediately and refresh
 * in the background.
 */
export async function isCacheStale(cacheKey: string): Promise<CacheStaleness> {
  const entry = await prisma.cacheMetadata.findUnique({ where: { cacheKey } });
  if (!entry) return { isStale: false, staleSince: null };
  const isFresh = entry.isValid && entry.expiresAt.getTime() > Date.now();
  if (isFresh) return { isStale: false, staleSince: null };
  return {
    isStale: true,
    staleSince: entry.expiresAt.getTime() <= Date.now() ? entry.expiresAt : entry.updatedAt,
  };
}

/**
 * Creates or refreshes the CacheMetadata record for a key:
 *   cachedAt → now, expiresAt → now + ttl, isValid → true, recordCount → meta.
 * Upserts so a re-computation extends the expiry instead of erroring on the
 * unique cacheKey. Also clears lastError — the data is valid again.
 */
export async function markCacheValid(
  cacheKey: string,
  dataType: CacheDataType,
  meta: CacheMeta
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + meta.ttl * 1000);
  const payload = {
    dataType,
    sportId: meta.sportId ?? null,
    entityId: meta.entityId ?? null,
    season: meta.season ?? null,
    cachedAt: now,
    expiresAt,
    recordCount: meta.recordCount ?? null,
    isValid: true,
    lastError: null,
  };

  await prisma.cacheMetadata.upsert({
    where: { cacheKey },
    create: { cacheKey, ...payload },
    update: payload,
  });
  logger.debug({ cacheKey, dataType, expiresAt: expiresAt.toISOString() }, 'sqlite cache marked valid');
}

/**
 * Marks one or more keys invalid (isValid = false) so the next freshness check
 * forces a recomputation. Does NOT delete the underlying data — only the
 * registry flag. Returns the number of entries invalidated.
 */
export async function markCacheInvalid(cacheKey: string | string[]): Promise<number> {
  const keys = Array.isArray(cacheKey) ? cacheKey : [cacheKey];
  if (keys.length === 0) return 0;
  const result = await prisma.cacheMetadata.updateMany({
    where: { cacheKey: { in: keys } },
    data: { isValid: false },
  });
  if (result.count > 0) logger.debug({ keys, count: result.count }, 'sqlite cache marked invalid');
  return result.count;
}

/** Full CacheMetadata record for a key, or null — for debug and monitoring routes. */
export async function getCacheInfo(cacheKey: string): Promise<CacheMetadata | null> {
  return prisma.cacheMetadata.findUnique({ where: { cacheKey } });
}

/**
 * Marks every entry whose cacheKey starts with `prefix` invalid — the key-
 * family equivalent of markCacheInvalid. Used by the invalidation system for
 * keys whose family is known but exact members aren't (e.g. every leaderboard
 * row for a sport, which may carry different decisionType/gameType segments).
 */
export async function markCacheInvalidByPrefix(prefix: string): Promise<number> {
  const result = await prisma.cacheMetadata.updateMany({
    where: { cacheKey: { startsWith: prefix } },
    data: { isValid: false },
  });
  if (result.count > 0) {
    logger.debug({ prefix, count: result.count }, 'sqlite cache marked invalid by prefix');
  }
  return result.count;
}

/**
 * Marks every entry for a sportId invalid, optionally restricted to a set of
 * dataTypes. The fetch layer records sportId on its CacheMetadata rows, so a
 * sport-scoped invalidation can target exactly what a data sync touched.
 */
export async function markCacheInvalidBySport(
  sportId: number,
  dataTypes?: CacheDataType[]
): Promise<number> {
  const result = await prisma.cacheMetadata.updateMany({
    where: {
      sportId,
      ...(dataTypes && dataTypes.length > 0 ? { dataType: { in: dataTypes } } : {}),
    },
    data: { isValid: false },
  });
  if (result.count > 0) {
    logger.debug({ sportId, count: result.count }, 'sqlite cache marked invalid by sport');
  }
  return result.count;
}

/**
 * Marks every entry of one dataType invalid, optionally narrowed to a sportId
 * — used by the monitoring route's "invalidate by type" option
 * (DELETE /api/cache/invalidate { type } or { type, sport }).
 */
export async function markCacheInvalidByDataType(
  dataType: string,
  sportId?: number
): Promise<number> {
  const result = await prisma.cacheMetadata.updateMany({
    where: {
      dataType,
      ...(sportId !== undefined ? { sportId } : {}),
    },
    data: { isValid: false },
  });
  if (result.count > 0) {
    logger.debug({ dataType, sportId: sportId ?? null, count: result.count }, 'sqlite cache marked invalid by data type');
  }
  return result.count;
}

/** Marks every CacheMetadata entry invalid — the nuclear option. */
export async function markAllCacheInvalid(): Promise<number> {
  const result = await prisma.cacheMetadata.updateMany({ data: { isValid: false } });
  logger.info({ count: result.count }, 'all sqlite cache entries marked invalid');
  return result.count;
}

/** All entries past their expiry (optional dataType filter) — used by the cleanup job. */
export async function getExpiredCaches(dataType?: CacheDataType): Promise<CacheMetadata[]> {
  return prisma.cacheMetadata.findMany({
    where: {
      expiresAt: { lte: new Date() },
      ...(dataType ? { dataType } : {}),
    },
    orderBy: { expiresAt: 'asc' },
  });
}

/** Summary of the whole registry: totals, validity split, per-type breakdown, oldest entry. */
export async function getCacheStats(): Promise<CacheStats> {
  const now = new Date();
  const [totalEntries, validEntries, expiredEntries, byDataType, oldestEntry] = await Promise.all([
    prisma.cacheMetadata.count(),
    prisma.cacheMetadata.count({ where: { isValid: true, expiresAt: { gt: now } } }),
    prisma.cacheMetadata.count({ where: { expiresAt: { lte: now } } }),
    prisma.cacheMetadata.groupBy({ by: ['dataType'], _count: { _all: true } }),
    prisma.cacheMetadata.findFirst({ orderBy: { cachedAt: 'asc' } }),
  ]);

  const breakdown: Record<string, number> = {};
  for (const row of byDataType) breakdown[row.dataType] = row._count._all;

  return { totalEntries, validEntries, expiredEntries, byDataType: breakdown, oldestEntry };
}

// ---------------------------------------------------------------------------
// Step 4.2 — Specific cache helpers
// ---------------------------------------------------------------------------

/** Resolves a sport abbreviation (API uses 'NBA', the Sports table stores 'nba'). */
export async function resolveSportId(sport: string): Promise<number | null> {
  const row = await prisma.sports.findUnique({
    where: { abbreviation: sport.toLowerCase() },
    select: { id: true },
  });
  return row?.id ?? null;
}

// -- Risk score cache --------------------------------------------------------

/** True when a fresh CacheMetadata entry exists for "risk:{playerId}". */
export async function isRiskScoreFresh(playerId: number): Promise<boolean> {
  return isCacheValid(riskScoreKey(playerId));
}

/**
 * Upserts the "risk:{playerId}" freshness entry with a 6 hour TTL.
 * Actual risk data stays in the InjuryRiskScores table — this only tracks
 * that a computation is up to date. The player's sportId is attached
 * (best-effort) so later sport-scoped invalidation can find the entry.
 */
export async function markRiskScoreComputed(playerId: number): Promise<void> {
  const player = await prisma.players.findUnique({
    where: { id: playerId },
    select: { sportId: true },
  });
  await markCacheValid(riskScoreKey(playerId), CacheDataType.RISK_SCORES, {
    entityId: String(playerId),
    sportId: player?.sportId ?? null,
    ttl: SQLITE_TTL.RISK_SCORES,
  });
}

// -- Coach leaderboard cache -------------------------------------------------

/** True when a fresh entry exists for "leaderboard:{sport}:{season}:{decisionType}". */
export async function isLeaderboardFresh(
  sport: string,
  season: string,
  decisionType: string
): Promise<boolean> {
  return isCacheValid(leaderboardKey(sport, season, decisionType));
}

/** Upserts the leaderboard freshness entry with a 24 hour TTL. */
export async function markLeaderboardComputed(
  sport: string,
  season: string,
  decisionType: string
): Promise<void> {
  await markCacheValid(leaderboardKey(sport, season, decisionType), CacheDataType.COACH_LEADERBOARD, {
    sportId: await resolveSportId(sport),
    season,
    ttl: SQLITE_TTL.COACH_LEADERBOARD,
  });
}

// -- Momentum analysis cache -------------------------------------------------

/** True when a fresh entry exists for "momentum:season:{sport}:{season}". */
export async function isMomentumFresh(sport: string, season: string): Promise<boolean> {
  return isCacheValid(momentumSeasonKey(sport, season));
}

/** Upserts the season momentum freshness entry with a 24 hour TTL. */
export async function markMomentumComputed(sport: string, season: string): Promise<void> {
  await markCacheValid(momentumSeasonKey(sport, season), CacheDataType.MOMENTUM_ANALYSIS, {
    sportId: await resolveSportId(sport),
    season,
    ttl: SQLITE_TTL.MOMENTUM_ANALYSIS,
  });
}

// -- Story cache -------------------------------------------------------------

/**
 * True when a fresh StoryLogs row exists for the key (expiresAt still ahead).
 * Story text lives in the StoryLogs table with its own expiry column, so no
 * separate CacheMetadata entry is needed — check the table directly.
 */
export async function isStoryFresh(storyKey: string): Promise<boolean> {
  const row = await prisma.storyLogs.findUnique({ where: { storyKey } });
  return row != null && row.expiresAt.getTime() > Date.now();
}
