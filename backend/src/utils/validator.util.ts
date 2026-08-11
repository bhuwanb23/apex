import type { Request } from 'express';
import { z } from 'zod';
import { ApiError } from '../middleware/error.middleware.js';

/** Validates req.body against a zod schema, throwing a 400 ApiError on failure. */
export function validateBody<T>(schema: z.ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw ApiError.badRequest('Invalid request body', result.error.issues);
  }
  return result.data;
}

/** Validates query params against a zod schema, throwing a 400 ApiError on failure. */
export function validateQuery<T>(schema: z.ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw ApiError.badRequest('Invalid query parameters', result.error.issues);
  }
  return result.data;
}

/** Validates route params against a zod schema, throwing a 400 ApiError on failure. */
export function validateParams<T>(schema: z.ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.params);
  if (!result.success) {
    throw ApiError.badRequest('Invalid URL parameters', result.error.issues);
  }
  return result.data;
}
