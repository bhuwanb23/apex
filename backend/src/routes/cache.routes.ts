/**
 * Cache monitoring routes (Phase 7, Step 9).
 *
 * HTTP endpoints to inspect and manage the cache — the demo story: judges can
 * see caching working live (stats, entries, headers) and clear entries for
 * testing. Mutating operations are protected by the shared X-Admin-Key check
 * (same protection as the job trigger route).
 */
import { Router } from 'express';
import { cacheDel, cacheDelPrefix } from '../cache/memoryCache.js';
import { prisma } from '../db/client.js';
import { assertAdminKey } from '../middleware/admin.middleware.js';
import { getCachePerformanceStats } from '../middleware/cache.middleware.js';
import { ApiError } from '../middleware/error.middleware.js';
import {
  invalidateAllCaches,
  invalidateLeaderboard,
  invalidateMomentumAnalysis,
  invalidateSportCache,
} from '../services/cache.invalidation.js';
import { warmUpCache } from '../services/cache.warmup.js';
import { getMemoryCacheStats } from '../services/memory.cache.service.js';
import { CacheDataType } from '../utils/cache.config.js';
import {
  getCacheStats,
  markCacheInvalid,
  markCacheInvalidByDataType,
  resolveSportId,
} from '../services/sqlite.cache.service.js';
import {
  cacheEntriesQuerySchema,
  cacheInvalidateBodySchema,
  createValidator,
} from '../middleware/validation.middleware.js';
import { sendSuccess } from '../utils/response.util.js';

export const cacheRouter = Router();

/**
 * @openapi
 * /api/cache/stats:
 *   get:
 *     summary: Cache statistics
 *     description: Memory cache stats, SQLite registry totals and average response times for hits vs misses.
 *     tags: [Cache]
 *     responses:
 *       200:
 *         description: Cache statistics
 */
cacheRouter.get('/stats', async (_req, res) => {
  const [memory, sqlite] = await Promise.all([getMemoryCacheStats(), getCacheStats()]);
  const performance = getCachePerformanceStats();
  sendSuccess(res, { memory, sqlite, performance });
});

/**
 * @openapi
 * /api/cache/entries:
 *   get:
 *     summary: List SQLite cache entries
 *     description: CacheMetadata rows with computed isExpired / age / ttlRemaining, filterable by dataType, sport and validity.
 *     tags: [Cache]
 *     parameters:
 *       - in: query
 *         name: dataType
 *         schema:
 *           type: string
 *         description: Filter by cache data type (risk_scores, coach_leaderboard, …)
 *       - in: query
 *         name: sport
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *       - in: query
 *         name: valid
 *         schema:
 *           type: string
 *           enum: [true, false]
 *     responses:
 *       200:
 *         description: Cache entries with computed fields
 */
cacheRouter.get(
  '/entries',
  createValidator(cacheEntriesQuerySchema, 'query'),
  async (req, res) => {
  const { dataType, sport, valid } = req.validatedQuery as {
    dataType?: string;
    sport?: string;
    valid?: 'true' | 'false';
  };
  const sportId = sport ? await resolveSportId(sport) : undefined;
  const rows = await prisma.cacheMetadata.findMany({
    where: {
      ...(dataType ? { dataType } : {}),
      ...(sportId != null ? { sportId } : {}),
      ...(valid ? { isValid: valid === 'true' } : {}),
    },
    orderBy: { cachedAt: 'desc' },
  });
  const now = Date.now();
  const entries = rows.map(r => ({
    cacheKey: r.cacheKey,
    dataType: r.dataType,
    sportId: r.sportId,
    entityId: r.entityId,
    season: r.season,
    cachedAt: r.cachedAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    isValid: r.isValid,
    recordCount: r.recordCount,
    isExpired: r.expiresAt.getTime() <= now,
    age: Math.max(0, Math.round((now - r.cachedAt.getTime()) / 1000)),
    ttlRemaining: Math.max(0, Math.round((r.expiresAt.getTime() - now) / 1000)),
  }));
  sendSuccess(res, { total: entries.length, entries });
  }
);

/**
 * @openapi
 * /api/cache/invalidate:
 *   delete:
 *     summary: Invalidate cache entries
 *     description: Manually invalidate cache entries — a single key, everything for a sport, a data type, or everything. Protected by X-Admin-Key.
 *     tags: [Cache]
 *     parameters:
 *       - in: header
 *         name: X-Admin-Key
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *                 description: Invalidate one cache key
 *               sport:
 *                 type: string
 *                 description: Invalidate everything for a sport
 *               type:
 *                 type: string
 *                 description: Invalidate all entries of a data type
 *               all:
 *                 type: boolean
 *                 description: Flush everything
 *     responses:
 *       200:
 *         description: Invalidated
 *       400:
 *         description: No invalidation option provided
 *       403:
 *         description: Missing or invalid X-Admin-Key
 */
cacheRouter.delete(
  '/invalidate',
  createValidator(cacheInvalidateBodySchema, 'body'),
  async (req, res) => {
  assertAdminKey(req);
  const { key, sport, type, all } = req.validatedBody as {
    key?: string;
    sport?: string;
    type?: string;
    all?: boolean;
  };

  if (all) {
    await invalidateAllCaches();
    sendSuccess(res, {
      invalidated: 'all',
      note: 'Memory cache flushed and every CacheMetadata entry marked invalid',
    });
    return;
  }
  if (key) {
    const memoryDeleted = cacheDel(key);
    const respDeleted = cacheDelPrefix(`resp:${key}`);
    const registryInvalidated = await markCacheInvalid(key);
    sendSuccess(res, { invalidated: 'key', key, memoryDeleted, respDeleted, registryInvalidated });
    return;
  }
  if (sport && type) {
    // Combined filter — e.g. { type: 'coach_leaderboard', sport: 'NFL' }.
    // The sport-keyed families reuse the full invalidation functions (memory +
    // registry, catching middleware rows that store no sportId); other types
    // fall back to a sportId-scoped registry pass.
    const sportId = await resolveSportId(sport);
    const registryInvalidated = await markCacheInvalidByDataType(type, sportId ?? undefined);
    if (type === CacheDataType.COACH_LEADERBOARD) {
      await invalidateLeaderboard(sport);
    } else if (type === CacheDataType.MOMENTUM_ANALYSIS) {
      await invalidateMomentumAnalysis(sport);
    }
    sendSuccess(res, { invalidated: 'type+sport', type, sport, registryInvalidated });
    return;
  }
  if (sport) {
    await invalidateSportCache(sport);
    sendSuccess(res, {
      invalidated: 'sport',
      sport,
      note: 'All caches for the sport invalidated',
    });
    return;
  }
  if (type) {
    const registryInvalidated = await markCacheInvalidByDataType(type);
    sendSuccess(res, { invalidated: 'type', type, registryInvalidated });
    return;
  }
  throw ApiError.badRequest('Provide one of: key, sport, type or all');
  }
);

/**
 * @openapi
 * /api/cache/warmup:
 *   get:
 *     summary: Trigger cache warmup
 *     description: Pre-populates common cache entries (sport configs, team lists, red-zone alerts, leaderboards) so the first user request is fast.
 *     tags: [Cache]
 *     responses:
 *       200:
 *         description: Warmup result with per-category counts
 */
cacheRouter.get('/warmup', async (_req, res) => {
  const result = await warmUpCache();
  sendSuccess(res, result);
});
