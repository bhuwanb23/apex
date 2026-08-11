import { Router } from 'express';
import pkg from '../../package.json' with { type: 'json' };
import { env } from '../config/env.js';
import { sendSuccess } from '../utils/response.util.js';
import { healthRouter } from './health.routes.js';

export const routes = Router();

/**
 * @openapi
 * /:
 *   get:
 *     summary: API root
 *     description: Basic service metadata and pointer to the docs.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service metadata
 */
routes.get('/', (_req, res) => {
  sendSuccess(res, {
    name: env.APP_NAME,
    version: pkg.version,
    docs: '/api-docs',
    health: '/api/health',
  });
});

// Feature routes get mounted here as they are built, e.g.:
// routes.use('/api/sports', sportsRoutes)
// routes.use('/api/teams', teamsRoutes)
routes.use('/api/health', healthRouter);
