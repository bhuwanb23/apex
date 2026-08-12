/**
 * Job execution wrapper (Phase 6, Step 2).
 *
 * Every background job goes through `runJob`, which guarantees:
 *   - a JobLogs row is always written (running → completed/failed) so we have
 *     run history and can debug failures
 *   - the job's own result (record counts, errors, summary) is persisted
 *   - the wrapper NEVER throws and never rejects: a failing job — or even a
 *     failing JobLogs write — is captured in the logs, so one job can never
 *     crash the server or stop the next scheduled run
 *   - only one run of a job executes at a time (overlapping ticks/manual
 *     triggers are skipped, not queued)
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
  /** 'partial' = some work succeeded, some failed (e.g. one sport down). */
  status: 'completed' | 'partial' | 'failed';
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

/** Job names with a run in flight — prevents overlapping executions. */
const inFlight = new Set<string>();

/**
 * Runs a job under the runner's guarantees and returns the final log entry.
 * Manual triggers pass `triggeredBy: 'manual'`; the scheduler passes
 * 'scheduler'; startup hooks pass 'startup'. Skips the run (returns a
 * synthetic entry) if the same job is already executing.
 */
export async function runJob(
  job: JobDefinition,
  opts: { triggeredBy?: JobTrigger; sport?: string } = {}
): Promise<JobLogEntry> {
  const triggeredBy = opts.triggeredBy ?? 'manual';
  const startedAt = new Date();

  // Overlap guard: a scheduled tick firing while the previous run is still
  // going (or a manual trigger racing the scheduler) is dropped, not queued.
  if (inFlight.has(job.name)) {
    logger.warn({ job: job.name }, 'Job run skipped — a run is already in flight');
    return {
      id: 0,
      jobName: job.name,
      status: 'skipped',
      startedAt,
      completedAt: startedAt,
      durationSeconds: 0,
      recordsProcessed: 0,
      errors: [],
      summary: { skipped: 'previous run still in flight' },
      sport: opts.sport ?? null,
      triggeredBy,
    };
  }
  inFlight.add(job.name);

  try {
    // Everything below is guarded: even a JobLogs write failure must not
    // reject — the caller fires jobs with `void runJob(...)`, so any
    // rejection would be an unhandled rejection and could crash the process.
    let logId: number | null = null;
    try {
      const log = await prisma.jobLogs.create({
        data: {
          jobName: job.name,
          sport: opts.sport ?? null,
          status: 'running',
          startedAt,
          triggeredBy,
        },
      });
      logId = log.id;
    } catch (err) {
      logger.error(
        { job: job.name, error: err instanceof Error ? err.message : String(err) },
        'JobLogs create failed — continuing without a log row'
      );
    }

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

    if (logId !== null) {
      try {
        await prisma.jobLogs.update({
          where: { id: logId },
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
      } catch (err) {
        logger.error(
          { job: job.name, logId, error: err instanceof Error ? err.message : String(err) },
          'JobLogs update failed — result not persisted'
        );
      }
    }

    logger.info(
      {
        job: job.name,
        status: result.status,
        durationSeconds: Math.round(durationSeconds * 100) / 100,
        recordsProcessed: result.recordsProcessed ?? 0,
        errorCount: errors.length,
        triggeredBy,
      },
      result.status === 'completed'
        ? 'Job completed'
        : result.status === 'partial'
          ? 'Job partially completed'
          : 'Job failed'
    );

    return {
      id: logId ?? 0,
      jobName: job.name,
      status: result.status,
      startedAt,
      completedAt,
      durationSeconds,
      recordsProcessed: result.recordsProcessed ?? 0,
      errors,
      summary: result.summary ?? {},
      sport: opts.sport ?? null,
      triggeredBy,
    };
  } finally {
    inFlight.delete(job.name);
  }
}

// ---------------------------------------------------------------------------
// Runner introspection (used by the queue manager + graceful shutdown)
// ---------------------------------------------------------------------------

/** Names of jobs with a run currently executing. */
export function getInFlightJobs(): string[] {
  return [...inFlight];
}

/** True when a run of the given job is currently executing. */
export function isJobRunning(name: string): boolean {
  return inFlight.has(name);
}

/**
 * Resolves once every in-flight job has finished (or the timeout elapses).
 * Used by graceful shutdown so a deployment restart doesn't cut a running
 * job off mid-write and corrupt data.
 */
export function waitForJobs(timeoutMs = 15_000): Promise<void> {
  return new Promise(resolve => {
    if (inFlight.size === 0) {
      resolve();
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      if (inFlight.size === 0 || Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
    // Deliberately NOT unref'd: the caller is awaiting this promise, and a
    // pending await does not keep the event loop alive. If everything else
    // (cron tasks, job I/O) has already drained, the loop would exit before
    // this tick fires and the drain would never resolve. The timeout bound
    // already caps how long we can hold the process open.
  });
}
