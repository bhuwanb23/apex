import axios from 'axios';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { logger } from '../config/logger.js';
import {
  AppError,
  DatabaseError,
  ExternalAPIError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';
import { categoryForError, trackError } from '../utils/error.tracker.js';
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

/** Catch-all for unmatched routes (Step 4.4). Points judges at Swagger docs. */
export const notFound: RequestHandler = (req, res) => {
  // Step 10.1 — 404s feed the notFoundErrors bucket.
  trackError('notFoundErrors', {
    message: 'Route not found',
    errorCode: 'ROUTE_NOT_FOUND',
    statusCode: 404,
    url: req.originalUrl,
  });
  sendError(res, 'Route not found', 404, 'ROUTE_NOT_FOUND', {
    suggestion: 'See /api/docs for available endpoints',
  });
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

// ---------------------------------------------------------------------------
// Step 3.2 — Prisma error conversion
// ---------------------------------------------------------------------------

/** Known Prisma request error codes → the error we surface. */
function classifyPrismaKnownError(err: Prisma.PrismaClientKnownRequestError): AppError {
  switch (err.code) {
    case 'P2002': {
      // Unique constraint violation — e.g. seeding the same externalId twice.
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : undefined;
      return new ValidationError(
        target
          ? `A record with this ${target} already exists`
          : 'A record with these values already exists',
        [
          {
            field: target ?? 'unique',
            message: 'Unique constraint violation',
            value: err.meta?.target,
          },
        ],
        { prismaCode: err.code }
      );
    }
    case 'P2025':
      // Record not found — the ORM-level equivalent of a 404.
      return new NotFoundError('The requested record was not found', 'record', {
        prismaCode: err.code,
      });
    case 'P2003':
      // Foreign key constraint — a related record is missing/invalid.
      return new ValidationError(
        'Invalid reference — the related record does not exist',
        [{ field: String(err.meta?.field_name ?? 'relation'), message: 'Invalid reference' }],
        { prismaCode: err.code }
      );
    default:
      return new DatabaseError('Database request failed', {
        operation: 'prisma-request',
        context: { prismaCode: err.code, meta: err.meta },
      });
  }
}

/**
 * Step 3.2/3.3 — classify any thrown value into the AppError family.
 * AppError → as-is. Prisma → DatabaseError/NotFoundError/ValidationError.
 * Axios → ExternalAPIError. Body-parser 4xx → ValidationError.
 * Anything else → generic 500 (never leaks internals).
 */
function classifyError(err: unknown): AppError {
  // Level 1 — our own error family passes through untouched.
  if (err instanceof AppError) return err;

  // Prisma errors (SQLite via better-sqlite3 adapter).
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return classifyPrismaKnownError(err);
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return new ValidationError('Invalid database input', [
      { field: '(query)', message: err.message.split('\n')[0] ?? 'Invalid query' },
    ]);
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    // Critical — the DB cannot connect at all. Needs immediate attention.
    logger.critical({ err }, 'Prisma failed to initialize — database unreachable');
    return new DatabaseError('Database connection could not be initialized', {
      operation: 'initialize',
    });
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    return new DatabaseError('Unknown database request error', {
      operation: 'unknown-request',
    });
  }

  // Axios errors — external sports API calls that reached the error handler.
  if (axios.isAxiosError(err)) {
    const apiStatus = err.response?.status;
    const retryAfterHeader = err.response?.headers?.['retry-after'];
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    const apiName = String(err.config?.baseURL ?? err.config?.url ?? 'external API');

    if (apiStatus === 429) {
      // Rate limited — tell the client when it may retry.
      return new ExternalAPIError('External API rate limit exceeded', {
        apiName,
        apiStatus,
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : 60,
      });
    }
    if (apiStatus === 401) {
      // API key problem on our side — log details internally, keep the client
      // response generic so we never leak credentials.
      logger.error({ err }, 'External API authentication failed — check API key');
      return new ExternalAPIError('External API authentication failed', { apiName, apiStatus });
    }
    if (apiStatus !== undefined) {
      // 503 (API down) and any 5xx — the API responded with an error.
      return new ExternalAPIError(
        apiStatus === 503
          ? 'External API is currently unavailable'
          : `External API returned an error (HTTP ${apiStatus})`,
        { apiName, apiStatus, retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined }
      );
    }
    // No HTTP response — we could not reach the external API at all.
    return new ExternalAPIError('External API is unreachable', { apiName });
  }

  // Body-parser & friends: 4xx client errors (malformed JSON → 400).
  const status =
    typeof (err as { status?: unknown } | null)?.status === 'number'
      ? (err as { status: number }).status
      : undefined;
  if (status !== undefined && status >= 400 && status < 500) {
    const message = err instanceof Error ? err.message : 'Bad Request';
    return new ValidationError(message, [{ field: '(body)', message }]);
  }

  // Level 3 — unknown error. Safe generic response, full log below.
  return new ApiError(500, 'Internal server error');
}

/**
 * Central error handler (Step 3.1). Express 5 forwards rejected promises here
 * automatically, so async handlers don't need try/catch wrappers.
 *
 *   Step 1 — classify the error (AppError / Prisma / Axios / unknown)
 *   Step 2 — log: operational → warn, non-operational → error with full stack
 *   Step 3 — build the safe response (never leaks internals)
 *   Step 4 — send it
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const classified = classifyError(err);

  // Step 2 — logging. Operational errors (bad input, not found, ML/API down)
  // are warnings; programmer errors (DB, unknown) are errors with full context.
  const logContext = { ...classified.getLogContext(), method: req.method, url: req.originalUrl };
  if (classified.isOperational) {
    logger.warn(logContext, classified.message);
  } else {
    logger.error(logContext, classified.message);
  }

  // Step 10.1 — feed the running error counters (per category, per hour).
  trackError(categoryForError(classified), {
    message: classified.message,
    errorCode: classified.errorCode,
    statusCode: classified.statusCode,
    url: req.originalUrl,
  });

  // Step 3+4 — safe response from the error's own toResponse() guarantee.
  res.status(classified.statusCode).json(classified.toResponse());
};
