/**
 * Job execution wrapper (Phase 6, Step 2).
 *
 * Every background job goes through `runJob`, which guarantees:
 *   - a JobLogs row is always written (running → completed/failed) so we have
 *     run history and can debug failures
 *   - the job's own result (record counts, errors, summary) is persisted
 *   - the wrapper NEVER throws: a failing job is captured in the log, so one
 *     job can never crash the server or stop the next scheduled run
 */
import { logger } from '../config/logger.js';
import { prisma } from '../db/client.js';
import { Prisma } from '../generated/prisma/client.js';

/** Context handed to a job's run function. */
export interface JobContext {
  /** Target sport abbreviation ('mlb') when the run is sport-scoped. */
  sport?: string;
}

/** What a job reports back to the runner. */
export interface JobRunResult {
  status: 'completed' | 'failed';
  recordsProcessed?: number;
  errors?: string[];
  summary?: Record<string, unknown>;
}

/** Who kicked off the run — the JobLogs.triggeredBy values. */
export type JobTrigger = 'scheduler' | 'manual' | 'startup';

/** Contract every job module must export and register. */
export interface JobDefinition {
  /** Unique name — 'data_sync', 'risk_compute', ... (JobLogs.jobName). */
  name: string;
  /** Cron expression (5-field). '' disables scheduling. */
  schedule: string;
  description?: string;
  run(ctx: JobContext): Promise<JobRunResult>;
}

/** Public view of a JobLogs row (JSON columns decoded). */
export interface JobLogEntry {
  id: number;
  jobName: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  durationSeconds: number | null;
  recordsProcessed: number | null;
  errors: string[];
  summary: Record<string, unknown>;
  sport: string | null;
  triggeredBy: string;
}

/**
 * Runs a job under the runner's guarantees and returns the final log entry.
 * Manual triggers pass `triggeredBy: 'manual'`; the scheduler passes
 * 'scheduler'; startup hooks pass 'startup'.
 */
export async function runJob(
  job: JobDefinition,
  opts: { triggeredBy?: JobTrigger; sport?: string } = {}
): Promise<JobLogEntry> {
  const triggeredBy = opts.triggeredBy ?? 'manual';
  const startedAt = new Date();

  const log = await prisma.jobLogs.create({
    data: {
      jobName: job.name,
      sport: opts.sport ?? null,
      status: 'running',
      startedAt,
      triggeredBy,
    },
  });

  let result: JobRunResult;
  try {
    result = await job.run({ sport: opts.sport });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ job: job.name, error: message }, 'Job run threw — captured as failure');
    result = { status: 'failed', errors: [message], summary: { uncaughtError: message } };
  }

  const completedAt = new Date();
  const durationSeconds = (completedAt.getTime() - startedAt.getTime()) / 1000;
  const errors = result.errors ?? (result.status === 'failed' ? ['Job reported failure'] : []);

  const updated = await prisma.jobLogs.update({
    where: { id: log.id },
    data: {
      status: result.status,
      completedAt,
      durationSeconds,
      recordsProcessed: result.recordsProcessed ?? 0,
      errors:
        errors.length > 0
          ? (errors as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      summary: (result.summary ?? {}) as unknown as Prisma.InputJsonValue,
    },
  });

  logger.info(
    {
      job: job.name,
      status: result.status,
      durationSeconds: Math.round(durationSeconds * 100) / 100,
      recordsProcessed: updated.recordsProcessed,
      errorCount: errors.length,
      triggeredBy,
    },
    result.status === 'completed' ? 'Job completed' : 'Job failed'
  );

  return {
    id: updated.id,
    jobName: updated.jobName,
    status: updated.status,
    startedAt: updated.startedAt,
    completedAt: updated.completedAt,
    durationSeconds: updated.durationSeconds,
    recordsProcessed: updated.recordsProcessed,
    errors,
    summary: (updated.summary ?? {}) as Record<string, unknown>,
    sport: updated.sport,
    triggeredBy: updated.triggeredBy,
  };
}
