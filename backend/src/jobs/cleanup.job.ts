/**
 * Cleanup job (Phase 6, Step 2 — housekeeping).
 *
 * Daily database hygiene so tables don't grow forever:
 *   - delete expired CacheMetadata rows (fresh data replaces them anyway)
 *   - delete expired StoryLogs rows (stale stories regenerate on demand)
 *   - prune JobLogs older than the retention window (default 30 days)
 *   - flush the in-memory response cache (clears any leaked entries; TTL
 *     expiry would have removed most of it already)
 */
import { env } from '../config/env.js';
import { cacheFlush } from '../cache/memoryCache.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.util.js';
import type { JobDefinition } from './job.runner.js';
import { queueManager } from './queue.manager.js';

/** Keep this many days of job history. */
const JOB_LOG_RETENTION_DAYS = 30;

const cleanupJob: JobDefinition = {
  name: 'cleanup',
  schedule: env.JOB_CRON_CLEANUP, // once daily — 3:00 AM
  description: 'Database housekeeping — expired metadata, story logs, old job logs, memory cache',
  run: async () => {
    const now = new Date();
    const retentionCutoff = new Date(now.getTime() - JOB_LOG_RETENTION_DAYS * 86_400_000);

    const results: Record<string, number> = {};

    results.expiredCacheMetadata = (
      await prisma.cacheMetadata.deleteMany({ where: { expiresAt: { lt: now } } })
    ).count;

    results.expiredStoryLogs = (
      await prisma.storyLogs.deleteMany({ where: { expiresAt: { lt: now } } })
    ).count;

    results.oldJobLogs = (
      await prisma.jobLogs.deleteMany({ where: { startedAt: { lt: retentionCutoff } } })
    ).count;

    cacheFlush();
    results.memoryCacheFlushed = 1;

    const recordsProcessed =
      results.expiredCacheMetadata + results.expiredStoryLogs + results.oldJobLogs;

    logger.info({ results }, 'cleanup: housekeeping complete');
    return { status: 'completed', recordsProcessed, summary: results };
  },
};

queueManager.register(cleanupJob);
