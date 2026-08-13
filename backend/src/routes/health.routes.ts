import { Router } from 'express';
import { healthCheck } from '../controllers/health.controller.js';
import { getErrorSummary } from '../utils/error.tracker.js';
import { sendSuccess } from '../utils/response.util.js';

export const healthRouter = Router();

/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Service health check
 *     description: Verifies the server, database (SQLite), cache and Python ML service are operational.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Health details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: ok
 *                     environment:
 *                       type: string
 *                     version:
 *                       type: string
 *                     uptime:
 *                       type: number
 *                     services:
 *                       type: object
 *                       properties:
 *                         database:
 *                           type: string
 *                           example: connected
 *                         cache:
 *                           type: string
 *                         mlService:
 *                           type: string
 */
healthRouter.get('/', healthCheck);

/**
 * @openapi
 * /api/health/errors:
 *   get:
 *     summary: Error tracking summary
 *     description: Phase 8 Step 10 — per-category error counts and rates for the current hour, the last 5 errors, and an overall health status.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Error summary (counts, rates, recentErrors, status)
 */
healthRouter.get('/errors', (_req, res) => {
  sendSuccess(res, getErrorSummary());
});
