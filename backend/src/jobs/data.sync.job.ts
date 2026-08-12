/**
 * Data sync job (Phase 6, Step 5 — 6.1).
 *
 * Runs an incremental sync (last 7 days) for every active sport so the
 * platform never shows stale data. Each sport is error-isolated: one sport
 * failing logs its error and the rest of the sync continues.
 */
import { env } from '../config/env.js';
import { logger } from '../utils/logger.util.js';
import { prisma } from '../db/client.js';
import { syncRecentGames } from '../data/sync.coordinator.js';
import type { JobDefinition } from './job.runner.js';
import { queueManager } from './queue.manager.js';

/** Sums the sync coordinator's per-stage counts into one record total. */
function totalRecords(counts: {
  teams: number;
  coaches: number;
  players: number;
  games: number;
  gameLogs: number;
  playByPlay: number;
  decisions: number;
}): number {
  return (
    counts.teams +
    counts.coaches +
    counts.players +
    counts.games +
    counts.gameLogs +
    counts.playByPlay +
    counts.decisions
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
    let recordsProcessed = 0;

    for (const sport of sports) {
      try {
        const result = await syncRecentGames(sport.abbreviation, 7);
        const records = totalRecords(result.counts);
        recordsProcessed += records;
        perSport[sport.name] = {
          status: result.status,
          records,
          errors: result.errors,
        };
        if (result.errors.length > 0) {
          errors.push(`${sport.name}: ${result.errors.join('; ')}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${sport.name}: ${message}`);
        logger.warn({ sport: sport.name, error: message }, 'data_sync: sport sync failed — continuing');
      }
    }

    return {
      status: errors.length === 0 ? 'completed' : 'failed',
      recordsProcessed,
      errors,
      summary: { sports: sports.map(s => s.name), perSport },
    };
  },
};

queueManager.register(dataSyncJob);
