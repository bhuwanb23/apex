/**
 * Momentum module controllers (Phase 5, Step 7).
 * Thin request/response layer: validate → call service → send standard shapes.
 * Validation happens in the route middleware (Phase 8 Step 5) — controllers
 * read the cleaned, typed data from req.validated* and never re-validate.
 * Express 5 forwards rejected promises to the global error handler, so no
 * try/catch is needed here — services throw AppError for known failures.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  gameIdParamsSchema,
  seasonQuerySchema,
  sportParamsSchema,
  timeoutSituationSchema,
} from '../middleware/validation.middleware.js';
import * as momentumService from '../services/momentum.service.js';
import { sendSuccess } from '../utils/response.util.js';

/** GET /api/momentum/analysis/:sport — Cox findings for a sport/season. */
export async function getMomentumAnalysis(req: Request, res: Response): Promise<void> {
  const { sport } = req.validatedParams as z.infer<typeof sportParamsSchema>;
  const { season } = req.validatedQuery as z.infer<typeof seasonQuerySchema>;
  const data = await momentumService.getMomentumAnalysis(sport, season);
  sendSuccess(res, data);
}

/** GET /api/momentum/game/:gameId — momentum timeline for one game. */
export async function getGameMomentum(req: Request, res: Response): Promise<void> {
  const { gameId } = req.validatedParams as z.infer<typeof gameIdParamsSchema>;
  const data = await momentumService.getGameMomentum(gameId);
  sendSuccess(res, data);
}

/** GET /api/momentum/comparison — all sports side by side. */
export async function getSportComparison(req: Request, res: Response): Promise<void> {
  const { season } = req.validatedQuery as z.infer<typeof seasonQuerySchema>;
  const data = await momentumService.getSportComparison(season);
  sendSuccess(res, data);
}

/** GET /api/momentum/timeout/:sport — timeout optimizer recommendation. */
export async function getTimeoutRecommendation(req: Request, res: Response): Promise<void> {
  const { sport } = req.validatedParams as z.infer<typeof sportParamsSchema>;
  const situation = req.validatedQuery as z.infer<typeof timeoutSituationSchema>;
  const data = await momentumService.getTimeoutRecommendation(sport, situation);
  sendSuccess(res, data);
}
