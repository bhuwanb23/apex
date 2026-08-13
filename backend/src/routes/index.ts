import { Router, type Router as RouterType } from 'express';
import pkg from '../../package.json' with { type: 'json' };
import { env } from '../config/env.js';
import { sendSuccess } from '../utils/response.util.js';
import { cacheRouter } from './cache.routes.js';
import { decisionsRouter } from './decisions.routes.js';
import { healthRouter } from './health.routes.js';
import { injuryRouter } from './injury.routes.js';
import { jobsRouter } from './jobs.routes.js';
import { logsRouter } from './logs.routes.js';
import { momentumRouter } from './momentum.routes.js';
import { searchRouter } from './search.routes.js';
import { sharedRouter } from './shared.routes.js';
import { storyRouter } from './story.routes.js';

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
// is mounted via the routeMounts table so the Phase 8 Step 11.3 startup
// banner can list every registered route dynamically.
/**
 * Every feature router with its mount path. Used both to mount the routes and
 * (via collectRoutesSummary) to print the registered routes at startup.
 */
export const routeMounts = [
  { path: '/api/health', router: healthRouter },
  { path: '/api/sports', router: sharedRouter }, // Step 4
  { path: '/api/injury', router: injuryRouter }, // Step 5
  { path: '/api/decisions', router: decisionsRouter }, // Step 6
  { path: '/api/momentum', router: momentumRouter }, // Step 7
  { path: '/api/search', router: searchRouter }, // Step 8
  { path: '/api/story', router: storyRouter }, // Step 9
  { path: '/api/jobs', router: jobsRouter }, // Phase 6 Step 10 — job control
  { path: '/api/cache', router: cacheRouter }, // Phase 7 Step 9 — cache monitoring
  { path: '/api/logs', router: logsRouter }, // Phase 8 Step 11 — log viewer
] as const;

for (const { path, router } of routeMounts) {
  routes.use(path, router);
}

/**
 * Phase 8 Step 11.3 — every registered route as "METHOD path" lines for the
 * startup banner. Walks the root router + each mounted feature router.
 */
export function collectRoutesSummary(): string[] {
  const out: string[] = [];
  const walk = (router: RouterType, prefix: string): void => {
    for (const layer of router.stack) {
      const route = (layer as { route?: { path?: string; methods?: Record<string, boolean> } })
        .route;
      if (route?.path) {
        const methods = Object.keys(route.methods ?? {})
          .filter(m => m !== '_all')
          .map(m => m.toUpperCase())
          .join(', ');
        out.push(`${methods} ${prefix}${route.path}`);
      }
    }
  };
  walk(routes, '');
  for (const { path, router } of routeMounts) walk(router, path);
  return out.sort();
}
