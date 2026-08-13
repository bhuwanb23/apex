/**
 * Phase 8 Step 10 — error tracking and reporting (10.1–10.2).
 *
 * In-memory running counts of errors — not just logging them individually.
 * The global error middleware feeds every classified error in, and the
 * health route exposes the summary.
 *
 *   Step 10.1 — counters per category, bucketed by hour:
 *     validationErrors / notFoundErrors / mlServiceErrors / externalAPIErrors
 *     / databaseErrors / unknownErrors. Counters reset when the hour rolls
 *     over. Rates are errors-per-minute (count / 60, averaged over the hour).
 *     When a category's rate crosses its threshold the FIRST time in a bucket
 *     a critical log fires (no spam — once per bucket).
 *
 *   Step 10.2 — GET /api/health/errors returns { period, counts, rates,
 *     recentErrors (last 5), status } where status is:
 *     healthy   → nothing near a threshold
 *     degraded  → a soft threshold crossed (validation / external / notFound /
 *                 unknown abuse-level rates)
 *     critical  → a hard threshold crossed (ML > 5/min, DB > 1/min — the
 *                 service is struggling)
 */
import { logger } from './logger.util.js';

export type ErrorCategory =
  | 'validationErrors'
  | 'notFoundErrors'
  | 'mlServiceErrors'
  | 'externalAPIErrors'
  | 'databaseErrors'
  | 'unknownErrors';

export const ERROR_CATEGORIES: ErrorCategory[] = [
  'validationErrors',
  'notFoundErrors',
  'mlServiceErrors',
  'externalAPIErrors',
  'databaseErrors',
  'unknownErrors',
];

/** Errors per minute that mark the bucket critical (plan: ml 5, db 1). */
const CRITICAL_THRESHOLDS: Record<ErrorCategory, number> = {
  validationErrors: Infinity, // abuse-level, degraded not critical
  notFoundErrors: Infinity,
  mlServiceErrors: 5,
  externalAPIErrors: Infinity,
  databaseErrors: 1,
  unknownErrors: Infinity,
};

/** Errors per minute that mark the bucket degraded (possible abuse/bug). */
const DEGRADED_THRESHOLDS: Record<ErrorCategory, number> = {
  validationErrors: 50,
  notFoundErrors: 50,
  mlServiceErrors: 2,
  externalAPIErrors: 10,
  databaseErrors: 0.5,
  unknownErrors: 5,
};

/** Most recent errors kept for the summary (recentErrors returns the last 5). */
const MAX_RECENT = 20;

interface RecentError {
  timestamp: string;
  category: ErrorCategory;
  message: string;
  errorCode?: string;
  statusCode?: number;
  url?: string;
}

interface CategoryTrack {
  count: number;
  criticalLogged: boolean;
}

const counts = new Map<ErrorCategory, CategoryTrack>(
  ERROR_CATEGORIES.map(c => [c, { count: 0, criticalLogged: false }])
);
const recentErrors: RecentError[] = [];

/** The hour bucket (epoch ms truncated to the hour) the counters belong to. */
let bucketHour = currentHour();

function currentHour(): number {
  return Math.floor(Date.now() / 3_600_000);
}

/** Resets all counters when the hour rolls over (Step 10.1). */
function refreshBucket(): void {
  const hour = currentHour();
  if (hour === bucketHour) return;
  bucketHour = hour;
  for (const track of counts.values()) {
    track.count = 0;
    track.criticalLogged = false;
  }
}

/**
 * Records one error into its category bucket. Called by the global error
 * middleware (and the 404 handler) with the classified category.
 */
export function trackError(
  category: ErrorCategory,
  details: { message?: string; errorCode?: string; statusCode?: number; url?: string } = {}
): void {
  refreshBucket();
  const track = counts.get(category);
  if (!track) return;
  track.count += 1;
  recentErrors.push({
    timestamp: new Date().toISOString(),
    category,
    message: details.message ?? 'Unknown error',
    errorCode: details.errorCode,
    statusCode: details.statusCode,
    url: details.url,
  });
  if (recentErrors.length > MAX_RECENT) recentErrors.shift();

  // Threshold check — errors-per-minute = count / 60 (averaged over the hour).
  const perMinute = track.count / 60;
  const critical = CRITICAL_THRESHOLDS[category];
  if (perMinute > critical && !track.criticalLogged) {
    track.criticalLogged = true;
    logger.critical(
      { category, errorsPerMinute: perMinute, threshold: critical },
      'Error rate threshold exceeded — critical'
    );
  }
}

/** Maps the AppError family to the Step 10.1 categories (used by the
 *  error middleware). Everything else falls into unknownErrors. */
export function categoryForError(err: {
  errorCode?: string;
  statusCode?: number;
  name?: string;
}): ErrorCategory {
  const code = err.errorCode ?? '';
  if (code === 'VALIDATION_ERROR') return 'validationErrors';
  if (code === 'NOT_FOUND' || code === 'ROUTE_NOT_FOUND') return 'notFoundErrors';
  if (code === 'ML_SERVICE_ERROR' || code === 'ML_SERVICE_UNAVAILABLE') return 'mlServiceErrors';
  if (code === 'EXTERNAL_API_ERROR') return 'externalAPIErrors';
  if (code === 'DATABASE_ERROR') return 'databaseErrors';
  // Legacy ApiError 4xx = bad client input → validation bucket.
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    return 'validationErrors';
  }
  return 'unknownErrors';
}

export type ErrorHealthStatus = 'healthy' | 'degraded' | 'critical';

export interface ErrorSummary {
  period: 'last 1 hour';
  counts: Record<ErrorCategory, number>;
  rates: { errorsPerMinute: Record<ErrorCategory, number> };
  recentErrors: RecentError[];
  status: ErrorHealthStatus;
}

/** Step 10.2 — the summary GET /api/health/errors returns. */
export function getErrorSummary(): ErrorSummary {
  refreshBucket();
  const countsOut = {} as Record<ErrorCategory, number>;
  const ratesOut = {} as Record<ErrorCategory, number>;
  let status: ErrorHealthStatus = 'healthy';
  for (const category of ERROR_CATEGORIES) {
    const track = counts.get(category)!;
    countsOut[category] = track.count;
    const perMinute = track.count / 60;
    ratesOut[category] = Math.round(perMinute * 1000) / 1000;
    if (perMinute > CRITICAL_THRESHOLDS[category]) {
      status = 'critical';
    } else if (status !== 'critical' && perMinute > DEGRADED_THRESHOLDS[category]) {
      status = 'degraded';
    }
  }
  return {
    period: 'last 1 hour',
    counts: countsOut,
    rates: { errorsPerMinute: ratesOut },
    // Last 5, newest first — the natural display order for a viewer.
    recentErrors: recentErrors.slice(-5).reverse(),
    status,
  };
}

/** Test hook — resets all counters (also fires on hour rollover naturally). */
export function resetErrorTracker(): void {
  for (const track of counts.values()) {
    track.count = 0;
    track.criticalLogged = false;
  }
  recentErrors.length = 0;
  bucketHour = currentHour();
}
