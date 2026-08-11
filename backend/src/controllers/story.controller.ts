/**
 * Story module controllers (Phase 5, Step 9).
 * Thin request/response layer: validate → call service → send standard shapes.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as storyService from '../services/story.service.js';
import { SUPPORTED_SPORTS, USER_ROLES } from '../types/shared.types.js';
import { sendSuccess } from '../utils/response.util.js';
import { validateParams, validateQuery } from '../utils/validator.util.js';

const moduleParamsSchema = z.object({
  module: z.enum(['injury', 'decisions', 'momentum']),
  sport: z.enum(SUPPORTED_SPORTS),
});

const storyQuerySchema = z.object({
  role: z.enum(USER_ROLES).default('analyst'),
  entityId: z.string().min(1).optional(),
  season: z.string().min(1).optional(),
});

/** GET /api/story/:module/:sport — cached or freshly generated narrative. */
export async function getStory(req: Request, res: Response): Promise<void> {
  const { module, sport } = validateParams(moduleParamsSchema, req);
  const { role, entityId, season } = validateQuery(storyQuerySchema, req);
  const data = await storyService.getStory(module, sport, role, entityId, season);
  sendSuccess(res, data);
}
