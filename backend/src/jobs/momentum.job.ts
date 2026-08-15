/**
 * Momentum compute job (Phase 6, Step 7 — 6.3).
 *
 * Runs once daily and does two tasks:
 *   Task A — game timeline computation: momentum timelines for games played
 *            in the last 24 hours (written to MomentumGameData).
 *   Task B — season analysis update: rerun the Cox model on the full season
 *            for each active sport and refresh MomentumAnalysis, then
 *            invalidate cached momentum analysis responses so the next API
 *            call serves the fresh findings.
 *
 * Both tasks are error-isolated per doc Step 7.4: a game without play data is
 * skipped, a failed computation keeps any existing row, and a failed Cox fit
 * keeps the previous season analysis (it is still valid and useful).
 */
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { invalidateMomentumAnalysis } from '../services/cache.invalidation.js';
import {
  computeAndStoreGameTimeline,
  computeAndStoreSeasonAnalysis,
} from '../services/momentum.service.js';
import type { SportAbbreviation } from '../types/shared.types.js';
import { logger } from '../utils/logger.util.js';
import type { JobDefinition, JobRunResult } from './job.runner.js';
import { queueManager } from './queue.manager.js';

/** Task A window — games played within the last 24 hours. */
const GAME_WINDOW_MS = 24 * 60 * 60 * 1000;

const momentumJob: JobDefinition = {
  name: 'momentum',
  schedule: env.JOB_CRON_MOMENTUM, // once daily — 2:00 AM
  description: 'Computes momentum timelines for recent games and refreshes the Cox season analysis for every active sport',
  run: async () => {
    const errors: string[] = [];
    const perSport: Record<string, unknown> = {};
    let gamesProcessed = 0;
    let sportsAnalyzed = 0;
    let coxModelUpdated = false;

    // -- Task A — game timeline computation (games from the last 24h) --------
    try {
      const windowStart = new Date(Date.now() - GAME_WINDOW_MS);
      const recentGames = await prisma.games.findMany({
        where: { status: 'final', date: { gte: windowStart } },
        select: { id: true },
      });
      // Only games with no timeline yet — existing rows are kept as-is.
      const withTimeline = await prisma.momentumGameData.findMany({
        where: { gameId: { in: recentGames.map(g => g.id) } },
        select: { gameId: true },
      });
      const haveTimeline = new Set(withTimeline.map(t => t.gameId));
      const pending = recentGames.filter(g => !haveTimeline.has(g.id));

      // Process sequentially — parallel would overwhelm the Python service.
      for (const game of pending) {
        try {
          const computed = await computeAndStoreGameTimeline(game.id);
          if (computed) {
            gamesProcessed += 1;
          } else {
            logger.warn({ gameId: game.id }, 'momentum: no scoring play data for game — skipping');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`game ${game.id}: ${message}`);
          logger.warn(
            { gameId: game.id, error: message },
            'momentum: game timeline failed — keeping any existing data'
          );
        }
      }
      logger.info(
        { windowGames: recentGames.length, pendingGames: pending.length, gamesProcessed },
        'momentum: Task A complete'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`task-a: ${message}`);
      logger.error({ error: message }, 'momentum: Task A failed');
    }

    // -- Task B — season analysis update (Cox model per active sport) ---------
    const sports = await prisma.sports.findMany({
      where: { isActive: true },
      select: { id: true, name: true, season: true },
    });
    for (const sport of sports) {
      try {
        const { stats, season: resolvedSeason } = await computeAndStoreSeasonAnalysis(
          sport.name as SportAbbreviation,
          sport.id,
          sport.season
        );
        sportsAnalyzed += 1;
        // A stored (significant or not) analysis counts as updated; an
        // insufficient-data run stores nothing, so the flag stays false.
        if (stats.verdictLabel !== 'insufficient_data') coxModelUpdated = true;
        perSport[sport.name] = {
          verdict: stats.verdictLabel,
          gamesAnalyzed: stats.gamesAnalyzed,
          playsAnalyzed: stats.playsAnalyzed,
        };
        // Phase 7 Step 7.2 — a refreshed analysis invalidates every cached
        // response for this sport (memory service keys + resp: middleware
        // entries + the CacheMetadata registry row) so the next request reads
        // the fresh row. The comparison route has no cache middleware.
        // The resolved season may differ from the Sports-row seed (a stale
        // seed like NBA "2024-25" would invalidate nothing) — use what was
        // actually computed.
        if (stats.verdictLabel !== 'insufficient_data') {
          await invalidateMomentumAnalysis(sport.name, resolvedSeason);
          logger.info(
            { sport: sport.name, season: resolvedSeason },
            'momentum: season analysis refreshed, cached responses invalidated'
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${sport.name}: ${message}`);
        // Step 7.4 — keep the previous analysis and say when it was computed.
        const prev = await prisma.momentumAnalysis.findUnique({
          where: { sportId_season: { sportId: sport.id, season: sport.season } },
          select: { computedAt: true },
        });
        logger.warn(
          {
            sport: sport.name,
            error: message,
            lastComputedAt: prev?.computedAt.toISOString() ?? null,
          },
          'momentum: season analysis failed — keeping previous analysis'
        );
      }
    }

    const recordsProcessed = gamesProcessed + sportsAnalyzed;
    const status: JobRunResult['status'] =
      errors.length === 0 ? 'completed' : recordsProcessed > 0 ? 'partial' : 'failed';

    return {
      status,
      recordsProcessed,
      errors,
      summary: {
        gamesProcessed,
        sportsAnalyzed,
        coxModelUpdated,
        errorsCount: errors.length,
        perSport,
      },
    };
  },
};

queueManager.register(momentumJob);
