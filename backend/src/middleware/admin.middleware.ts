/**
 * Shared admin-key protection (Phase 6 Step 10 / Phase 7 Step 9).
 *
 * The docs specify a simple X-Admin-Key header check for mutating management
 * endpoints — not full auth. The same check protects POST /api/jobs/trigger
 * and DELETE /api/cache/invalidate, so it lives here instead of being
 * duplicated per controller.
 */
import type { Request } from 'express';
import { env } from '../config/env.js';
import { ApiError } from './error.middleware.js';

/** Throws 503 when JOB_CONTROL_ADMIN_KEY is unset, 403 on missing/mismatched key. */
export function assertAdminKey(req: Request): void {
  const configured = env.JOB_CONTROL_ADMIN_KEY;
  if (!configured) {
    throw new ApiError(503, `Admin actions are disabled — JOB_CONTROL_ADMIN_KEY is not configured`);
  }
  const provided = req.header('x-admin-key');
  if (!provided || provided !== configured) {
    throw new ApiError(403, 'Invalid or missing X-Admin-Key header');
  }
}
