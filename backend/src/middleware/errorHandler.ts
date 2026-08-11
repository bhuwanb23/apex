import type { ErrorRequestHandler, RequestHandler } from 'express'
import { logger } from '../config/logger.js'

/**
 * Application error with an HTTP status code.
 * Throw/return this from route handlers to produce a structured error response.
 */
export class ApiError extends Error {
  statusCode: number
  details?: unknown

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.details = details
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, details)
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message)
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, message, details)
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, message)
  }
}

/** Catch-all for unmatched routes. */
export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl })
}

/**
 * Central error handler. Express 5 forwards rejected promises here automatically,
 * so async handlers don't need try/catch wrappers.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details })
    return
  }

  // 4xx client errors from body-parser et al. (e.g. malformed JSON → 400)
  const status = typeof err?.status === 'number' ? err.status : undefined
  if (status !== undefined && status >= 400 && status < 500) {
    res.status(status).json({ error: err.message || 'Bad Request' })
    return
  }

  logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error')
  res.status(500).json({ error: 'Internal Server Error' })
}
