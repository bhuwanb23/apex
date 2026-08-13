/**
 * Story module controllers (Phase 5, Step 9).
 * Thin request/response layer: validate → call service → send standard shapes.
 * Validation happens in the route middleware (Phase 8 Step 5) — controllers
 * read the cleaned, typed data from req.validated* and never re-validate.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  storyModuleSportParamsSchema,
  storyQuerySchema,
} from '../middleware/validation.middleware.js';
import * as storyService from '../services/story.service.js';
import { sendSuccess } from '../utils/response.util.js';

/** GET /api/story/:module/:sport — cached or freshly generated narrative. */
export async function getStory(req: Request, res: Response): Promise<void> {
  const { module, sport } = req.validatedParams as z.infer<typeof storyModuleSportParamsSchema>;
  const { role, entityId, season } = req.validatedQuery as z.infer<typeof storyQuerySchema>;
  const data = await storyService.getStory(module, sport, role, entityId, season);
  sendSuccess(res, data);
}
