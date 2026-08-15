/**
 * Job control controllers (Phase 6, Step 10).
 *
 * Thin request/response layer over the queue manager:
 *   GET  /api/jobs/status     → every registered job: running flag, last run,
 *                               next scheduled run, plus ML service availability
 *   GET  /api/jobs/history    → recent JobLogs runs (filtered or across all jobs)
 *   POST /api/jobs/trigger    → run any job immediately (X-Admin-Key protected)
 *   GET  /api/jobs/ml-health  → live Python ML service health (models, failures)
 *
 * The trigger route is deliberately fire-and-forget: it returns 202 as soon as
 * the run is accepted (the runner writes the JobLogs row first, then executes),
 * and the caller tracks progress by polling /api/jobs/history. runJob never
 * rejects, so the un-awaited promise can't crash the process.
 */
import type { Request, Response } from 'express';
import { prisma } from '../db/client.js';
import { mlClient } from '../ml/ml.client.js';
import { getMLServiceStatus, recordMLHealthCheck } from '../ml/availability.js';
import { getMLPerformance } from '../ml/ml.logger.js';
import { queueManager } from '../jobs/queue.manager.js';
import { assertAdminKey } from '../middleware/admin.middleware.js';
import { ApiError } from '../middleware/error.middleware.js';
import { sendSuccess } from '../utils/response.util.js';
import { logger } from '../utils/logger.util.js';

export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/**
 * Polls briefly for the JobLogs row the runner creates at the start of a run,
 * so the trigger response can return a trackable log ID. Rows are anchored to
 * `firedAt` (captured just before the trigger) — only rows created by THIS
 * trigger can match, so a rapid re-trigger can never report a previous run's id.
 * Returns null if the write hasn't landed within the window (e.g. the run was
 * skipped by the in-flight guard) — callers can still poll history.
 */
export async function awaitJobLogId(
  jobName: string,
  firedAt: Date,
  attempts = 20
): Promise<number | null> {
  for (let i = 0; i < attempts; i++) {
    const row = await prisma.jobLogs.findFirst({
      where: { jobName, startedAt: { gte: firedAt } },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    if (row !== null) return row.id;
    await sleep(50);
  }
  return null;
}

/**
 * ML availability + last check from the in-memory flag (Phase 6, Step 9) —
 * kept fresh by the health_check job. `available` is null only before the
 * first probe of this process.
 */
function latestMLHealth(): { available: boolean | null; lastChecked: Date | null } {
  const { available, lastCheckedAt } = getMLServiceStatus();
  return {
    available: lastCheckedAt === null ? null : available,
    lastChecked: lastCheckedAt,
  };
}

/** GET /api/jobs/status — every registered job + ML availability. */
export async function getJobsStatus(_req: Request, res: Response): Promise<void> {
  const jobs = queueManager.list();
  const statuses = [];
  for (const job of jobs) {
    const status = await queueManager.getJobStatus(job.name);
    if (status) statuses.push(status);
  }
  const ml = latestMLHealth();
  sendSuccess(res, {
    jobs: statuses,
    mlService: ml,
    generatedAt: new Date().toISOString(),
  });
}

/** GET /api/jobs/history — recent runs, optionally filtered by jobName. */
export async function getJobsHistory(req: Request, res: Response): Promise<void> {
  const { jobName, limit } = req.validatedQuery as {
    jobName?: string;
    limit: number;
  };
  const runs = jobName
    ? await queueManager.getJobHistory(jobName, limit)
    : await queueManager.getRecentHistory(limit);
  sendSuccess(res, { jobName: jobName ?? null, runs, total: runs.length });
}

/** POST /api/jobs/trigger — run any registered job now (background, 202). */
export async function triggerJob(req: Request, res: Response): Promise<void> {
  assertAdminKey(req);
  const { jobName, sport } = req.validatedBody as {
    jobName: string;
    sport?: string;
  };

  const job = queueManager.get(jobName);
  if (!job) throw ApiError.notFound(`Unknown job: ${jobName} — cannot trigger`);

  if (queueManager.getRunningJobs().includes(jobName)) {
    throw ApiError.conflict(`Job ${jobName} is already running — wait for it to finish`);
  }

  // Fire-and-forget per the docs: don't block the HTTP response on the run.
  // Anchor the log-id poll to this instant so a rapid re-trigger can never
  // return the previous run's id (see awaitJobLogId).
  const firedAt = new Date();
  void queueManager.triggerJob(jobName, sport, 'manual');
  const logId = await awaitJobLogId(jobName, firedAt);
  logger.info({ jobName, sport, logId }, 'Job triggered via /api/jobs/trigger');

  sendSuccess(
    res,
    {
      jobName,
      sport: sport ?? null,
      logId,
      status: 'triggered',
      note: 'Track progress via GET /api/jobs/history',
    },
    `Job ${jobName} triggered`,
    202
  );
}

/** GET /api/jobs/ml-health — live Python health + model readiness. */
export async function getMLHealth(_req: Request, res: Response): Promise<void> {
  const payload = await mlClient.getHealth();
  // A successful live probe is itself a health check: keep the in-memory flag
  // in step with reality so `available` and `consecutiveFailures` can never
  // disagree in this response (e.g. Python just came back).
  if (payload !== null) recordMLHealthCheck(true);
  const { available, lastCheckedAt, consecutiveFailures } = getMLServiceStatus();

  sendSuccess(res, {
    // Live probe is the freshest signal; the flag carries the history.
    available: payload !== null,
    lastChecked: payload?.timestamp ? new Date(payload.timestamp) : lastCheckedAt,
    consecutiveFailures,
    models: payload?.models ?? null,
    nflDataAvailable: payload?.nflDataAvailable ?? null,
    modelCacheSize: payload?.modelCacheSize ?? null,
    flag: { available, lastCheckedAt },
    // Phase 8 Step 8.3 — rolling ML performance (avg / P95 / slowest per
    // endpoint) + endpoints stuck on repeated timeouts.
    performance: getMLPerformance(),
  });
}
