/**
 * Health check job (Phase 6, Step 2 — ML service monitoring).
 *
 * Pings the Python ML service on a short cadence (every 15 min). The job
 * never 'fails' — `summary.healthy` carries the signal, and each run leaves
 * a JobLogs row so monitoring can alert on sustained unhealthy periods.
 */
import { env } from '../config/env.js';
import { mlClient } from '../ml/ml.client.js';
import type { JobDefinition } from './job.runner.js';
import { queueManager } from './queue.manager.js';

const healthCheckJob: JobDefinition = {
  name: 'health_check',
  schedule: env.JOB_CRON_HEALTH_CHECK, // every 15 minutes
  description: 'Pings the Python ML service and records liveness',
  run: async () => {
    const healthy = await mlClient.checkHealth();
    return {
      status: 'completed',
      recordsProcessed: healthy ? 1 : 0,
      summary: { healthy, checkedAt: new Date().toISOString() },
    };
  },
};

queueManager.register(healthCheckJob);
