/**
 * Momentum compute job (Phase 6, Step 7 — 6.3).
 *
 * Refreshes the Cox-model momentum analysis for every active sport. The
 * service serves a stored analysis for 24h and recomputes when stale, so a
 * daily run keeps the analysis current without redundant computation.
 */
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { getMomentumAnalysis } from '../services/momentum.service.js';
import type { SportAbbreviation } from '../types/shared.types.js';
import { logger } from '../utils/logger.util.js';
import type { JobDefinition } from './job.runner.js';
import { queueManager } from './queue.manager.js';

const momentumJob: JobDefinition = {
  name: 'momentum',
  schedule: env.JOB_CRON_MOMENTUM, // once daily — 2:00 AM
  description: 'Refreshes the Cox momentum analysis for every active sport',
  run: async () => {
    const sports = await prisma.sports.findMany({
      where: { isActive: true },
      select: { name: true, season: true },
    });
    const errors: string[] = [];
    const perSport: Record<string, unknown> = {};
    let recordsProcessed = 0;

    for (const sport of sports) {
      try {
        const analysis = await getMomentumAnalysis(sport.name as SportAbbreviation, sport.season);
        perSport[sport.name] = {
          verdict: analysis.verdict.verdictLabel,
          gamesAnalyzed: analysis.context.gamesAnalyzed,
          playsAnalyzed: analysis.context.playsAnalyzed,
        };
        recordsProcessed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${sport.name}: ${message}`);
        logger.warn({ sport: sport.name, error: message }, 'momentum: sport analysis failed — continuing');
      }
    }

    return {
      status: errors.length === 0 ? 'completed' : 'failed',
      recordsProcessed,
      errors,
      summary: { perSport },
    };
  },
};

queueManager.register(momentumJob);
