/**
 * Phase 8 Step 8 — ML call logging (8.1–8.4).
 *
 * Every call to the Python ML service is instrumented here (the ML client
 * wraps each HTTP attempt with instrumentMLCall):
 *
 *   Step 8.1 — request log (debug):    mlEndpoint, payloadSize, requestId
 *   Step 8.2 — response log (debug)    mlEndpoint, responseTimeMs,
 *             success / warn handled   responseSize, modelUsed, requestId
 *             error / error unavailable  + errorType, errorMessage,
 *                                      fallbackUsed, stack (dev only)
 *   Step 8.3 — performance tracking:   rolling window of the last 100 response
 *                                      times per endpoint → avg / P95 /
 *                                      slowest, exposed via GET /api/jobs/ml-health
 *   Step 8.4 — timeout handling:       warn on each timeout; after 3
 *                                      CONSECUTIVE timeouts the endpoint is
 *                                      marked "stuck" (error log + listed in
 *                                      performance.stuckEndpoints) — degraded,
 *                                      not fully down.
 *
 * requestId comes from the AsyncLocalStorage request context (Step 7.4), so
 * ML logs for a call made while handling an HTTP request carry the same UUID
 * as the request/response logs.
 */
import { env } from '../config/env.js';
import { mlLogger as logger } from '../config/logger.js';
import { getElapsedMs, getRequestId } from '../utils/request.context.js';

/** Step 8.3 — rolling window size per endpoint. */
const MAX_SAMPLES_PER_ENDPOINT = 100;
/** Step 8.4 — consecutive timeouts before an endpoint is "stuck". */
const STUCK_TIMEOUT_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Step 8.3 — performance tracking
// ---------------------------------------------------------------------------

interface EndpointTrack {
  /** Rolling response times (ms) — capped at MAX_SAMPLES_PER_ENDPOINT. */
  samples: number[];
  /** Total timeouts ever for this endpoint. */
  timeouts: number;
  /** Consecutive timeouts (reset to 0 on any successful call). */
  consecutiveTimeouts: number;
}

const tracks = new Map<string, EndpointTrack>();

function track(endpoint: string): EndpointTrack {
  let t = tracks.get(endpoint);
  if (!t) {
    t = { samples: [], timeouts: 0, consecutiveTimeouts: 0 };
    tracks.set(endpoint, t);
  }
  return t;
}

/** Records one successful ML call's response time. Breaks a timeout streak. */
export function recordMLTiming(endpoint: string, responseTimeMs: number): void {
  const t = track(endpoint);
  t.samples.push(responseTimeMs);
  if (t.samples.length > MAX_SAMPLES_PER_ENDPOINT) t.samples.shift();
  t.consecutiveTimeouts = 0;
}

/** Step 8.4 — records a timeout: warn log + streak counter + stuck detection. */
export function recordMLTimeout(endpoint: string, durationMs: number): void {
  const t = track(endpoint);
  t.timeouts += 1;
  t.consecutiveTimeouts += 1;
  logger.warn(
    { mlEndpoint: endpoint, durationMs, consecutive: t.consecutiveTimeouts },
    'ML call timed out'
  );
  if (t.consecutiveTimeouts >= STUCK_TIMEOUT_THRESHOLD) {
    logger.error(
      { mlEndpoint: endpoint, consecutive: t.consecutiveTimeouts },
      'ML endpoint appears stuck'
    );
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return sorted[idx] ?? sorted[sorted.length - 1] ?? 0;
}

export interface MLEndpointStats {
  count: number;
  avgResponseMs: number;
  p95ResponseMs: number;
  slowestMs: number;
  timeouts: number;
}

export interface MLPerformance {
  /** Per-endpoint stats (response times only; timeouts counted separately). */
  endpoints: Record<string, MLEndpointStats>;
  /** Endpoints with 3+ consecutive timeouts — degraded, not down. */
  stuckEndpoints: string[];
  totals: {
    calls: number;
    avgResponseMs: number;
    p95ResponseMs: number;
    slowestMs: number;
    timeouts: number;
  };
}

/** Step 8.3 — rolling stats (avg / P95 / slowest per endpoint) for ml-health. */
export function getMLPerformance(): MLPerformance {
  const endpoints: Record<string, MLEndpointStats> = {};
  const allSamples: number[] = [];
  let totalTimeouts = 0;
  for (const [name, t] of tracks) {
    const sorted = [...t.samples].sort((a, b) => a - b);
    endpoints[name] = {
      count: t.samples.length,
      avgResponseMs:
        t.samples.length > 0
          ? Math.round((t.samples.reduce((s, v) => s + v, 0) / t.samples.length) * 100) / 100
          : 0,
      p95ResponseMs: percentile(sorted, 0.95),
      slowestMs: t.samples.length > 0 ? Math.max(...t.samples) : 0,
      timeouts: t.timeouts,
    };
    totalTimeouts += t.timeouts;
    allSamples.push(...t.samples);
  }
  const sortedAll = [...allSamples].sort((a, b) => a - b);
  const stuckEndpoints = [...tracks.entries()]
    .filter(([, t]) => t.consecutiveTimeouts >= STUCK_TIMEOUT_THRESHOLD)
    .map(([name]) => name);
  return {
    endpoints,
    stuckEndpoints,
    totals: {
      calls: allSamples.length,
      avgResponseMs:
        allSamples.length > 0
          ? Math.round((allSamples.reduce((s, v) => s + v, 0) / allSamples.length) * 100) / 100
          : 0,
      p95ResponseMs: percentile(sortedAll, 0.95),
      slowestMs: allSamples.length > 0 ? Math.max(...allSamples) : 0,
      timeouts: totalTimeouts,
    },
  };
}

// ---------------------------------------------------------------------------
// Error classification helpers
// ---------------------------------------------------------------------------

/** True when the error is an axios timeout (code ECONNABORTED / message). */
export function isTimeoutError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'ECONNABORTED') return true;
  return /timeout/i.test(err instanceof Error ? err.message : String(err));
}

/** Human readable error type for the failure log (Step 8.2). */
export function classifyMLErrorType(err: unknown): string {
  if (isTimeoutError(err)) return 'timeout';
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string') {
    if (code === 'ECONNREFUSED') return 'connection_refused';
    if (code.startsWith('ERR_') || code.startsWith('E')) return code;
  }
  const response = (err as { response?: { status?: unknown } } | null)?.response;
  if (response?.status !== undefined) return `http_${String(response.status)}`;
  if (err instanceof Error) return err.name;
  return 'unknown';
}

/**
 * Default failure level: an axios-style network failure (no HTTP response)
 * means the service is unreachable → error; a response with an error status
 * is a handled ML error → warn.
 */
function defaultErrorLevel(err: unknown): 'warn' | 'error' {
  const anyErr = err as { response?: unknown; code?: unknown };
  if (anyErr.response === undefined && anyErr.code !== undefined) return 'error';
  return 'warn';
}

// ---------------------------------------------------------------------------
// Step 8.1/8.2 — instrumented call
// ---------------------------------------------------------------------------

/** Best-effort model name from an ML response (root or one level deep). */
function extractModelUsed(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const root = data as Record<string, unknown>;
  const find = (obj: Record<string, unknown>): string | undefined => {
    for (const [key, value] of Object.entries(obj)) {
      if (/model/i.test(key) && typeof value === 'string' && value.length > 0) return value;
    }
    return undefined;
  };
  const direct = find(root);
  if (direct !== undefined) return direct;
  for (const value of Object.values(root)) {
    if (typeof value === 'object' && value !== null) {
      const nested = find(value as Record<string, unknown>);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

export interface InstrumentMLCallOptions {
  /** Overrides the default failure level classification (warn vs error). */
  onErrorLevel?: (err: unknown) => 'warn' | 'error';
  /** Optional sport context for the log line. */
  sport?: string;
}

/**
 * Wraps one Python HTTP attempt with Steps 8.1–8.4:
 *   - request log before the call (debug, with payloadSize + requestId)
 *   - success log after (debug, with responseTimeMs/responseSize/modelUsed)
 *   - timing recorded into the Step 8.3 rolling window
 *   - timeout → warn + streak counter (stuck detection after 3 in a row)
 *   - failure → warn (handled) or error (unavailable) log, then rethrow
 */
export async function instrumentMLCall<T>(
  endpoint: string,
  payload: unknown,
  fn: () => Promise<T>,
  options: InstrumentMLCallOptions = {}
): Promise<T> {
  const requestId = getRequestId();
  const payloadSize = payload !== undefined ? Buffer.byteLength(JSON.stringify(payload)) : 0;
  const startTime = process.hrtime.bigint();

  // Step 8.1 — request log.
  logger.debug(
    { mlEndpoint: endpoint, payloadSize, requestId: requestId ?? undefined, sport: options.sport },
    'ML call start'
  );

  try {
    const data = await fn();
    const responseTimeMs = getElapsedMs(startTime);
    recordMLTiming(endpoint, responseTimeMs);
    const responseSize = data !== undefined ? Buffer.byteLength(JSON.stringify(data)) : 0;
    // Step 8.2 — success log.
    logger.debug(
      {
        mlEndpoint: endpoint,
        responseTimeMs,
        responseSize,
        modelUsed: extractModelUsed(data),
        requestId: requestId ?? undefined,
        sport: options.sport,
      },
      'ML call ok'
    );
    return data;
  } catch (err) {
    const responseTimeMs = getElapsedMs(startTime);
    // Step 8.4 — timeout handling.
    if (isTimeoutError(err)) recordMLTimeout(endpoint, responseTimeMs);
    const level = options.onErrorLevel?.(err) ?? defaultErrorLevel(err);
    const errorType = classifyMLErrorType(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Step 8.2 — failure log (stack trace only in development).
    const line: Record<string, unknown> = {
      mlEndpoint: endpoint,
      errorType,
      errorMessage,
      responseTimeMs,
      fallbackUsed: false,
      requestId: requestId ?? undefined,
      sport: options.sport,
      ...(env.NODE_ENV === 'development' && err instanceof Error ? { stack: err.stack } : {}),
    };
    if (level === 'error') logger.error(line, 'ML call failed');
    else logger.warn(line, 'ML call failed');
    throw err;
  }
}
