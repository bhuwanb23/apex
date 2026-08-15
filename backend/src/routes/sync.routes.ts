import { Router } from 'express';
import { refreshDataSync } from '../controllers/sync.controller.js';
import {
  createValidator,
  syncRefreshBodySchema,
} from '../middleware/validation.middleware.js';

export const syncRouter = Router();

/**
 * @openapi
 * /api/sync/refresh:
 *   post:
 *     summary: Trigger a data sync now
 *     description: Starts the data_sync job immediately (optionally for one sport) and returns the JobLogs id to track. No admin key needed — this is the app-facing refresh action. Poll GET /api/jobs/history?jobName=data_sync to track completion.
 *     tags: [System]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sport:
 *                 type: string
 *                 enum: [NBA, NFL, MLB, NHL]
 *                 description: Optional — sync only this sport (defaults to all active sports)
 *     responses:
 *       202:
 *         description: Job accepted — returns the JobLogs id to track
 *       400:
 *         description: Invalid sport
 */
syncRouter.post(
  '/refresh',
  createValidator(syncRefreshBodySchema, 'body'),
  refreshDataSync
);
