/**
 * Backend-first data hook (integration plan).
 *
 * Every screen calls the backend; when a section returns no data (empty list,
 * insufficient_data) or the request fails, the screen falls back to the
 * curated mock data and tags it "demo data". The plan's rule: the app never
 * computes anything itself — it only displays what the backend gives it, and
 * falls back gracefully when the backend is empty.
 *
 * Resilience (plan: "Data Freshness / What Happens When Things Go Wrong"):
 *   - a successful live payload is persisted to the device cache (when a
 *     cacheKey is supplied), so when the backend is unreachable the screen
 *     shows the data it loaded last time instead of mock data;
 *   - when the backend comes back online the hook re-runs automatically, so
 *     the fresh data replaces the cached/demo payload and the offline banner
 *     disappears.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { storage } from '@/lib/storage';
import { useBackend } from '@/context/backend';

export type DataSource = 'live' | 'demo';

export interface ApiDataState<T> {
  data: T;
  source: DataSource;
  loading: boolean;
  /** Last error message, if any. */
  error: string | null;
  /** Re-run the fetcher. Pass { recalculate: true } to force a fresh backend
   *  computation (bypasses the cache via ?recalculate=true). */
  refetch: (opts?: { recalculate?: boolean }) => void;
}

/** Extra options passed to fetchers on refetch. */
export interface FetchOptions {
  recalculate?: boolean;
}

/** True when a backend result is "empty" for the purposes of fallback. */
function isEmpty(result: unknown): boolean {
  if (result == null) return true;
  if (Array.isArray(result)) return result.length === 0;
  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    // Objects that carry aggregate stats (league counts, roster summary) are
    // meaningful even when their list is empty — e.g. an all-green league
    // returns real counts with zero alerts; falling back to demo would lie.
    if (obj['counts'] != null || obj['summary'] != null) return false;
    // Objects that carry lists — only treat them as empty when EVERY list
    // field is empty. A Game payload has a populated `timeline` plus an
    // unused empty `decisions` list; flagging it on any empty list would
    // replace every real game with the demo fallback.
    const listKeys = ['coaches', 'alerts', 'players', 'games', 'sports', 'teams', 'history', 'timeline', 'decisions'] as const;
    const presentLists = listKeys.filter(key => Array.isArray(obj[key]));
    if (presentLists.length > 0) {
      return presentLists.every(key => (obj[key] as unknown[]).length === 0);
    }
    return false;
  }
  return false;
}

/**
 * @param fetcher  Backend request; return null to force the demo fallback.
 * @param fallback Mock data used when the backend is empty or unreachable.
 * @param deps     Re-run when these change.
 */
/** Cache key prefix so device-cached payloads are namespaced. */
const CACHE_PREFIX = 'aqx.data.';

/** Loads a previously cached payload, or null when missing/unreadable. */
async function loadDeviceCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await storage.getItem(`${CACHE_PREFIX}${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * @param cacheKey  Optional stable key for the device cache — e.g.
 *   `league:nba`. When set, successful live payloads are persisted and used
 *   as the offline fallback instead of mock data.
 */
export function useApiData<T>(
  fetcher: (opts?: FetchOptions) => Promise<T | null>,
  fallback: T,
  deps: unknown[] = [],
  cacheKey?: string
): ApiDataState<T> {
  const [data, setData] = useState<T>(fallback);
  const [source, setSource] = useState<DataSource>('demo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Latest-value refs — synced in an effect (not during render) so the run
  // effect below always reads the freshest fetcher/fallback/cacheKey while
  // the memoized `run` keeps a stable identity across renders.
  const fetcherRef = useRef(fetcher);
  const fallbackRef = useRef(fallback);
  const cacheKeyRef = useRef(cacheKey);
  useEffect(() => {
    fetcherRef.current = fetcher;
    fallbackRef.current = fallback;
    cacheKeyRef.current = cacheKey;
  });

  /** Serves the last payload loaded from the device cache (if any). */
  const serveDeviceCache = useCallback(async (): Promise<boolean> => {
    const key = cacheKeyRef.current;
    if (!key) return false;
    const cached = await loadDeviceCache<T>(key);
    if (cached == null) return false;
    setData(cached);
    setSource('demo'); // not live — the connectivity banner explains why
    return true;
  }, []);

  const run = useCallback(
    async (opts?: FetchOptions) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetcherRef.current(opts);
        if (result == null || isEmpty(result)) {
          if (!(await serveDeviceCache())) {
            setData(fallbackRef.current);
            setSource('demo');
          }
        } else {
          setData(result);
          setSource('live');
          const key = cacheKeyRef.current;
          if (key) {
            storage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(result)).catch(() => {});
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed');
        if (!(await serveDeviceCache())) {
          setData(fallbackRef.current);
          setSource('demo');
        }
      } finally {
        setLoading(false);
      }
    },
    // The caller's deps are dynamic (not a literal) and the latest
    // fetcher/fallback/cacheKey live in refs — both rules are by design here.
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
    deps
  );

  useEffect(() => {
    void run();
  }, [run]);

  // Resilience: when the backend comes back online after being down/slow, the
  // hook re-runs so cached/demo data is replaced by fresh data automatically.
  const { status, checkedAt } = useBackend();
  const prev = useRef({ status, checkedAt });
  useEffect(() => {
    const recovered =
      prev.current.checkedAt > 0 && // skip the very first health check
      prev.current.status !== 'online' &&
      status === 'online';
    prev.current = { status, checkedAt };
    if (recovered) void run();
  }, [status, checkedAt, run]);

  return { data, source, loading, error, refetch: run };
}
