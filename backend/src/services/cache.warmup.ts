/**
 * Cache warmup (Phase 7, Step 9.1).
 *
 * Pre-populates the common cache entries at boot so the first visitor gets a
 * fast response instead of a cold-start compute. Runs:
 *   - on server startup (always),
 *   - when triggered via GET /api/cache/warmup.
 *
 * Sequence per the doc:
 *   1. load all sport configs into the memory cache (service-level key —
 *      there is no per-sport config HTTP route to prime),
 *   2. load all team lists (self-request through /api/sports/{sport}/teams so
 *      the middleware caches the response — real requests then read it),
 *   3. fetch + cache current red-zone alerts for every active sport,
 *   4. fetch + cache current-season coach leaderboards for every active sport,
 *   5. log completion.
 *
 * Steps 2-4 issue internal HTTP requests to the app itself (same trick as the
 * middleware's background refresh): the response is discarded, but the cache
 * middleware stores it, so a later user request returns X-Cache-Status: HIT.
 * A failed prime is recorded and never fails the boot.
 */
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.util.js';
import { cacheSportConfig } from './memory.cache.service.js';

export interface WarmupResult {
  alreadyRunning: boolean;
  sportConfigs: number;
  teamLists: number;
  alertLists: number;
  leaderboards: number;
  failed: string[];
  durationMs: number;
}

/** True while a warmup is already running — concurrent triggers are no-ops. */
let warmupInFlight = false;

/** Self-request through a real route so the cache middleware stores the response. */
async function primeRoute(path: string, timeoutMs = 5000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${env.PORT}${path}`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Pre-populates common cache entries. Safe to call at boot and on demand. */
export async function warmUpCache(): Promise<WarmupResult> {
  const startedAt = Date.now();
  if (warmupInFlight) {
    logger.debug('cache warmup already running — skipping duplicate trigger');
    return {
      alreadyRunning: true,
      sportConfigs: 0,
      teamLists: 0,
      alertLists: 0,
      leaderboards: 0,
      failed: [],
      durationMs: 0,
    };
  }
  warmupInFlight = true;

  try {
    const sports = await prisma.sports.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    // 1. Sport configs → service-level memory key (sport:config:{sport}).
    let sportConfigs = 0;
    for (const sport of sports) {
      cacheSportConfig(sport.name, sport.config);
      sportConfigs += 1;
    }

    // 2-4. Team lists, red-zone alerts, coach leaderboards → via self-requests
    // so the middleware caches the actual response (X-Cache-Status: HIT later).
    // The alert/leaderboard routes varyBy their limit param, so they are primed
    // WITHOUT it — the controller's default (20/30) then matches the cache key
    // a no-param user request looks up.
    const failed: string[] = [];
    let teamLists = 0;
    let alertLists = 0;
    let leaderboards = 0;
    for (const sport of sports) {
      if (await primeRoute(`/api/sports/${sport.name}/teams`)) teamLists += 1;
      else failed.push(`teams:${sport.name}`);

      if (await primeRoute(`/api/injury/alerts/${sport.name}?zone=red`)) alertLists += 1;
      else failed.push(`alerts:${sport.name}`);

      if (await primeRoute(`/api/decisions/coaches/${sport.name}`)) leaderboards += 1;
      else failed.push(`leaderboards:${sport.name}`);
    }

    const durationMs = Date.now() - startedAt;
    const total = sportConfigs + teamLists + alertLists + leaderboards;
    logger.info(
      { total, sportConfigs, teamLists, alertLists, leaderboards, durationMs, failed: failed.length },
      'Cache warmed up'
    );
    return {
      alreadyRunning: false,
      sportConfigs,
      teamLists,
      alertLists,
      leaderboards,
      failed,
      durationMs,
    };
  } finally {
    warmupInFlight = false;
  }
}
