import type { NextFunction, Request, Response } from 'express';
import { httpLogger, logger } from '../config/logger.js';

/**
 * HTTP request logging middleware (Phase 8 Steps 6.1 + 7).
 *
 * Every request is logged at the `http` level (between info and debug):
 *   • the main logger → colorized console + logs/combined.log (JSON)
 *   • the dedicated httpLogger → logs/http.log (request lines only)
 *
 * Response-time is measured per request; the line shape matches the plan's
 * example — method, URL, status, duration.
 */
export function loggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on('finish', () => {
    const line = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    };
    logger.http(line, 'request');
    httpLogger.http(line, 'request');
  });
  next();
}
