/**
 * Cleanup job (Phase 6, Step 8 — daily housekeeping).
 *
 * Daily database hygiene so tables don't grow forever:
 *   Task 1 — delete old non-latest injury risk scores (isLatest=false,
 *            computedAt older than 30 days) — keep recent history, not forever
 *   Task 2 — delete expired StoryLogs rows (stale stories regenerate on demand)
 *   Task 3 — delete JobLogs older than the retention window (14 days)
 *   Task 4 — delete invalid CacheMetadata rows (isValid=false) not touched in
 *            7 days; also sweep rows past their expiresAt (fresh data replaces
 *            them anyway — see updateCacheMetadata's upsert)
 *   Task 5 — delete TimeoutRecommendations computed more than 30 days ago
 *            (the timeout service recomputes them live on demand)
 *   Task 6 — flip JobLogs stuck in 'running' for > 24h to 'failed' (the
 *            process likely died mid-run) + flush the in-memory response cache
 */
import { env } from '../config/env.js';
import { cacheFlush } from '../cache/memoryCache.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.util.js';
import type { JobDefinition } from './job.runner.js';
import { queueManager } from './queue.manager.js';

/** Keep this many days of job history (spec: 14). */
const JOB_LOG_RETENTION_DAYS = 14;
/** Old non-latest risk scores and timeout recommendations live for 30 days. */
const SCORE_RETENTION_DAYS = 30;
/** Invalid cache entries not retried for this long are dropped. */
const INVALID_CACHE_DAYS = 7;
/** A 'running' row older than this is presumed crashed. */
const STALE_RUNNING_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 86_400_000;

const cleanupJob: JobDefinition = {
  name: 'cleanup',
  schedule: env.JOB_CRON_CLEANUP, // once daily — 3:00 AM
  description: 'Database housekeeping — old risk scores, expired story logs, old job logs, invalid cache metadata, old timeout recommendations',
  run: async () => {
    const now = new Date();
    const jobLogCutoff = new Date(now.getTime() - JOB_LOG_RETENTION_DAYS * DAY_MS);
    const scoreCutoff = new Date(now.getTime() - SCORE_RETENTION_DAYS * DAY_MS);
    const invalidCacheCutoff = new Date(now.getTime() - INVALID_CACHE_DAYS * DAY_MS);
    const staleCutoff = new Date(now.getTime() - STALE_RUNNING_MS);

    const results: Record<string, number> = {};

    // Task 1 — old non-latest risk scores (keep only recent history).
    results.oldRiskScores = (
      await prisma.injuryRiskScores.deleteMany({
        where: { isLatest: false, computedAt: { lt: scoreCutoff } },
      })
    ).count;

    // Task 2 — expired story logs (stale stories regenerate on demand).
    results.expiredStoryLogs = (
      await prisma.storyLogs.deleteMany({ where: { expiresAt: { lt: now } } })
    ).count;

    // Task 3 — old job logs beyond the retention window.
    results.oldJobLogs = (
      await prisma.jobLogs.deleteMany({ where: { startedAt: { lt: jobLogCutoff } } })
    ).count;

    // Task 4 — invalid cache metadata not retried for 7 days, plus any entry
    // past its expiry (updateCacheMetadata upserts fresh data over the key).
    results.invalidCacheMetadata = (
      await prisma.cacheMetadata.deleteMany({
        where: {
          OR: [
            { isValid: false, updatedAt: { lt: invalidCacheCutoff } },
            { expiresAt: { lt: now } },
          ],
        },
      })
    ).count;

    // Task 5 — old timeout recommendations (recomputed live on demand).
    results.oldTimeoutRecommendations = (
      await prisma.timeoutRecommendations.deleteMany({
        where: { computedAt: { lt: scoreCutoff } },
      })
    ).count;

    // Task 6 — resolve rows a crashed run left dangling: history must never
    // show a forever-'running' job.
    results.staleRunningJobs = (
      await prisma.jobLogs.updateMany({
        where: { status: 'running', startedAt: { lt: staleCutoff } },
        data: {
          status: 'failed',
          completedAt: now,
          summary: { note: 'Marked failed by cleanup — process likely crashed mid-run' },
        },
      })
    ).count;

    cacheFlush();
    results.memoryCacheFlushed = 1;

    const recordsProcessed =
      results.oldRiskScores +
      results.expiredStoryLogs +
      results.oldJobLogs +
      results.invalidCacheMetadata +
      results.oldTimeoutRecommendations +
      results.staleRunningJobs;

    const remaining = {
      injuryRiskScores: await prisma.injuryRiskScores.count(),
      storyLogs: await prisma.storyLogs.count(),
      jobLogs: await prisma.jobLogs.count(),
      cacheMetadata: await prisma.cacheMetadata.count(),
      timeoutRecommendations: await prisma.timeoutRecommendations.count(),
    };

    logger.info({ results, remaining }, 'cleanup: housekeeping complete');
    return { status: 'completed', recordsProcessed, summary: { ...results, remaining } };
  },
};

queueManager.register(cleanupJob);
