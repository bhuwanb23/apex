import NodeCache from 'node-cache';
import { env } from '../config/env.js';

/**
 * In-memory cache (node-cache) for hot data like live odds, recent match results,
 * and API responses. Wrap with the typed helpers below instead of using the
 * raw instance everywhere.
 */

/** TTL tiers in seconds (from env): short 6h, medium 24h, long 7 days. */
export const CACHE_TTL = {
  SHORT: env.CACHE_TTL_SHORT,
  MEDIUM: env.CACHE_TTL_MEDIUM,
  LONG: env.CACHE_TTL_LONG,
} as const;

// Phase 7 Step 3 (7.1) setup: default 1h TTL, 2-min expiry sweep, references
// (not clones — callers must not mutate cached objects), auto-delete on expiry.
export const DEFAULT_CACHE_TTL_SECONDS = 3600;

export const memoryCache = new NodeCache({
  stdTTL: DEFAULT_CACHE_TTL_SECONDS,
  checkperiod: 120,
  useClones: false,
  deleteOnExpire: true,
});

export function cacheGet<T>(key: string): T | undefined {
  return memoryCache.get<T>(key);
}

export function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS
): boolean {
  return memoryCache.set(key, value, ttlSeconds);
}

export function cacheDel(key: string | string[]): number {
  return memoryCache.del(key);
}

/** Deletes every cached entry whose key starts with `prefix` (e.g. all analysis responses for a sport). */
export function cacheDelPrefix(prefix: string): number {
  const keys = memoryCache.keys().filter(k => k.startsWith(prefix));
  if (keys.length === 0) return 0;
  return memoryCache.del(keys);
}

export function cacheFlush(): void {
  memoryCache.flushAll();
}
