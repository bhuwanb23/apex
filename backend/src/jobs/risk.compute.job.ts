/**
 * Risk compute job (Phase 6, Step 6 — 6.2).
 *
 * Refreshes injury risk scores for every active player. Uses the service's
 * freshness logic (6h TTL), so each run only recomputes players whose score
 * is stale — the daily stream of new game logs is what drives recomputation.
 * Runs with a bounded worker pool; per-player failures are isolated.
 */
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { getPlayerRisk } from '../services/injury.service.js';
import { logger } from '../utils/logger.util.js';
import type { JobDefinition } from './job.runner.js';
import { queueManager } from './queue.manager.js';

/** Player evaluation concurrency — bounded so we don't stampede the ML box. */
const CONCURRENCY = 8;

const riskComputeJob: JobDefinition = {
  name: 'risk_compute',
  schedule: env.JOB_CRON_RISK_COMPUTE, // every 6h — 1:00/7:00/13:00/19:00
  description: 'Recomputes stale injury risk scores for every active player',
  run: async () => {
    const sports = await prisma.sports.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const errors: string[] = [];
    const perSport: Record<string, unknown> = {};
    let recordsProcessed = 0;

    for (const sport of sports) {
      const players = await prisma.players.findMany({
        where: { sportId: sport.id, isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      if (players.length === 0) {
        perSport[sport.name] = { players: 0, skipped: 'no players synced' };
        continue;
      }

      let index = 0;
      let scored = 0;
      let insufficient = 0;

      const worker = async (): Promise<void> => {
        for (;;) {
          const player = players[index];
          index += 1;
          if (player === undefined) return;
          try {
            // No force flag: only recomputes when the stored score is stale.
            const profile = await getPlayerRisk(player.id);
            if (profile.riskScore != null) scored += 1;
            else insufficient += 1;
            recordsProcessed += 1;
          } catch (err) {
            errors.push(
              `${sport.name}:player${player.id}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      perSport[sport.name] = { players: players.length, scored, insufficient };
      logger.info(
        { sport: sport.name, players: players.length, scored, insufficient },
        'risk_compute: sport pass complete'
      );
    }

    return {
      status: errors.length === 0 ? 'completed' : 'failed',
      recordsProcessed,
      errors,
      summary: { perSport },
    };
  },
};

queueManager.register(riskComputeJob);
