/**
 * Job queue manager (Phase 6, Steps 2 + 4).
 *
 * The single control point for every background job. Nothing calls a job
 * module directly — anything that wants to start, stop or inspect jobs goes
 * through this manager:
 *
 *   startAllJobs()      → register everything with the scheduler (app boot)
 *   stopAllJobs()       → cancel schedules + drain in-flight runs (shutdown)
 *   triggerJob(...)     → run any job immediately (admin routes, startup)
 *   getJobStatus(...)   → running flag, last run, next run
 *   getJobHistory(...)  → recent JobLogs rows (monitoring)
 *   getRunningJobs()    → names of currently executing jobs
 *
 * The scheduler is imported dynamically inside the methods (not statically)
 * so this module never creates an import cycle with scheduler.ts, which
 * statically imports this one.
 */
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../db/client.js';
import {
  getInFlightJobs,
  isJobRunning,
  runJob,
  type JobDefinition,
  type JobLogEntry,
  type JobTrigger,
} from './job.runner.js';

export interface JobStatus {
  jobName: string;
  description?: string;
  isRunning: boolean;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  nextRunAt: Date | null;
}

/** One JobLogs row with JSON columns decoded. */
export type JobHistoryEntry = {
  id: number;
  jobName: string;
  sport: string | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  durationSeconds: number | null;
  recordsProcessed: number | null;
  errors: string[];
  summary: Record<string, unknown>;
  triggeredBy: string;
};

export class QueueManager {
  private readonly jobs = new Map<string, JobDefinition>();

  /** Registers a job — throws on duplicate names so misconfig is loud. */
  register(job: JobDefinition): void {
    if (this.jobs.has(job.name)) {
      throw new Error(`Job already registered: ${job.name}`);
    }
    this.jobs.set(job.name, job);
  }

  registerMany(jobs: JobDefinition[]): void {
    for (const job of jobs) this.register(job);
  }

  get(name: string): JobDefinition | undefined {
    return this.jobs.get(name);
  }

  has(name: string): boolean {
    return this.jobs.has(name);
  }

  list(): JobDefinition[] {
    return [...this.jobs.values()];
  }

  // -------------------------------------------------------------------------
  // Lifecycle — app boot / graceful shutdown
  // -------------------------------------------------------------------------

  /** Registers every job with the scheduler and starts cron schedules. */
  async startAllJobs(): Promise<void> {
    const { startScheduler, listSchedules } = await import('./scheduler.js');
    startScheduler();
    if (!env.JOBS_ENABLED) {
      logger.info('Job manager: background jobs disabled (JOBS_ENABLED=false)');
      return;
    }
    const active = this.list()
      .filter(j => j.schedule)
      .map(j => j.name);
    logger.info({ active, schedules: listSchedules() }, 'Job manager started');
  }

  /**
   * Stops all schedules and waits for currently running jobs to finish so a
   * deployment restart can't interrupt a job mid-write.
   */
  async stopAllJobs(): Promise<void> {
    const { stopScheduler } = await import('./scheduler.js');
    await stopScheduler();
  }

  // -------------------------------------------------------------------------
  // Control — manual triggers
  // -------------------------------------------------------------------------

  /**
   * Runs any registered job immediately in the background. The returned
   * promise resolves with the final JobLogs entry when the run finishes;
   * callers that don't need the result simply don't await it (runJob never
   * rejects, so an un-awaited promise can't crash the process). Track a run
   * by polling getJobStatus / getJobHistory, or await the entry for the id.
   */
  triggerJob(
    jobName: string,
    sport?: string,
    triggeredBy: JobTrigger = 'manual'
  ): Promise<JobLogEntry> {
    const job = this.get(jobName);
    if (!job) {
      throw new Error(`Unknown job: ${jobName} — cannot trigger`);
    }
    return runJob(job, { triggeredBy, sport });
  }

  // -------------------------------------------------------------------------
  // Introspection — status, history, running
  // -------------------------------------------------------------------------

  /** Live status for one job: running flag, last run, next scheduled run. */
  async getJobStatus(jobName: string): Promise<JobStatus | null> {
    const job = this.get(jobName);
    if (!job) return null;
    const { getNextRunAt } = await import('./scheduler.js');
    const last = await prisma.jobLogs.findFirst({
      where: { jobName },
      orderBy: { startedAt: 'desc' },
    });
    return {
      jobName,
      description: job.description,
      isRunning: isJobRunning(jobName),
      lastRunAt: last?.startedAt ?? null,
      lastRunStatus: last?.status ?? null,
      nextRunAt: getNextRunAt(jobName),
    };
  }

  /** Last N runs of a job from JobLogs (newest first) — for monitoring. */
  async getJobHistory(jobName: string, limit = 20): Promise<JobHistoryEntry[]> {
    const rows = await prisma.jobLogs.findMany({
      where: { jobName },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows.map(row => ({
      id: row.id,
      jobName: row.jobName,
      sport: row.sport,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      durationSeconds: row.durationSeconds,
      recordsProcessed: row.recordsProcessed,
      errors: (row.errors as unknown as string[]) ?? [],
      summary: (row.summary as Record<string, unknown> | null) ?? {},
      triggeredBy: row.triggeredBy,
    }));
  }

  /** Names of jobs with a run currently executing. */
  getRunningJobs(): string[] {
    return getInFlightJobs();
  }
}

/** Shared instance — job modules and the app import this. */
export const queueManager = new QueueManager();
