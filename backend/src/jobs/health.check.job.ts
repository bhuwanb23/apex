/**
 * Health check job (Phase 6, Step 9 — ML service monitoring).
 *
 * Pings the Python ML service on a short cadence (every 15 min) and keeps the
 * module-scope `mlServiceAvailable` flag fresh (see ml/availability.ts). Every
 * service that talks to Python gates on that flag, so when the ML service is
 * down the API serves cached/DB data immediately instead of waiting for
 * per-request timeouts.
 *
 * Per the spec:
 *   - healthy probe  → log "ML service healthy", flag = true
 *   - failed probe   → log warning "ML service unreachable", flag = false
 *   - 3rd consecutive failure → log an error-level alert (30+ minutes down)
 *
 * The job never 'fails' — `summary.healthy` carries the signal, and each run
 * leaves a JobLogs row so monitoring can alert on sustained unhealthy periods.
 */
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { mlClient } from '../ml/ml.client.js';
import { getMLServiceStatus, recordMLHealthCheck } from '../ml/availability.js';
import type { JobDefinition } from './job.runner.js';
import { queueManager } from './queue.manager.js';

/** Spec: alert when the ML service has been down for 3+ checks (≈45 min). */
const ALERT_AFTER_CONSECUTIVE_FAILURES = 3;

const healthCheckJob: JobDefinition = {
  name: 'health_check',
  schedule: env.JOB_CRON_HEALTH_CHECK, // every 15 minutes
  description: 'Pings the Python ML service and records liveness',
  run: async () => {
    // mlClient.checkHealth probes GET /health with a 1.5s timeout (≤ spec's 5s).
    const healthy = await mlClient.checkHealth();
    recordMLHealthCheck(healthy);
    const { consecutiveFailures } = getMLServiceStatus();

    if (healthy) {
      logger.info('ML service healthy');
    } else {
      logger.warn('ML service unreachable');
      if (consecutiveFailures >= ALERT_AFTER_CONSECUTIVE_FAILURES) {
        logger.error(
          { consecutiveFailures },
          'ML service has been down for 30+ minutes — alerts would fire in production'
        );
      }
    }

    return {
      status: 'completed',
      recordsProcessed: healthy ? 1 : 0,
      summary: {
        healthy,
        available: healthy,
        consecutiveFailures,
        checkedAt: new Date().toISOString(),
      },
    };
  },
};

queueManager.register(healthCheckJob);
