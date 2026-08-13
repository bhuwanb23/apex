/**
 * Phase 8 Step 4 — specific fallback handlers (8.1 Level 2: degraded services).
 *
 * When a dependency (Python ML service, sports API, SQLite) is unavailable the
 * app must still return something useful instead of a 5xx. These handlers
 * serve the last known good data from the DB / memory cache and attach
 * metadata so the client knows it is looking at stale data:
 *
 *   _cached     → true (this response came from a fallback, not a live compute)
 *   _cachedAt   → ISO timestamp of when the underlying data was computed
 *   _staleSince → how many hours ago the data was computed (rounded)
 *   warning     → plain English explanation (NOT `_warning` — the cache
 *                 middleware's isDegraded() checks the `warning` field, so a
 *                 degraded response must carry it to avoid being cached)
 *
 * NOTE on field naming: the Phase 8 doc writes `_warning`, but the cache
 * middleware (Phase 7 Step 6) treats any response carrying a `warning` field
 * as degraded and never caches it. Keeping `warning` (no underscore) preserves
 * that behavior; the `_`-prefixed fields match the doc's convention for
 * internal metadata.
 *
 * The ML fallback (Step 4.1) is the most important: when Python is down the
 * app serves the last computed risk score / leaderboard / momentum analysis
 * from SQLite instead of erroring.
 */
import { cacheGet } from '../cache/memoryCache.js';
import { prisma } from '../db/client.js';
import { DatabaseError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.util.js';

// ---------------------------------------------------------------------------
// Shared fallback metadata
// ---------------------------------------------------------------------------

export const ML_FALLBACK_WARNING =
  'ML service currently unavailable. Showing data from last successful computation.';

export interface FallbackMeta {
  _cached: true;
  _cachedAt: string | null;
  _staleSince: number | null;
  warning: string;
}

/** Builds the standardized fallback metadata from a computedAt timestamp. */
export function buildFallbackMeta(
  computedAt: Date | string | null | undefined,
  warning: string = ML_FALLBACK_WARNING
): FallbackMeta {
  const at = computedAt == null ? null : new Date(computedAt);
  const staleSince = at ? Math.max(0, Math.round((Date.now() - at.getTime()) / 3_600_000)) : null;
  return {
    _cached: true,
    _cachedAt: at ? at.toISOString() : null,
    _staleSince: staleSince,
    warning,
  };
}

// ---------------------------------------------------------------------------
// Step 4.1 — ML service fallback (serve last computed data from SQLite)
// ---------------------------------------------------------------------------

export type MLFallbackModule = 'injury' | 'decisions' | 'momentum';

/**
 * Loads the last computed data for a module when the Python ML service is
 * unreachable. Returns null when nothing was ever computed (no fallback to
 * serve — the caller decides how to degrade).
 *
 *   injury    → latest InjuryRiskScores row (isLatest = true) for a player
 *   decisions → most recent DecisionEVScores rows (leaderboard snapshot)
 *   momentum  → latest MomentumAnalysis row for a sport/season
 */
export async function handleMLFallback(
  module: MLFallbackModule,
  params: { playerId?: number; sportId?: number; season?: string }
): Promise<{ data: unknown; meta: FallbackMeta } | null> {
  switch (module) {
    case 'injury': {
      if (params.playerId == null) return null;
      const row = await prisma.injuryRiskScores.findFirst({
        where: { playerId: params.playerId, isLatest: true },
        orderBy: { computedAt: 'desc' },
      });
      if (!row) return null;
      return {
        data: row,
        meta: buildFallbackMeta(
          row.computedAt,
          'ML service unavailable — showing last known risk score'
        ),
      };
    }
    case 'decisions': {
      const rows = await prisma.decisionEVScores.findMany({
        where: params.sportId != null ? { sportId: params.sportId } : {},
        orderBy: { computedAt: 'desc' },
        take: 200,
      });
      if (rows.length === 0) return null;
      const latest = rows[0]?.computedAt;
      return {
        data: rows,
        meta: buildFallbackMeta(
          latest,
          'ML service unavailable — showing last computed coach leaderboard'
        ),
      };
    }
    case 'momentum': {
      if (params.sportId == null) return null;
      const row = await prisma.momentumAnalysis.findFirst({
        where: { sportId: params.sportId, ...(params.season ? { season: params.season } : {}) },
        orderBy: { computedAt: 'desc' },
      });
      if (!row) return null;
      return {
        data: row,
        meta: buildFallbackMeta(
          row.computedAt,
          'ML service unavailable — showing last computed momentum analysis'
        ),
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Step 4.2 — External API fallback (serve last synced data from SQLite)
// ---------------------------------------------------------------------------

export type APIFallbackDataType = 'players' | 'games' | 'player_logs';

/**
 * Serves what we already synced into SQLite when a sports API (BallDontLie,
 * ESPN, …) is down. Returns null when there is nothing to serve.
 */
export async function handleAPIFallback(
  sport: string,
  dataType: APIFallbackDataType
): Promise<{ data: unknown; cachedAt: string | null; warning: string } | null> {
  const sportRow = await prisma.sports.findUnique({
    where: { abbreviation: sport.toLowerCase() },
    select: { id: true },
  });
  if (!sportRow) return null;

  let data: unknown;
  switch (dataType) {
    case 'players':
      data = await prisma.players.findMany({
        where: { sportId: sportRow.id },
        orderBy: { lastName: 'asc' },
        take: 500,
      });
      break;
    case 'games':
      data = await prisma.games.findMany({
        where: { sportId: sportRow.id },
        orderBy: { date: 'desc' },
        take: 200,
      });
      break;
    case 'player_logs':
      data = await prisma.playerGameLogs.findMany({
        where: { player: { sportId: sportRow.id } },
        orderBy: { date: 'desc' },
        take: 1000,
      });
      break;
    default:
      throw new ValidationError(`Unsupported API fallback data type: ${String(dataType)}`);
  }

  if (Array.isArray(data) && data.length === 0) return null;

  // Best-effort: when the DB was synced, CacheMetadata has the sync time.
  const meta = await prisma.cacheMetadata.findFirst({
    where: { sportId: sportRow.id, dataType, isValid: true },
    orderBy: { cachedAt: 'desc' },
  });
  const cachedAt = meta?.cachedAt.toISOString() ?? null;
  return {
    data,
    cachedAt,
    warning: cachedAt
      ? `Live data unavailable. Showing last synced data from ${cachedAt}`
      : 'Live data unavailable. Showing last synced data.',
  };
}

// ---------------------------------------------------------------------------
// Step 4.3 — Database fallback (serve from memory cache when SQLite fails)
// ---------------------------------------------------------------------------

export interface DBFallbackResult {
  /** True when the request was served from the memory cache. */
  served: boolean;
  data?: unknown;
  warning?: string;
  /** Present only when nothing could be served — caller turns it into a 503. */
  error?: DatabaseError;
}

/**
 * When a SQLite query fails: serve the response from the in-memory cache if we
 * have one, otherwise produce a DatabaseError the caller can throw. The DB
 * error is logged at critical level either way — a failing DB needs attention.
 */
export function handleDBFallback(
  cacheKey: string,
  errorContext: Record<string, unknown>
): DBFallbackResult {
  const cached = cacheGet<unknown>(cacheKey);
  if (cached !== undefined) {
    logger.warn(
      { cacheKey, ...errorContext },
      'Database query failed — serving cached response (degraded)'
    );
    return {
      served: true,
      data: cached,
      warning: 'Database temporarily unavailable — showing cached data',
    };
  }
  const dbError = new DatabaseError('Database query failed', errorContext);
  logger.fatal(
    { cacheKey, err: dbError.getLogContext() },
    'Database query failed — no cache to serve'
  );
  return { served: false, error: dbError };
}
