/**
 * Decision module controllers (Phase 5, Step 6).
 * Thin request/response layer: validate → call service → send standard shapes.
 * Express 5 forwards rejected promises to the global error handler, so no
 * try/catch is needed here — services throw ApiError for known failures.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as decisionsService from '../services/decisions.service.js';
import { DECISION_TYPE_FILTERS } from '../types/decision.types.js';
import { SUPPORTED_SPORTS } from '../types/shared.types.js';
import { sendSuccess } from '../utils/response.util.js';
import { validateParams, validateQuery } from '../utils/validator.util.js';

const sportParamsSchema = z.object({
  sport: z.enum(SUPPORTED_SPORTS),
});

const idParamsSchema = z.object({
  coachId: z.coerce.number().int().positive(),
});

const gameParamsSchema = z.object({
  gameId: z.coerce.number().int().positive(),
});

const leaderboardQuerySchema = z.object({
  season: z.string().min(1).optional(),
  decisionType: z.enum(DECISION_TYPE_FILTERS).default('all'),
  gameType: z.enum(['all', 'regular', 'playoff']).default('all'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const coachQuerySchema = z.object({
  season: z.string().min(1).optional(),
  decisionType: z.enum(DECISION_TYPE_FILTERS).default('all'),
  isOptimal: z
    .enum(['true', 'false'])
    .optional()
    .transform(v => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/decisions/coaches/:sport — ranked coach leaderboard. */
export async function getCoachLeaderboard(req: Request, res: Response): Promise<void> {
  const { sport } = validateParams(sportParamsSchema, req);
  const query = validateQuery(leaderboardQuerySchema, req);
  const data = await decisionsService.getCoachLeaderboard(sport, query);
  sendSuccess(res, data);
}

/** GET /api/decisions/coach/:coachId — drill-down for one coach. */
export async function getCoachDecisions(req: Request, res: Response): Promise<void> {
  const { coachId } = validateParams(idParamsSchema, req);
  const query = validateQuery(coachQuerySchema, req);
  const data = await decisionsService.getCoachDecisions(coachId, query);
  sendSuccess(res, data);
}

/** GET /api/decisions/game/:gameId — both coaches' decisions in one game. */
export async function getGameDecisions(req: Request, res: Response): Promise<void> {
  const { gameId } = validateParams(gameParamsSchema, req);
  const data = await decisionsService.getGameDecisions(gameId);
  sendSuccess(res, data);
}

/** GET /api/decisions/types/:sport — decision types for filter dropdowns. */
export async function listDecisionTypes(req: Request, res: Response): Promise<void> {
  const { sport } = validateParams(sportParamsSchema, req);
  const data = await decisionsService.getDecisionTypes(sport);
  sendSuccess(res, data);
}
