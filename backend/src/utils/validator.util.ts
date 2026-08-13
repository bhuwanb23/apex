import type { Request } from 'express';
import { z } from 'zod';
import { ValidationError } from './errors.js';

/**
 * Inline request validation helpers (Phase 8 Step 5).
 *
 * The routes now validate via src/middleware/validation.middleware.ts (which
 * attaches cleaned data to req.validated*), but these helpers remain as a
 * fallback for handlers that validate inside the function body. They throw a
 * ValidationError carrying per-field errors (field, message, value) — the
 * exact shape the global error middleware serializes — instead of a bare 400.
 */

/** Validates req.body against a zod schema, throwing a 400 ValidationError. */
export function validateBody<T>(schema: z.ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw ValidationError.fromZod(result.error, 'Invalid request body', req.body);
  }
  return result.data;
}

/** Validates query params against a zod schema, throwing a 400 ValidationError. */
export function validateQuery<T>(schema: z.ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw ValidationError.fromZod(result.error, 'Invalid query parameters', req.query);
  }
  return result.data;
}

/** Validates route params against a zod schema, throwing a 400 ValidationError. */
export function validateParams<T>(schema: z.ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.params);
  if (!result.success) {
    throw ValidationError.fromZod(result.error, 'Invalid URL parameters', req.params);
  }
  return result.data;
}
