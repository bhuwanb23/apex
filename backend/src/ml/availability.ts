/**
 * ML service availability flag (Phase 6, Step 9).
 *
 * Module-scope state, updated by the health_check job every 15 minutes.
 * Any service or route can import `mlServiceAvailable` and short-circuit
 * BEFORE calling Python — so the API stays fast (serves cached/DB data)
 * while the ML service is down, instead of burning a timeout per request.
 *
 * Boot semantics: until the first health check completes, `mlServiceAvailable`
 * is optimistic (true) — a job that starts in that window still probes Python
 * and relies on the per-call MLServiceUnavailableError handling. After the
 * first check the flag reflects the last probe exactly.
 */
export interface MLServiceStatus {
  available: boolean;
  lastCheckedAt: Date | null;
  /** Consecutive unhealthy probes (reset to 0 on the next healthy probe). */
  consecutiveFailures: number;
}

const status: MLServiceStatus = {
  available: false,
  lastCheckedAt: null,
  consecutiveFailures: 0,
};

/** Last probe result as raw state (routes use this — honest before first check). */
export function getMLServiceStatus(): Readonly<MLServiceStatus> {
  return { ...status };
}

/**
 * Optimistic gate for callers deciding whether to attempt a Python call:
 * true until the first health check actually reports Python down.
 */
export function isMLServiceAvailable(): boolean {
  return status.lastCheckedAt === null ? true : status.available;
}



/**
 * Records one health-check probe (called by the health_check job).
 * Resets the failure streak on success; increments it on failure.
 */
export function recordMLHealthCheck(available: boolean, checkedAt = new Date()): void {
  status.available = available;
  status.lastCheckedAt = checkedAt;
  status.consecutiveFailures = available ? 0 : status.consecutiveFailures + 1;
}
