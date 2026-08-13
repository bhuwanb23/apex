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
 */
jobsRouter.get(
  '/history',
  createValidator(jobHistoryQuerySchema, 'query'),
  getJobsHistory
);

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
 *       403:
 *         description: Missing or invalid X-Admin-Key
 *       404:
 *         description: Unknown job name
 *       409:
 *         description: Job already running (overlap prevented)
 *       503:
 *         description: Triggering disabled — JOB_CONTROL_ADMIN_KEY not configured
 */
jobsRouter.post(
  '/trigger',
  createValidator(triggerJobBodySchema, 'body'),
  triggerJob
);

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
 */
jobsRouter.get('/ml-health', getMLHealth);
