/**
 * Phase 8 Step 5 — request validation layer (5.1 + 5.2).
 *
 * Every incoming request is validated BEFORE it reaches the cache middleware
 * or the controller. Zod schemas are type-safe, coerce URL/query strings into
 * numbers, normalize case-insensitive input (sport → uppercase), and produce a
 * ValidationError with per-field details (field, message, value) on failure —
 * the exact shape the Phase 8 error guarantee expects.
 *
 * Step 5.2 — createValidator(schema, source):
 *   • extracts data from req[source] (body / query / params)
 *   • runs a Zod parse
 *   • on success: attaches the cleaned data to req.validatedQuery /
 *     req.validatedBody / req.validatedParams, AND writes the normalized
 *     values back onto the raw source. The write-back is what keeps the
 *     cache middleware's key builders (which read req.params / req.query)
 *     in lockstep with the controller — e.g. `/api/sports/nba/teams` gets
 *     req.params.sport normalized to 'NBA' so the cache key is `teams:NBA`,
 *     identical to an uppercase request.
 *   • on failure: throws ValidationError (via next) with field errors
 *
 * Controllers read the typed data from req.validated* and never re-validate.
 */
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { DECISION_TYPE_FILTERS } from '../types/decision.types.js';
import { SUPPORTED_SPORTS, USER_ROLES } from '../types/shared.types.js';
import { ValidationError } from '../utils/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express module augmentation
  namespace Express {
    interface Request {
      /** Cleaned/coerced data after query validation (Step 5.2). */
      validatedQuery: Record<string, unknown>;
      /** Cleaned/coerced data after body validation (Step 5.2). */
      validatedBody: Record<string, unknown>;
      /** Cleaned/coerced data after param validation (Step 5.2). */
      validatedParams: Record<string, unknown>;
    }
  }
}

export type ValidationSource = 'body' | 'query' | 'params';

// ---------------------------------------------------------------------------
// Step 5.1 — shared schemas
// ---------------------------------------------------------------------------

/** Positive integer — coerced from strings (URL params) with a clear message. */
export function positiveInt(field: string) {
  return z.coerce
    .number()
    .refine(v => Number.isInteger(v) && v > 0, {
      message: `${field} must be a positive integer`,
    });
}

/**
 * Sport parameter — case-insensitive on input, normalized to uppercase.
 * 'nba' and 'NBA' both validate; 'FOOTBALL' fails with the plan's message.
 */
export const sportSchema = z
  .string()
  .trim()
  .refine(v => (SUPPORTED_SPORTS as readonly string[]).includes(v.toUpperCase()), {
    message: 'sport must be one of: NBA, NFL, MLB, NHL',
  })
  .transform((v): (typeof SUPPORTED_SPORTS)[number] => v.toUpperCase() as (typeof SUPPORTED_SPORTS)[number]);

export const sportParamsSchema = z.object({ sport: sportSchema });

export const playerIdParamsSchema = z.object({ playerId: positiveInt('playerId') });
export const teamIdParamsSchema = z.object({ teamId: positiveInt('teamId') });
export const coachIdParamsSchema = z.object({ coachId: positiveInt('coachId') });
export const gameIdParamsSchema = z.object({ gameId: positiveInt('gameId') });

/** Season — '2024' or '2024-25' (YYYY or YYYY-YY). */
const SEASON_PATTERN = /^\d{4}(-\d{2})?$/;
export const seasonFormat = z
  .string()
  .trim()
  .refine(v => SEASON_PATTERN.test(v), { message: 'season format must be YYYY or YYYY-YY' });

/** Optional season filter (absent = default to the sport's current season). */
export const seasonQuerySchema = z.object({ season: seasonFormat.optional() });

/** Pagination — page ≥ 1 (default 1), limit ≥ 1 (default 20) clamped to 100. */
export const paginationSchema = z.object({
  page: positiveInt('page').default(1),
  limit: positiveInt('limit')
    .default(20)
    .transform(v => Math.min(v, 100)),
});

/** Date-range filter — ISO dates, start before end, max 365 days. */
const isoDate = z
  .string()
  .refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: 'date must be in YYYY-MM-DD format',
  })
  .transform(v => new Date(`${v}T00:00:00Z`));

/** Runs the date-range checks on an object carrying dateFrom/dateTo (optional). */
export function addDateRangeCheck<T extends { dateFrom?: Date; dateTo?: Date }>(
  schema: z.ZodType<T>
) {
  return schema.superRefine((val, ctx) => {
    const { dateFrom, dateTo } = val;
    if (!dateFrom || !dateTo) return;
    if (dateFrom.getTime() > dateTo.getTime()) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFrom'],
        message: 'startDate must be before endDate',
      });
    }
    const days = (dateTo.getTime() - dateFrom.getTime()) / 86_400_000;
    if (days > 365) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateTo'],
        message: 'date range must not exceed 365 days',
      });
    }
  });
}

/** Timeout optimizer situation — all ranges from Step 5.1. */
export const timeoutSituationSchema = z.object({
  consecutiveScores: z.coerce.number().int().min(0).max(10).default(0),
  scoreDiff: z.coerce.number().int().min(-50).max(50),
  timeRemaining: z.coerce.number().positive(),
  period: z.coerce.number().int().min(1).max(5),
  timeoutsAvailable: z.coerce.number().int().min(0).max(3).default(2),
});

// ---------------------------------------------------------------------------
// Module-specific query/body schemas
// ---------------------------------------------------------------------------

/** GET /api/injury/player/:playerId — recalculate stays a string on the wire
 *  (the cache middleware's skipRead checks `recalculate === 'true'`); the
 *  controller consumes the transformed boolean. */
export const playerRiskQuerySchema = z.object({
  recalculate: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
});

export const alertsQuerySchema = z.object({
  zone: z.enum(['red', 'yellow']).default('red'),
  limit: positiveInt('limit')
    .default(20)
    .transform(v => Math.min(v, 100)),
});

export const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(60),
});

export const leaderboardQuerySchema = z.object({
  season: seasonFormat.optional(),
  decisionType: z.enum(DECISION_TYPE_FILTERS).default('all'),
  gameType: z.enum(['all', 'regular', 'playoff']).default('all'),
  page: positiveInt('page').default(1),
  limit: positiveInt('limit')
    .default(30)
    .transform(v => Math.min(v, 100)),
});

export const coachQuerySchema = z.object({
  season: seasonFormat.optional(),
  decisionType: z.enum(DECISION_TYPE_FILTERS).default('all'),
  isOptimal: z
    .enum(['true', 'false'])
    .optional()
    .transform(v => (v === undefined ? undefined : v === 'true')),
  page: positiveInt('page').default(1),
  limit: positiveInt('limit')
    .default(20)
    .transform(v => Math.min(v, 100)),
});

export const storyModuleSportParamsSchema = z.object({
  module: z.enum(['injury', 'decisions', 'momentum']),
  sport: sportSchema,
});

export const storyQuerySchema = z.object({
  role: z.enum(USER_ROLES).default('analyst'),
  entityId: z.string().min(1).optional(),
  season: z.string().min(1).optional(),
});

export const searchPlayersQuerySchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters'),
  sport: sportSchema.optional(),
  limit: positiveInt('limit')
    .default(10)
    .transform(v => Math.min(v, 50)),
});

export const simpleSearchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  sport: sportSchema.optional(),
});

export const gamesSearchQuerySchema = addDateRangeCheck(
  z.object({
    teamId: positiveInt('teamId').optional(),
    sport: sportSchema.optional(),
    season: seasonFormat.optional(),
    dateFrom: isoDate.optional(),
    dateTo: isoDate.optional(),
    page: positiveInt('page').default(1),
    limit: positiveInt('limit')
      .default(20)
      .transform(v => Math.min(v, 100)),
  })
);

export const sharedPlayersQuerySchema = z.object({
  teamId: positiveInt('teamId').optional(),
  page: positiveInt('page').default(1),
  limit: positiveInt('limit')
    .default(50)
    .transform(v => Math.min(v, 100)),
});

export const jobHistoryQuerySchema = z.object({
  jobName: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const triggerJobBodySchema = z.object({
  jobName: z.string().min(1),
  sport: z.string().min(1).optional(),
});

export const cacheEntriesQuerySchema = z.object({
  dataType: z.string().min(1).optional(),
  sport: z.string().min(1).optional(),
  valid: z.enum(['true', 'false']).optional(),
});

export const cacheInvalidateBodySchema = z.object({
  key: z.string().min(1).optional(),
  sport: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  all: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Step 5.2 — middleware factory
// ---------------------------------------------------------------------------

/** Maps a source to the validated-* property the middleware fills in. */
const VALIDATED_KEY: Record<
  ValidationSource,
  'validatedBody' | 'validatedQuery' | 'validatedParams'
> = {
  body: 'validatedBody',
  query: 'validatedQuery',
  params: 'validatedParams',
};

/**
 * Writes the cleaned values back onto req[source] so the cache middleware's
 * key builders (which read req.params / req.query) agree with the controller.
 * Defaults are NOT written back — absent query params stay absent, so cache
 * keys built with `?? default` behave exactly as before validation existed.
 */
function writeBack(
  req: Request,
  source: ValidationSource,
  data: Record<string, unknown>,
  raw: unknown
): void {
  const target = req[source] as Record<string, unknown>;
  if (source === 'query') {
    const rawQuery = raw as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      if (!(key in rawQuery)) continue;
      target[key] = value;
    }
    return;
  }
  // Params are always present in the URL; body keys were provided by the
  // client. Either way every parsed value is safe to write back.
  Object.assign(target, data);
}

/** Express middleware that validates one request source and attaches/cleans
 *  the data. Throws ValidationError with field-level details on failure. */
export function createValidator(schema: z.ZodType, source: ValidationSource) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const raw: unknown = req[source] ?? {};
    const result = schema.safeParse(raw);
    if (!result.success) {
      const label =
        source === 'body' ? 'Invalid request body' : source === 'query' ? 'Invalid query parameters' : 'Invalid URL parameters';
      next(ValidationError.fromZod(result.error, label, raw));
      return;
    }
    const data = result.data as Record<string, unknown>;
    req[VALIDATED_KEY[source]] = data;
    writeBack(req, source, data, raw);
    next();
  };
}
