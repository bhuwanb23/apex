/**
 * Job queue manager (Phase 6, Step 2).
 *
 * Single registry for every background job. Job modules register themselves
 * at import time (`queueManager.register(...)`); the scheduler reads the
 * registry to wire cron schedules, and control routes / manual triggers look
 * jobs up by name. No job may be registered twice.
 */
import type { JobDefinition } from './job.runner.js';

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
}

/** Shared instance — job modules and the scheduler import this. */
export const queueManager = new QueueManager();
