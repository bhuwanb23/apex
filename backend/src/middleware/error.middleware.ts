import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../config/logger.js';
import { sendError } from '../utils/response.util.js';

/**
 * Application error with an HTTP status code.
 * Throw/return this from route handlers to produce a structured error response.
 */
export class ApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, details);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, message, details);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, message);
  }
}

/** Catch-all for unmatched routes. */
export const notFound: RequestHandler = (req, res) => {
  sendError(res, 'Not Found', 404, 'NOT_FOUND');
};

/**
 * Central error handler. Express 5 forwards rejected promises here automatically,
 * so async handlers don't need try/catch wrappers.
 */
function errorCodeForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    default:
      return 'API_ERROR';
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    sendError(res, err.message, err.statusCode, errorCodeForStatus(err.statusCode));
    return;
  }

  // 4xx client errors from body-parser et al. (e.g. malformed JSON → 400)
  const status = typeof err?.status === 'number' ? err.status : undefined;
  if (status !== undefined && status >= 400 && status < 500) {
    sendError(res, err.message || 'Bad Request', status, 'BAD_REQUEST');
    return;
  }

  logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  // Never expose stack traces in production
  sendError(res, 'Internal Server Error', 500, 'INTERNAL_ERROR');
};
