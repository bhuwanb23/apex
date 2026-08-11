import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';

/**
 * HTTP request logging middleware (morgan equivalent).
 * Logs method, URL, status and response time for every request.
 */
export const loggerMiddleware = pinoHttp({ logger });
