/**
 * Backend connectivity (integration plan: "Before Any Screen Loads").
 *
 * On startup the app pings GET /api/health to learn whether the backend and
 * the Python ML service are reachable. Three states:
 *   online  → show fresh data, no banner
 *   slow    → show cached/demo data + "Loading latest data" banner
 *   offline → show cached/demo data + "You are offline" banner, retry every 30s
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { api, ApiError, type HealthResponse } from '@/lib/api';

export type BackendStatus = 'online' | 'slow' | 'offline';

export interface BackendHealth {
  status: BackendStatus;
  checkedAt: number;
  /** Time (ms) the last health ping took. */
  latencyMs: number | null;
  health: HealthResponse | null;
  /** True while a health ping is in flight. */
  checking: boolean;
  /** Re-run the health check immediately. */
  refresh: () => void;
}

const BackendContext = createContext<BackendHealth | undefined>(undefined);

const RETRY_MS = 30_000;
const SLOW_THRESHOLD_MS = 1_500;

export function BackendProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BackendHealth>({
    status: 'offline',
    checkedAt: 0,
    latencyMs: null,
    health: null,
    checking: true,
    refresh: () => {},
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    setState(prev => ({ ...prev, checking: true }));
    const started = Date.now();
    try {
      const health = await api.health();
      const latencyMs = Date.now() - started;
      setState(prev => ({
        ...prev,
        status: latencyMs > SLOW_THRESHOLD_MS ? 'slow' : 'online',
        checkedAt: Date.now(),
        latencyMs,
        health,
        checking: false,
      }));
    } catch (err) {
      const latencyMs = Date.now() - started;
      setState(prev => ({
        ...prev,
        status: 'offline',
        checkedAt: Date.now(),
        latencyMs,
        health: null,
        checking: false,
      }));
      // Keep retrying while unreachable.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void check(), RETRY_MS);
    }
  }, []);

  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void check();
  }, [check]);

  // Ping once on mount.
  useEffect(() => {
    void check();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [check]);

  const value = useMemo<BackendHealth>(
    () => ({ ...state, refresh }),
    [state, refresh]
  );

  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}

export function useBackend(): BackendHealth {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error('useBackend must be used within BackendProvider');
  return ctx;
}

export { ApiError };
