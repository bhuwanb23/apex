/**
 * Data sync job (Phase 6, Step 5 — 6.1).
 *
 * Keeps every sport's data fresh in SQLite. Per the spec:
 *   - runs each active sport sequentially (never in parallel — avoids
 *     rate-limit issues with the underlying APIs)
 *   - skips a sport whose player_logs cache is < 6h old ("data is fresh")
 *   - each sport is error-isolated: one failure logs + records, the next
 *     sport still runs (partial completion, never a full stop)
 *   - returns detailed counts: teams / players / games / logs / decisions
 *
 * The per-stage freshness checks live in the sync coordinator (every fetch
 * is cache-aware via CacheMetadata), so re-syncs are cheap on top of the
 * coarse per-sport gate here.
 */
import { env } from '../config/env.js';
import { logger } from '../utils/logger.util.js';
import { prisma } from '../db/client.js';
import { syncRecentGames } from '../data/sync.coordinator.js';
import { invalidateSportCache } from '../services/cache.invalidation.js';
import type { JobDefinition } from './job.runner.js';
import { queueManager } from './queue.manager.js';

/** A sport counts as fresh when its latest player_logs fetch is < 6h old. */
const FRESHNESS_MS = 6 * 60 * 60 * 1000;

/** True when the sport's most recent player_logs sync happened recently. */
async function isSportDataFresh(sportId: number): Promise<boolean> {
  const latest = await prisma.cacheMetadata.findFirst({
    where: { dataType: 'player_logs', sportId },
    orderBy: { cachedAt: 'desc' },
  });
  return (
    latest != null && latest.isValid && Date.now() - latest.cachedAt.getTime() < FRESHNESS_MS
  );
}

const dataSyncJob: JobDefinition = {
  name: 'data_sync',
  schedule: env.JOB_CRON_DATA_SYNC, // every 6h — 0:00/6:00/12:00/18:00
  description: 'Incremental sync of recent games, play-by-play and game logs for every active sport',
  run: async () => {
    const sports = await prisma.sports.findMany({ where: { isActive: true } });
    const errors: string[] = [];
    const perSport: Record<string, unknown> = {};
    const totals = { teams: 0, players: 0, games: 0, logs: 0, decisions: 0 };
    let sportsProcessed = 0;
    let sportsSkippedAsFresh = 0;

    for (const sport of sports) {
      try {
        if (await isSportDataFresh(sport.id)) {
          sportsSkippedAsFresh += 1;
          perSport[sport.name] = { status: 'skipped_fresh' };
          logger.info({ sport: sport.name }, 'data_sync: sport data is fresh — skipping');
          continue;
        }

        const result = await syncRecentGames(sport.abbreviation, 7);
        sportsProcessed += 1;
        totals.teams += result.counts.teams;
        totals.players += result.counts.players;
        totals.games += result.counts.games;
        totals.logs += result.counts.gameLogs;
        totals.decisions += result.counts.decisions;
        perSport[sport.name] = { status: result.status, counts: result.counts };
        if (result.errors.length > 0) {
          errors.push(`${sport.name}: ${result.errors.join('; ')}`);
        }
        // Phase 7 Step 7.2 — the sync changed this sport's underlying data, so
        // every cached response derived from it (searches, team lists, alerts,
        // leaderboards, momentum) must be recomputed on the next request. Even
        // a partial sync is fresher than what the caches hold.
        await invalidateSportCache(sport.name);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${sport.name}: ${message}`);
        logger.warn(
          { sport: sport.name, error: message },
          'data_sync: sport sync failed — continuing with next sport'
        );
      }
    }

    const recordsProcessed =
      totals.teams + totals.players + totals.games + totals.logs + totals.decisions;
    // Partial = some sports succeeded but at least one failed.
    const status: 'completed' | 'partial' | 'failed' =
      errors.length === 0 ? 'completed' : sportsProcessed > 0 ? 'partial' : 'failed';

    return {
      status,
      recordsProcessed,
      errors,
      summary: {
        sportsProcessed,
        sportsSkippedAsFresh,
        totalTeamsSynced: totals.teams,
        totalPlayersSynced: totals.players,
        totalGamesSynced: totals.games,
        totalLogsSynced: totals.logs,
        totalDecisionsSynced: totals.decisions,
        perSport,
      },
    };
  },
};

queueManager.register(dataSyncJob);
