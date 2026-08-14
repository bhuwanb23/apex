/**
 * Backend-first data hook (integration plan).
 *
 * Every screen calls the backend; when a section returns no data (empty list,
 * insufficient_data) or the request fails, the screen falls back to the
 * curated mock data and tags it "demo data". The plan's rule: the app never
 * computes anything itself — it only displays what the backend gives it, and
 * falls back gracefully when the backend is empty.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type DataSource = 'live' | 'demo';

export interface ApiDataState<T> {
  data: T;
  source: DataSource;
  loading: boolean;
  /** Last error message, if any. */
  error: string | null;
  refetch: () => void;
}

/** True when a backend result is "empty" for the purposes of fallback. */
function isEmpty(result: unknown): boolean {
  if (result == null) return true;
  if (Array.isArray(result)) return result.length === 0;
  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    // Objects that carry a list — treat missing/empty lists as empty.
    for (const key of ['coaches', 'alerts', 'players', 'games', 'sports', 'teams', 'history', 'timeline', 'decisions']) {
      if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length === 0) return true;
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
export function useApiData<T>(
  fetcher: () => Promise<T | null>,
  fallback: T,
  deps: unknown[] = []
): ApiDataState<T> {
  const [data, setData] = useState<T>(fallback);
  const [source, setSource] = useState<DataSource>('demo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (result == null || isEmpty(result)) {
        setData(fallback);
        setSource('demo');
      } else {
        setData(result);
        setSource('live');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
      setData(fallback);
      setSource('demo');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
  }, [run]);

  return { data, source, loading, error, refetch: run };
}
