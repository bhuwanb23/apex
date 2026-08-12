/**
 * Job scheduler (Phase 6, Steps 2-3).
 *
 * Reads every job from the queue manager, validates its cron expression and
 * schedules it with node-cron. Lifecycle:
 *   - startScheduler()  — called at boot (guarded by JOBS_ENABLED)
 *   - stopScheduler()   — called on graceful shutdown
 *   - isSchedulerRunning() — for control routes / health reporting
 *
 * Importing this module registers the job payloads as a side effect, so the
 * only import needed from the app entry point is `./jobs/scheduler.js`.
 */
import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { runJob } from './job.runner.js';
import { queueManager } from './queue.manager.js';

// Side-effect registration: each job module registers itself on import.
import './data.sync.job.js';
import './risk.compute.job.js';
import './momentum.job.js';
import './cleanup.job.js';
import './health.check.job.js';

let tasks: ReturnType<typeof cron.schedule>[] = [];
let started = false;

/** Schedules all registered jobs; runs a startup health check. */
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
    tasks.push(
      cron.schedule(
        job.schedule,
        () => {
          // Fire-and-forget: the runner guarantees failures never propagate.
          void runJob(job, { triggeredBy: 'scheduler' });
        },
        { timezone: 'UTC' } // deterministic schedule regardless of server TZ
      )
    );
    logger.info({ job: job.name, schedule: job.schedule }, 'Background job scheduled');
  }
  started = true;

  // Startup health check: gives JobLogs an immediate row and surfaces a dead
  // ML service before the first 15-minute tick.
  const healthJob = queueManager.get('health_check');
  if (healthJob) void runJob(healthJob, { triggeredBy: 'startup' });
}

/** Stops every scheduled task (graceful shutdown path). */
export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks = [];
  started = false;
  logger.info('Background scheduler stopped');
}

export function isSchedulerRunning(): boolean {
  return started;
}
