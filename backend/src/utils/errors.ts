/**
 * Phase 8 — Error handling philosophy + custom error classes (Steps 1 & 2).
 *
 * ── STEP 1 — THE PHILOSOPHY (8.1) ────────────────────────────────────────────
 *
 * The core principle:
 *   • The app should NEVER crash because of bad data
 *   • The app should NEVER expose internal details to users
 *   • The app should ALWAYS return something useful, even when things go wrong
 *
 * Three levels of errors:
 *   Level 1 — Expected errors (handle gracefully, isOperational = true)
 *             Player not found → 404, invalid sport → 400, ML service down →
 *             cached data + warning, sports API rate limit → retry with backoff
 *   Level 2 — Degraded service errors (serve partial data)
 *             DB query fails → cached response if available; Python model fails
 *             → last known score from DB; one sport API down → other sports work
 *   Level 3 — Unknown errors (safe response + full internal log,
 *             isOperational = false)
 *             Unexpected exception → 500 with a safe generic message; never
 *             expose stack traces to the client; log everything internally;
 *             the app keeps running.
 *
 * The isOperational flag drives how an error is handled and logged:
 *   true  → expected, log at warn level, the app is working correctly
 *   false → programmer error / infrastructure bug, log at error level with
 *           full stack, may need developer attention
 *
 * Error response guarantee (every error can be serialized to this shape via
 * toResponse()):
 *   { success: false, status, message, errorCode, timestamp }
 *
 * Never returned to clients: stack traces, SQL queries, file paths, internal
 * variable names, raw error objects. `context` is for logs only — it is never
 * included in the client-facing response.
 *
 * ── STEP 2 — THE CLASSES ─────────────────────────────────────────────────────
 *
 * AppError (base) extends Error with:
 *   message        → human readable description
 *   statusCode     → HTTP status code (400, 404, 500, …)
 *   errorCode      → machine readable string for programmatic handling
 *   isOperational  → expected (true) vs programmer error (false)
 *   context        → optional extra data for logging (never sent to clients)
 *   exposeMessage  → whether `message` may be shown to clients
 *   timestamp      → when the error was created (ISO)
 *
 * Every specific error class extends AppError. They are used instead of bare
 * `new Error(...)` so routes, services and the global middleware (Step 3)
 * can classify any failure uniformly.
 */

/** One field-level validation failure — the shape ValidationError carries. */
export interface FieldError {
  field: string;
  message: string;
  /** What was provided (when available) — for the client to fix the input. */
  value?: unknown;
}

/** Client-facing error payload — the Step 1 response guarantee. */
export interface ErrorResponsePayload {
  success: false;
  status: number;
  message: string;
  errorCode: string;
  timestamp: string;
  /** Only present on ValidationError responses. */
  validationErrors?: FieldError[];
}

/** Generic message for non-operational errors — never leaks internal detail. */
export const DEFAULT_SAFE_MESSAGE = 'An internal error occurred';

export interface AppErrorOptions {
  statusCode: number;
  errorCode: string;
  isOperational: boolean;
  /** Extra data for logging — never included in the client response. */
  context?: Record<string, unknown>;
  /**
   * Whether `message` may be shown to clients. Defaults to `isOperational` —
   * expected errors are safe to describe; programmer errors are not.
   */
  exposeMessage?: boolean;
}

/**
 * Base application error. All specific error classes extend this, and the
 * global error middleware (Step 3) classifies any thrown value by checking
 * `instanceof AppError` first.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly isOperational: boolean;
  readonly context?: Record<string, unknown>;
  readonly exposeMessage: boolean;
  readonly timestamp: string;

  constructor(message: string, options: AppErrorOptions) {
    super(message);
    // new.target.name gives the concrete subclass name automatically
    // (ValidationError, NotFoundError, …), so we never forget to set it.
    this.name = new.target.name;
    this.statusCode = options.statusCode;
    this.errorCode = options.errorCode;
    this.isOperational = options.isOperational;
    this.context = options.context;
    this.exposeMessage = options.exposeMessage ?? options.isOperational;
    this.timestamp = new Date().toISOString();
  }

  /**
   * The Step 1 error response guarantee. Safe by construction: non-operational
   * errors always respond with DEFAULT_SAFE_MESSAGE instead of their internal
   * message, and `context` is never included.
   */
  toResponse(): ErrorResponsePayload {
    return {
      success: false,
      status: this.statusCode,
      message: this.exposeMessage ? this.message : DEFAULT_SAFE_MESSAGE,
      errorCode: this.errorCode,
      timestamp: this.timestamp,
    };
  }

  /**
   * Everything the logger should record for this error. Never sent to clients —
   * for Winston/pino structured logging (Step 6) and the error tracker (Step 10).
   */
  getLogContext(): Record<string, unknown> {
    const log: Record<string, unknown> = {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      context: this.context,
      timestamp: this.timestamp,
    };
    if (this.stack) log.stack = this.stack;
    return log;
  }
}

/** Type guard — true for any error in the AppError family. */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

// ---------------------------------------------------------------------------
// Specific error classes (Step 2.2)
// ---------------------------------------------------------------------------

/**
 * ValidationError — bad request parameters (invalid sport, missing required
 * field, invalid player ID format). 400 / VALIDATION_ERROR / operational.
 */
export class ValidationError extends AppError {
  readonly validationErrors: FieldError[];

  constructor(
    message: string,
    validationErrors: FieldError[] = [],
    context?: Record<string, unknown>
  ) {
    super(message, {
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      isOperational: true,
      context,
    });
    this.validationErrors = validationErrors;
  }

  /**
   * Convenience mapper for zod parse failures — turns each issue into a
   * FieldError ({ field: 'sport', message: '…', value: 'FOOTBALL' }).
   * Structural type on purpose: errors.ts stays dependency-free.
   */
  static fromZod(
    err: { issues: Array<{ path: ReadonlyArray<string | number>; message: string }> },
    message = 'Invalid request'
  ): ValidationError {
    const validationErrors: FieldError[] = err.issues.map(issue => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    return new ValidationError(message, validationErrors);
  }

  override toResponse(): ErrorResponsePayload {
    return { ...super.toResponse(), validationErrors: this.validationErrors };
  }
}

/**
 * NotFoundError — a resource does not exist (player, team, game, coach).
 * 404 / NOT_FOUND / operational.
 */
export class NotFoundError extends AppError {
  readonly resource: string;

  constructor(message: string, resource = 'resource', context?: Record<string, unknown>) {
    super(message, { statusCode: 404, errorCode: 'NOT_FOUND', isOperational: true, context });
    this.resource = resource;
  }
}

export interface MLServiceErrorOptions {
  /** Which Python endpoint failed, e.g. '/injury/compute-risk'. */
  mlEndpoint?: string;
  /** The HTTP status the Python service returned (when it responded). */
  mlStatusCode?: number;
  /** Did we serve cached/stale data instead of failing the request? */
  fallbackUsed?: boolean;
  /** Internal override — the unavailable variant passes its own code. */
  errorCode?: string;
}

/**
 * MLServiceError — the Python microservice responded with an error status.
 * 503 / ML_SERVICE_ERROR / operational.
 */
export class MLServiceError extends AppError {
  readonly mlEndpoint?: string;
  readonly mlStatusCode?: number;
  readonly fallbackUsed: boolean;

  constructor(message: string, options: MLServiceErrorOptions = {}) {
    super(message, {
      statusCode: 503,
      errorCode: options.errorCode ?? 'ML_SERVICE_ERROR',
      isOperational: true,
      context: options.mlEndpoint ? { mlEndpoint: options.mlEndpoint } : undefined,
    });
    this.mlEndpoint = options.mlEndpoint;
    this.mlStatusCode = options.mlStatusCode;
    this.fallbackUsed = options.fallbackUsed ?? false;
  }
}

export interface MLServiceUnavailableErrorOptions {
  /** When Python was last healthy (ISO) — for staleness reporting. */
  lastAvailableAt?: string;
  /** Did we serve cached/stale data instead of failing the request? */
  fallbackUsed?: boolean;
  /** Which Python endpoint could not be reached. */
  mlEndpoint?: string;
}

/**
 * MLServiceUnavailableError — the Python microservice could not be reached at
 * all (connection refused / timeout). 503 / ML_SERVICE_UNAVAILABLE / operational.
 */
export class MLServiceUnavailableError extends MLServiceError {
  readonly lastAvailableAt?: string;

  constructor(message: string, options: MLServiceUnavailableErrorOptions = {}) {
    super(message, {
      mlEndpoint: options.mlEndpoint,
      fallbackUsed: options.fallbackUsed,
      errorCode: 'ML_SERVICE_UNAVAILABLE',
    });
    this.lastAvailableAt = options.lastAvailableAt;
  }
}

export interface DatabaseErrorOptions {
  /** Which DB operation failed, e.g. 'findMany'. */
  operation?: string;
  /** Which table was involved, e.g. 'players'. */
  table?: string;
  context?: Record<string, unknown>;
}

/**
 * DatabaseError — Prisma/SQLite failure. 500 / DATABASE_ERROR / NOT operational.
 * The message must never contain the actual SQL — log it internally, respond
 * with the safe generic message.
 */
export class DatabaseError extends AppError {
  readonly operation?: string;
  readonly table?: string;

  constructor(message: string, options: DatabaseErrorOptions = {}) {
    super(message, {
      statusCode: 500,
      errorCode: 'DATABASE_ERROR',
      isOperational: false,
      context: {
        ...(options.operation ? { operation: options.operation } : {}),
        ...(options.table ? { table: options.table } : {}),
        ...(options.context ?? {}),
      },
    });
    this.operation = options.operation;
    this.table = options.table;
  }
}

export interface ExternalAPIErrorOptions {
  /** Which external API failed, e.g. 'BallDontLie'. */
  apiName?: string;
  /** What status the external API returned (when it responded). */
  apiStatus?: number;
  /** Seconds until a retry is allowed (from RateLimit / Retry-After). */
  retryAfter?: number;
  context?: Record<string, unknown>;
}

/**
 * ExternalAPIError — a sports API (BallDontLie, ESPN, …) failed.
 * 502 / EXTERNAL_API_ERROR / operational.
 */
export class ExternalAPIError extends AppError {
  readonly apiName?: string;
  readonly apiStatus?: number;
  readonly retryAfter?: number;

  constructor(message: string, options: ExternalAPIErrorOptions = {}) {
    super(message, {
      statusCode: 502,
      errorCode: 'EXTERNAL_API_ERROR',
      isOperational: true,
      context: options.context,
    });
    this.apiName = options.apiName;
    this.apiStatus = options.apiStatus;
    this.retryAfter = options.retryAfter;
  }
}

export interface RateLimitErrorOptions {
  /** Seconds until the client may retry. */
  retryAfter?: number;
  /** What the limit is. */
  limit?: number;
  context?: Record<string, unknown>;
}

/**
 * RateLimitError — the client hit our API too fast. 429 / RATE_LIMIT_EXCEEDED /
 * operational.
 */
export class RateLimitError extends AppError {
  readonly retryAfter?: number;
  readonly limit?: number;

  constructor(message: string, options: RateLimitErrorOptions = {}) {
    super(message, {
      statusCode: 429,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      isOperational: true,
      context: options.context,
    });
    this.retryAfter = options.retryAfter;
    this.limit = options.limit;
  }
}

/**
 * CacheError — node-cache or SQLite cache failure. 500 / CACHE_ERROR / NOT
 * operational. Usually caught silently and we fall through to a fresh compute,
 * so clients rarely see it.
 */
export class CacheError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { statusCode: 500, errorCode: 'CACHE_ERROR', isOperational: false, context });
  }
}

/**
 * AuthorizationError — missing/invalid admin key on protected routes
 * (job trigger, cache invalidation). 401 / UNAUTHORIZED / operational.
 */
export class AuthorizationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { statusCode: 401, errorCode: 'UNAUTHORIZED', isOperational: true, context });
  }
}
