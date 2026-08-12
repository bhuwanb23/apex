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
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { mlClient } from '../ml/ml.client.js';
import { queueManager } from '../jobs/queue.manager.js';
import { ApiError } from '../middleware/error.middleware.js';
import { sendSuccess } from '../utils/response.util.js';
import { validateBody, validateQuery } from '../utils/validator.util.js';
import { logger } from '../utils/logger.util.js';

const historyQuerySchema = z.object({
  jobName: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

const triggerBodySchema = z.object({
  jobName: z.string().min(1),
  sport: z.string().min(1).optional(),
});

const sleep = (ms: number): Promise<void> =>
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
async function awaitJobLogId(
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

/** Basic protection for mutating job endpoints (docs: simple header check). */
function assertAdminKey(req: Request): void {
  const configured = env.JOB_CONTROL_ADMIN_KEY;
  if (!configured) {
    throw new ApiError(
      503,
      'Job triggering is disabled — JOB_CONTROL_ADMIN_KEY is not configured'
    );
  }
  const provided = req.header('x-admin-key');
  if (!provided || provided !== configured) {
    throw new ApiError(403, 'Invalid or missing X-Admin-Key header');
  }
}

/** ML availability + last check, read from the most recent health_check run. */
async function latestMLHealth(): Promise<{
  available: boolean | null;
  lastChecked: Date | null;
}> {
  const row = await prisma.jobLogs.findFirst({
    where: { jobName: 'health_check' },
    orderBy: { startedAt: 'desc' },
  });
  if (!row) return { available: null, lastChecked: null };
  const summary = (row.summary as { healthy?: boolean } | null) ?? {};
  return { available: summary.healthy ?? null, lastChecked: row.startedAt };
}

/** GET /api/jobs/status — every registered job + ML availability. */
export async function getJobsStatus(_req: Request, res: Response): Promise<void> {
  const jobs = queueManager.list();
  const statuses = [];
  for (const job of jobs) {
    const status = await queueManager.getJobStatus(job.name);
    if (status) statuses.push(status);
  }
  const ml = await latestMLHealth();
  sendSuccess(res, {
    jobs: statuses,
    mlService: ml,
    generatedAt: new Date().toISOString(),
  });
}

/** GET /api/jobs/history — recent runs, optionally filtered by jobName. */
export async function getJobsHistory(req: Request, res: Response): Promise<void> {
  const { jobName, limit } = validateQuery(historyQuerySchema, req);
  const runs = jobName
    ? await queueManager.getJobHistory(jobName, limit)
    : await queueManager.getRecentHistory(limit);
  sendSuccess(res, { jobName: jobName ?? null, runs, total: runs.length });
}

/** POST /api/jobs/trigger — run any registered job now (background, 202). */
export async function triggerJob(req: Request, res: Response): Promise<void> {
  assertAdminKey(req);
  const { jobName, sport } = validateBody(triggerBodySchema, req);

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
  const last = await latestMLHealth();

  // Consecutive unhealthy runs from the health_check job history.
  const recent = await prisma.jobLogs.findMany({
    where: { jobName: 'health_check' },
    orderBy: { startedAt: 'desc' },
    take: 50,
    select: { summary: true },
  });
  let consecutiveFailures = 0;
  for (const row of recent) {
    const summary = (row.summary as { healthy?: boolean } | null) ?? {};
    if (summary.healthy === true) break;
    consecutiveFailures += 1;
  }

  sendSuccess(res, {
    available: payload !== null,
    lastChecked: payload?.timestamp ? new Date(payload.timestamp) : last.lastChecked,
    consecutiveFailures,
    models: payload?.models ?? null,
    nflDataAvailable: payload?.nflDataAvailable ?? null,
    modelCacheSize: payload?.modelCacheSize ?? null,
  });
}
