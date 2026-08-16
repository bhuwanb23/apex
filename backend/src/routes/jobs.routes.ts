import { Router } from 'express';
import {
  getJobsHistory,
  getJobsStatus,
  getMLHealth,
  triggerJob,
} from '../controllers/jobs.controller.js';
import {
  createValidator,
  jobHistoryQuerySchema,
  triggerJobBodySchema,
} from '../middleware/validation.middleware.js';

export const jobsRouter = Router();

/**
 * @openapi
 * /api/jobs/status:
 *   get:
 *     summary: Background job status
 *     description: Every registered job — running flag, last run, next scheduled run — plus ML service availability.
 *     tags: [Jobs]
 *     responses:
 *       200:
 *         description: Job statuses with ML availability
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   mlAvailable: true
 *                   jobs:
 *                     - name: data_sync
 *                       description: Sync teams, players and game logs
 *                       running: false
 *                       lastRunAt: '2026-08-16T08:00:00.000Z'
 *                       lastStatus: success
 *                       nextRunAt: '2026-08-16T12:00:00.000Z'
 *                       schedule: every 4 hours
 *                     - name: risk_compute
 *                       description: Recompute injury risk scores
 *                       running: false
 *                       lastRunAt: '2026-08-16T09:00:00.000Z'
 *                       lastStatus: success
 *                       nextRunAt: '2026-08-16T10:00:00.000Z'
 *                       schedule: hourly
 */
jobsRouter.get('/status', getJobsStatus);

/**
 * @openapi
 * /api/jobs/history:
 *   get:
 *     summary: Job run history
 *     description: Recent JobLogs runs, newest first — optionally filtered by job name.
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: jobName
 *         schema:
 *           type: string
 *         description: Filter to one job (data_sync, risk_compute, momentum, cleanup, health_check)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Recent job runs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   total: 2
 *                   runs:
 *                     - id: 892
 *                       jobName: data_sync
 *                       status: success
 *                       startedAt: '2026-08-16T08:00:00.000Z'
 *                       finishedAt: '2026-08-16T08:02:14.000Z'
 *                       durationMs: 134000
 *                       error: null
 *                       summary:
 *                         teams: 30
 *                         players: 450
 *                         gameLogs: 3600
 *                     - id: 891
 *                       jobName: risk_compute
 *                       status: success
 *                       startedAt: '2026-08-16T09:00:00.000Z'
 *                       finishedAt: '2026-08-16T09:01:02.000Z'
 *                       durationMs: 62000
 *                       error: null
 *                       summary:
 *                         scored: 450
 */
jobsRouter.get('/history', createValidator(jobHistoryQuerySchema, 'query'), getJobsHistory);

/**
 * @openapi
 * /api/jobs/trigger:
 *   post:
 *     summary: Trigger a background job
 *     description: Runs any registered job immediately in the background. Returns 202 as soon as the run is accepted — poll /api/jobs/history to track it. Requires the X-Admin-Key header matching JOB_CONTROL_ADMIN_KEY.
 *     tags: [Jobs]
 *     parameters:
 *       - in: header
 *         name: X-Admin-Key
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jobName]
 *             properties:
 *               jobName:
 *                 type: string
 *                 description: data_sync, risk_compute, momentum, cleanup or health_check
 *               sport:
 *                 type: string
 *                 description: Optional sport filter (e.g. 'nba')
 *     responses:
 *       202:
 *         description: Job accepted — returns the JobLogs id to track
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   jobId: 893
 *                   jobName: data_sync
 *                   status: accepted
 *                   note: Poll GET /api/jobs/history?jobName=data_sync to track completion
 *       403:
 *         description: Missing or invalid X-Admin-Key
 *       404:
 *         description: Unknown job name
 *       409:
 *         description: Job already running (overlap prevented)
 *       503:
 *         description: Triggering disabled — JOB_CONTROL_ADMIN_KEY not configured
 */
jobsRouter.post('/trigger', createValidator(triggerJobBodySchema, 'body'), triggerJob);

/**
 * @openapi
 * /api/jobs/ml-health:
 *   get:
 *     summary: Python ML service health
 *     description: Live health of the ML microservice — availability, model readiness, consecutive failure count.
 *     tags: [Jobs]
 *     responses:
 *       200:
 *         description: ML service health
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   available: true
 *                   baseUrl: http://127.0.0.1:8001
 *                   modelsReady: true
 *                   latencyMs: 42
 *                   consecutiveFailures: 0
 *                   lastCheckedAt: '2026-08-16T09:00:00.000Z'
 */
jobsRouter.get('/ml-health', getMLHealth);
