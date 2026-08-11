import { Router } from 'express'
import { prisma } from '../db/client.js'
import { memoryCache } from '../cache/memoryCache.js'
import { logger } from '../config/logger.js'

export const healthRouter = Router()

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Service health check
 *     description: Verifies the server, database (SQLite) and in-memory cache are operational.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: All systems operational
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 uptime:
 *                   type: number
 *                   description: Seconds since process start
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 db:
 *                   type: string
 *                   example: ok
 *                 cache:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: ok
 *                     keys:
 *                       type: integer
 *                     hits:
 *                       type: integer
 *                     misses:
 *                       type: integer
 *       503:
 *         description: A dependency (database) is unavailable
 */
healthRouter.get('/', async (_req, res) => {
  let dbOk = true
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (err) {
    dbOk = false
    logger.error({ err }, 'Health check failed: database unreachable')
  }

  const stats = memoryCache.getStats()

  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: dbOk ? 'ok' : 'error',
    cache: { status: 'ok', keys: stats.keys, hits: stats.hits, misses: stats.misses },
  })
})
