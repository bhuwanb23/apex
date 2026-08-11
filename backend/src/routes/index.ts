import { Router } from 'express';
import pkg from '../../package.json' with { type: 'json' };
import { env } from '../config/env.js';
import { sendSuccess } from '../utils/response.util.js';
import { decisionsRouter } from './decisions.routes.js';
import { healthRouter } from './health.routes.js';
import { injuryRouter } from './injury.routes.js';
import { momentumRouter } from './momentum.routes.js';
import { searchRouter } from './search.routes.js';
import { sharedRouter } from './shared.routes.js';

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

// Health first (must always be reachable), then feature routers. Each router
// is mounted here as its Phase 5 step lands (see the placeholders below).
routes.use('/api/health', healthRouter);
routes.use('/api/sports', sharedRouter); // Step 4
routes.use('/api/injury', injuryRouter); // Step 5
routes.use('/api/decisions', decisionsRouter); // Step 6
routes.use('/api/momentum', momentumRouter);   // Step 7
routes.use('/api/search', searchRouter);       // Step 8

// Remaining Phase 5 routers mount here as their steps land:
// routes.use('/api/story', storyRouter);         // Step 9
