import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';
import { sendError } from '../utils/response.util.js';

/**
 * Application error with an HTTP status code.
 * Throw/return this from route handlers to produce a structured error response.
 *
 * Extends AppError (Phase 8 Step 2) so every error in the app is part of the
 * same family — statusCode, errorCode, isOperational, context, timestamp.
 * Specific Phase 8 classes (ValidationError, NotFoundError, …) live in
 * src/utils/errors.ts and should be preferred for new code.
 */
export class ApiError extends AppError {
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message, {
      statusCode,
      errorCode: errorCodeForStatus(statusCode),
      // 4xx are expected client errors (operational); 5xx are not.
      isOperational: statusCode < 500,
      context: details !== undefined ? { details } : undefined,
    });
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

/** Machine readable code for a generic status code (ApiError default). */
function errorCodeForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMIT_EXCEEDED';
    default:
      return 'API_ERROR';
  }
}

/**
 * Central error handler. Express 5 forwards rejected promises here automatically,
 * so async handlers don't need try/catch wrappers.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Phase 8 Step 2 family — respond with the error's own guaranteed shape
  // (errorCode + validationErrors for ValidationError, safe message for
  // non-operational errors). Never sends context or stack traces.
  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toResponse());
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
