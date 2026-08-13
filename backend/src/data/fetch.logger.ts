/**
 * Phase 8 Step 9 — data fetch logging (9.1–9.4).
 *
 * Every external sports API call (BallDontLie, ESPN, MLB Stats) is logged by
 * the fetch pipeline (fetcher.manager.ts wires these in) and the sync
 * coordinator (sync.coordinator.ts):
 *
 *   9.1 Fetch start (debug)  — apiName, endpoint, params, cacheCheck,
 *                              cacheResult ('hit' | 'miss' | 'skipped')
 *   9.2 Fetch success (info) — apiName, endpoint, responseTimeMs,
 *                              recordCount, pageCount, cacheUpdated
 *   9.3 Fetch failure        — warn when retryable, error when permanent:
 *                              errorType (rate_limit/network/timeout/server),
 *                              statusCode, retryAttempt, retryIn, willRetry
 *   9.4 Sync operation (info) — start (sport, sections, triggeredBy), per
 *                              section completion (recordCount, duration,
 *                              upsertCount vs skipCount), and completion
 *                              (totalDuration, recordsProcessed, errors,
 *                              nextSyncAt)
 */
import { logger } from '../utils/logger.util.js';

export type FetchCacheResult = 'hit' | 'miss' | 'skipped';
export type FetchErrorType = 'rate_limit' | 'network' | 'timeout' | 'server' | 'unknown';

export interface FetchStartInfo {
  apiName: string;
  endpoint: string;
  params?: Record<string, unknown>;
  cacheCheck: boolean;
  cacheResult: FetchCacheResult;
}

/** Step 9.1 — logged before every external API call. */
export function logFetchStart(info: FetchStartInfo): void {
  logger.debug(
    {
      apiName: info.apiName,
      endpoint: info.endpoint,
      params: info.params ?? {},
      cacheCheck: info.cacheCheck,
      cacheResult: info.cacheResult,
    },
    'fetch start'
  );
}

export interface FetchSuccessInfo {
  apiName: string;
  endpoint: string;
  responseTimeMs: number;
  recordCount: number;
  pageCount?: number;
  cacheUpdated: boolean;
}

/** Step 9.2 — logged after a successful external API response. */
export function logFetchSuccess(info: FetchSuccessInfo): void {
  logger.info(
    {
      apiName: info.apiName,
      endpoint: info.endpoint,
      responseTimeMs: info.responseTimeMs,
      recordCount: info.recordCount,
      pageCount: info.pageCount ?? 1,
      cacheUpdated: info.cacheUpdated,
    },
    'fetch success'
  );
}

export interface FetchFailureInfo {
  apiName: string;
  endpoint: string;
  errorType: FetchErrorType;
  statusCode?: number;
  retryAttempt: number;
  retryIn?: number; // seconds until the next retry
  willRetry: boolean;
}

/** Maps a raw fetch error to the Step 9.3 errorType vocabulary. */
export function classifyFetchError(err: unknown): {
  type: FetchErrorType;
  statusCode?: number;
} {
  const anyErr = err as { code?: unknown; response?: { status?: unknown } } | null;
  if (anyErr?.response?.status !== undefined) {
    const status = Number(anyErr.response.status);
    if (status === 429) return { type: 'rate_limit', statusCode: status };
    if (status >= 500) return { type: 'server', statusCode: status };
    return { type: 'unknown', statusCode: status };
  }
  if (anyErr?.code === 'ECONNABORTED') return { type: 'timeout' };
  if (typeof anyErr?.code === 'string' && anyErr.code !== '') return { type: 'network' };
  return { type: 'unknown' };
}

/** Step 9.3 — logged when an external API call fails (warn = retryable). */
export function logFetchFailure(info: FetchFailureInfo): void {
  const line = {
    apiName: info.apiName,
    endpoint: info.endpoint,
    errorType: info.errorType,
    statusCode: info.statusCode,
    retryAttempt: info.retryAttempt,
    retryIn: info.retryIn,
    willRetry: info.willRetry,
  };
  if (info.willRetry) logger.warn(line, 'fetch failed — retrying');
  else logger.error(line, 'fetch failed permanently');
}

export interface SyncStartInfo {
  sport: string;
  sections: string[];
  triggeredBy: string;
}

/** Step 9.4a — logged at the start of a data sync. */
export function logSyncStart(info: SyncStartInfo): void {
  logger.info(
    {
      sport: info.sport,
      sections: info.sections,
      triggeredBy: info.triggeredBy,
    },
    'sync start'
  );
}

export interface SyncSectionInfo {
  section: string;
  recordCount: number;
  durationMs: number;
  /** Rows upserted (written) vs rows skipped as already-fresh/cached. */
  upsertCount: number;
  skipCount: number;
}

/** Step 9.4b — logged after each sync section completes. */
export function logSyncSection(info: SyncSectionInfo): void {
  logger.info(
    {
      section: info.section,
      recordCount: info.recordCount,
      durationMs: info.durationMs,
      upsertCount: info.upsertCount,
      skipCount: info.skipCount,
    },
    'sync section complete'
  );
}

export interface SyncCompleteInfo {
  sport: string;
  totalDurationMs: number;
  recordsProcessed: number;
  errors: number;
  nextSyncAt: string | null;
  status: string;
}

/** Step 9.4c — logged when a sync finishes. */
export function logSyncComplete(info: SyncCompleteInfo): void {
  logger.info(
    {
      sport: info.sport,
      totalDurationMs: info.totalDurationMs,
      recordsProcessed: info.recordsProcessed,
      errors: info.errors,
      nextSyncAt: info.nextSyncAt,
      status: info.status,
    },
    'sync complete'
  );
}
