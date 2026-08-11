import NodeCache from 'node-cache'
import { env } from '../config/env.js'

/**
 * In-memory cache (node-cache) for hot data like live odds, recent match results,
 * and API responses. Wrap with the typed helpers below instead of using the
 * raw instance everywhere.
 */
export const memoryCache = new NodeCache({
  stdTTL: env.CACHE_TTL_SECONDS,
  checkperiod: Math.max(60, Math.floor(env.CACHE_TTL_SECONDS / 2)),
  useClones: false, // perf: store references, not deep clones
})

export function cacheGet<T>(key: string): T | undefined {
  return memoryCache.get<T>(key)
}

export function cacheSet<T>(key: string, value: T, ttlSeconds?: number): boolean {
  return memoryCache.set(key, value, ttlSeconds ?? env.CACHE_TTL_SECONDS)
}

export function cacheDel(key: string): number {
  return memoryCache.del(key)
}

export function cacheFlush(): void {
  memoryCache.flushAll()
}
