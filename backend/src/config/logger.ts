import { existsSync, mkdirSync } from 'node:fs';
import { destination, multistream, pino, transport } from 'pino';
import type { Logger, LogFn } from 'pino';
import { env } from './env.js';

/**
 * Phase 8 Step 6 — logger setup (8.2), on top of the pino stack this project
 * standardized on (the doc's Winston examples are adapted, not adopted).
 *
 * Step 6.1 — custom levels. pino's native numbers are reused so filtering and
 * tooling behave normally; we add the two plan-specific levels:
 *
 *   critical → 0   (pino `fatal`)   app-breaking (DB down, crash)
 *   error    → 1                     needs attention
 *   warn     → 2                     degraded service, retries, fallbacks
 *   info     → 3                     normal operations
 *   http     → 4   (custom, 25)      every HTTP request
 *   debug    → 5                     detailed development info
 *   silly    → 6   (custom, 5)       very verbose (below trace)
 *
 * LOG_LEVEL filters everything; production should log critical..http.
 *
 * Step 6.2 — transports:
 *   console       → colorized pretty output in dev, JSON in production
 *   logs/error.log      → error + critical only (rotated JSON)
 *   logs/combined.log   → everything allowed by LOG_LEVEL (rotated JSON)
 *   logs/http.log       → HTTP request lines only (via httpLogger)
 *   logs/exceptions.log → uncaughtException (process crashes)
 *   logs/rejections.log → unhandledRejection (logged, app keeps running)
 *
 * Step 6.4 — child loggers (jobLogger, mlLogger, dbLogger) add a `context`
 * field to every line so logs can be filtered by subsystem.
 */

// Ensure the logs directory exists (per the project layout)
if (!existsSync('logs')) {
  mkdirSync('logs', { recursive: true });
}

const errorFile = destination({ dest: 'logs/error.log', sync: true });
const combinedFile = destination({ dest: 'logs/combined.log', sync: true });
const httpFile = destination({ dest: 'logs/http.log', sync: true });
const exceptionsFile = destination({ dest: 'logs/exceptions.log', sync: true });
const rejectionsFile = destination({ dest: 'logs/rejections.log', sync: true });

export type AqxLogger = Logger<'http' | 'silly', boolean> & {
  /** Alias for pino's fatal — matches the plan's `critical` level name. */
  critical: LogFn;
};

/** The custom levels every AqxLogger instance carries (http + silly). */
export type AqxCustomLevels = 'http' | 'silly';

const base = pino(
  {
    level: env.LOG_LEVEL,
    // Step 6.2 — every JSON line carries service + environment context.
    base: { service: env.APP_NAME, environment: env.NODE_ENV },
    // Step 6.1 — the two plan-specific levels (http between info and debug).
    customLevels: { http: 25, silly: 5 },
  },
  multistream([
    {
      level: env.LOG_LEVEL,
      stream:
        env.NODE_ENV === 'production'
          ? destination(1) // JSON to stdout in production
          : transport({
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname',
              },
            }),
    },
    { level: env.LOG_LEVEL, stream: combinedFile },
    { level: 'error', stream: errorFile },
  ])
);

export const logger = base as AqxLogger;
// critical ≡ fatal (highest priority) — bound so it can be destructured.
logger.critical = logger.fatal.bind(logger);

/**
 * Dedicated HTTP request logger → logs/http.log. pino's multistream only
 * supports >= level filtering, so a separate instance (only ever called at
 * level http) is what keeps http.log to request lines only.
 */
export const httpLogger = pino(
  {
    level: 'http',
    customLevels: { http: 25 },
    base: { service: env.APP_NAME, environment: env.NODE_ENV },
  },
  httpFile
);

/**
 * Step 6.3 — process-level handlers (the Winston exception/rejection handler
 * equivalent): crash-level errors are captured to their own files.
 *   uncaughtException    → logged at fatal, then the process exits (1)
 *   unhandledRejection   → logged at error; the app keeps running
 */
process.on('uncaughtException', err => {
  const crashLogger = pino(
    { level: 'fatal', base: { service: env.APP_NAME, environment: env.NODE_ENV } },
    exceptionsFile
  );
  crashLogger.fatal({ err }, 'uncaughtException — process exiting');
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  const rejectionLogger = pino(
    { level: 'error', base: { service: env.APP_NAME, environment: env.NODE_ENV } },
    rejectionsFile
  );
  rejectionLogger.error(
    { err: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason },
    'unhandledRejection — continuing'
  );
});

// ---------------------------------------------------------------------------
// Step 6.4 — child loggers (each line gains a `context` field)
// ---------------------------------------------------------------------------

/** Every job-subsystem log carries `"context":"jobs"`. */
export const jobLogger = logger.child({ context: 'jobs' });
/** Every ML-client log carries `"context":"ml-client"`. */
export const mlLogger = logger.child({ context: 'ml-client' });
/** Every database log carries `"context":"database"`. */
export const dbLogger = logger.child({ context: 'database' });
