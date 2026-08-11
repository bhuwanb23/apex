import type { Request, Response } from 'express';
import pkg from '../../package.json' with { type: 'json' };
import { memoryCache } from '../cache/memoryCache.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../db/client.js';
import { mlClient } from '../ml/ml.client.js';
import { sendSuccess } from '../utils/response.util.js';

/**
 * GET /api/health — proves the server, database, cache and ML service are up.
 */
export async function healthCheck(_req: Request, res: Response): Promise<void> {
  let database = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'connected';
  } catch (err) {
    logger.error({ err }, 'Health check: database unreachable');
  }

  // node-cache is in-memory — "connected" whenever the instance exists
  const cache = memoryCache.getStats() ? 'connected' : 'disconnected';

  // All Python communication goes through the ML client (Phase 5, Step 10).
  const mlService = (await mlClient.checkHealth()) ? 'connected' : 'disconnected';

  const isHealthy = database === 'connected';
  sendSuccess(
    res,
    {
      status: isHealthy ? 'ok' : 'degraded',
      environment: env.NODE_ENV,
      version: pkg.version,
      uptime: process.uptime(),
      services: { database, cache, mlService },
    },
    undefined,
    isHealthy ? 200 : 503
  );
}
