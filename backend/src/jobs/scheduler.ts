/**
 * Job scheduler (Phase 6, Step 3).
 *
 * Responsibilities:
 *   - register every job from the queue manager with node-cron (validating
 *     each cron expression)
 *   - log all registered jobs and their next run times after registration
 *   - optionally run every job once at boot (RUN_JOBS_ON_STARTUP=true)
 *   - export lifecycle controls: start / stop / status / next-run lookup
 *
 * Overlap prevention lives in the runner (in-flight guard keyed by job name):
 * when a cron tick fires while the previous run is still executing, that
 * tick is skipped with a warning — no parallel writes to SQLite.
 *
 * Importing this module registers the job payloads as a side effect, so the
 * app entry point only imports `./jobs/queue.manager.js` and calls
 * `startAllJobs()` / `stopAllJobs()`.
 */
import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { runJob, waitForJobs } from './job.runner.js';
import { queueManager } from './queue.manager.js';

// Side-effect registration: each job module registers itself on import.
import './data.sync.job.js';
import './risk.compute.job.js';
import './momentum.job.js';
import './cleanup.job.js';
import './health.check.job.js';

/** task by job name — powers next-run lookups for getJobStatus. */
const taskByJob = new Map<string, ReturnType<typeof cron.schedule>>();
let started = false;

/**
 * Schedules all registered jobs. Always runs the health check once at boot
 * (gives JobLogs an immediate row); when RUN_JOBS_ON_STARTUP=true it also
 * runs every job once, sequentially, with triggeredBy 'startup'.
 */
export function startScheduler(): void {
  if (started) return;
  if (!env.JOBS_ENABLED) {
    logger.info('Background jobs disabled (JOBS_ENABLED=false) — scheduler not started');
    return;
  }

  const jobs = queueManager.list();
  for (const job of jobs) {
    if (!job.schedule) {
      logger.warn({ job: job.name }, 'Job has no cron schedule — not scheduled');
      continue;
    }
    if (!cron.validate(job.schedule)) {
      logger.error(
        { job: job.name, schedule: job.schedule },
        'Invalid cron expression — job not scheduled'
      );
      continue;
    }
    const task = cron.schedule(
      job.schedule,
      () => {
        // Fire-and-forget: the runner guarantees failures never propagate and
        // skips ticks that would overlap a still-running execution.
        void runJob(job, { triggeredBy: 'scheduler' });
      },
      { timezone: 'UTC' } // deterministic schedule regardless of server TZ
    );
    taskByJob.set(job.name, task);
    logger.info(
      { job: job.name, schedule: job.schedule, nextRun: task.getNextRun()?.toISOString() ?? null },
      'Background job scheduled'
    );
  }
  started = true;

  // Startup health check (always): surfaces a dead ML service immediately and
  // leaves a JobLogs row at boot.
  const healthJob = queueManager.get('health_check');
  if (healthJob) void runJob(healthJob, { triggeredBy: 'startup' });

  // Optional full startup run — sequential so boot doesn't stampede the APIs.
  // health_check is excluded: it already ran above, and the in-flight guard
  // would not dedupe it (the check completes in milliseconds).
  if (env.RUN_JOBS_ON_STARTUP) {
    logger.info('RUN_JOBS_ON_STARTUP=true — running every job once at startup');
    const startupJobs = jobs.filter(j => j.name !== 'health_check');
    void (async () => {
      for (const job of startupJobs) {
        await runJob(job, { triggeredBy: 'startup' });
      }
      logger.info('RUN_JOBS_ON_STARTUP — startup run finished');
    })();
  }
}

/**
 * Stops every scheduled task, then waits for currently running jobs to
 * finish (bounded by the timeout) so a restart can't cut a job off mid-write.
 */
export async function stopScheduler(): Promise<void> {
  for (const task of taskByJob.values()) {
    await task.stop();
  }
  taskByJob.clear();
  started = false;
  await waitForJobs(10_000);
  logger.info('Background scheduler stopped — in-flight jobs drained');
}

export function isSchedulerRunning(): boolean {
  return started;
}

/** Next scheduled run for a job (null when unscheduled/stopped). */
export function getNextRunAt(jobName: string): Date | null {
  return taskByJob.get(jobName)?.getNextRun() ?? null;
}

/** All registered schedules, for logging/diagnostics. */
export function listSchedules(): Array<{ job: string; schedule: string; nextRun: Date | null }> {
  return [...taskByJob.entries()].map(([job, task]) => ({
    job,
    schedule: task.getPattern(),
    nextRun: task.getNextRun(),
  }));
}
