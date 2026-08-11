import type { RequestHandler } from 'express';
import { cacheGet, cacheSet } from '../cache/memoryCache.js';
import { env } from '../config/env.js';

interface CachedResponse {
  status: number;
  body: unknown;
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
    res.status(cached.status).json(cached.body);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      cacheSet(key, { status: res.statusCode, body }, env.CACHE_TTL_SHORT);
    }
    return originalJson(body);
  }) as typeof res.json;

  next();
};
