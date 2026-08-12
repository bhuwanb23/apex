import type { RequestHandler } from 'express';
import { cacheDel, cacheGet, cacheSet } from '../cache/memoryCache.js';
import { env } from '../config/env.js';

interface CachedResponse {
  status: number;
  body: unknown;
}

/**
 * A response is "degraded" when its payload carries a `warning` — services add
 * one (e.g. "ML service unavailable — showing last computed score…") when they
 * fall back to cached/stale data because the Python ML service was unreachable.
 *
 * Degraded responses must never be cached: they are temporary fallbacks that
 * should be recomputed as soon as the ML service recovers. Caching them would
 * serve stale warnings for the whole TTL even after Python comes back up.
 *
 * Tradeoff: while the ML service stays down, every request re-attempts the ML
 * connection instead of being served from cache. That is intentional — the ML
 * client fails fast on connection-refused (short retry backoff), and it keeps
 * the API self-healing: the moment Python is reachable again, fresh data flows
 * without waiting out the old TTL.
 */
function isDegraded(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const root = body as Record<string, unknown>;
  const hasWarning = (v: unknown): boolean =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).warning === 'string' &&
    ((v as Record<string, unknown>).warning as string).length > 0;
  return hasWarning(root) || hasWarning(root.data);
}

/**
 * Cache-first middleware for GET requests.
 * Returns the cached JSON response when fresh; otherwise lets the request
 * through and stores the JSON response before sending it.
 * Uses the request URL as the cache key.
 */
export const cacheMiddleware: RequestHandler = (req, res, next) => {
  if (req.method !== 'GET' || req.originalUrl.startsWith('/api/health')) {
    // Skip non-GET requests and health checks (must always be fresh)
    next();
    return;
  }

  const key = `http:${req.originalUrl}`;
  const cached = cacheGet<CachedResponse>(key);
  if (cached) {
    // Evict stale degraded entries (e.g. cached while the ML service was down)
    // so the next request recomputes against the live service instead of
    // serving a permanent warning.
    if (isDegraded(cached.body)) {
      cacheDel(key);
    } else {
      res.status(cached.status).json(cached.body);
      return;
    }
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 400 && !isDegraded(body)) {
      cacheSet(key, { status: res.statusCode, body }, env.CACHE_TTL_SHORT);
    }
    return originalJson(body);
  }) as typeof res.json;

  next();
};
