import { Router } from 'express'
import { healthRouter } from './health.js'
import pkg from '../../package.json' with { type: 'json' }

export const routes = Router()

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
  res.json({
    name: 'AQX Sports Intelligence API',
    version: pkg.version,
    docs: '/api-docs',
    health: '/health',
  })
})

// Feature routes get mounted here as they are built, e.g.:
// routes.use('/leagues', leaguesRouter)
// routes.use('/matches', matchesRouter)
routes.use('/health', healthRouter)
