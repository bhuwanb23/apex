/**
 * Decision module controllers (Phase 5, Step 6).
 * Thin request/response layer: validate → call service → send standard shapes.
 * Validation happens in the route middleware (Phase 8 Step 5) — controllers
 * read the cleaned, typed data from req.validated* and never re-validate.
 * Express 5 forwards rejected promises to the global error handler, so no
 * try/catch is needed here — services throw AppError for known failures.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  coachIdParamsSchema,
  coachQuerySchema,
  gameIdParamsSchema,
  leaderboardQuerySchema,
  sportParamsSchema,
} from '../middleware/validation.middleware.js';
import * as decisionsService from '../services/decisions.service.js';
import { sendSuccess } from '../utils/response.util.js';

/** GET /api/decisions/coaches/:sport — ranked coach leaderboard. */
export async function getCoachLeaderboard(req: Request, res: Response): Promise<void> {
  const { sport } = req.validatedParams as z.infer<typeof sportParamsSchema>;
  const query = req.validatedQuery as z.infer<typeof leaderboardQuerySchema>;
  const data = await decisionsService.getCoachLeaderboard(sport, query);
  sendSuccess(res, data);
}

/** GET /api/decisions/coach/:coachId — drill-down for one coach. */
export async function getCoachDecisions(req: Request, res: Response): Promise<void> {
  const { coachId } = req.validatedParams as z.infer<typeof coachIdParamsSchema>;
  const query = req.validatedQuery as z.infer<typeof coachQuerySchema>;
  const data = await decisionsService.getCoachDecisions(coachId, query);
  sendSuccess(res, data);
}

/** GET /api/decisions/game/:gameId — both coaches' decisions in one game. */
export async function getGameDecisions(req: Request, res: Response): Promise<void> {
  const { gameId } = req.validatedParams as z.infer<typeof gameIdParamsSchema>;
  const data = await decisionsService.getGameDecisions(gameId);
  sendSuccess(res, data);
}

/** GET /api/decisions/types/:sport — decision types for filter dropdowns. */
export async function listDecisionTypes(req: Request, res: Response): Promise<void> {
  const { sport } = req.validatedParams as z.infer<typeof sportParamsSchema>;
  const data = await decisionsService.getDecisionTypes(sport);
  sendSuccess(res, data);
}
