/**
 * Momentum module controllers (Phase 5, Step 7).
 * Thin request/response layer: validate → call service → send standard shapes.
 * Express 5 forwards rejected promises to the global error handler, so no
 * try/catch is needed here — services throw ApiError for known failures.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as momentumService from '../services/momentum.service.js';
import { SUPPORTED_SPORTS } from '../types/shared.types.js';
import { sendSuccess } from '../utils/response.util.js';
import { validateParams, validateQuery } from '../utils/validator.util.js';

const sportParamsSchema = z.object({
  sport: z.enum(SUPPORTED_SPORTS),
});

const gameParamsSchema = z.object({
  gameId: z.coerce.number().int().positive(),
});

const seasonQuerySchema = z.object({
  season: z.string().min(1).optional(),
});

const timeoutQuerySchema = z.object({
  consecutiveScores: z.coerce.number().int().min(0).max(10).default(0),
  scoreDiff: z.coerce.number().int(),
  timeRemaining: z.coerce.number().int().min(0).max(7200),
  period: z.coerce.number().int().min(1).max(10),
  timeoutsAvailable: z.coerce.number().int().min(0).max(3).default(2),
});

/** GET /api/momentum/analysis/:sport — Cox findings for a sport/season. */
export async function getMomentumAnalysis(req: Request, res: Response): Promise<void> {
  const { sport } = validateParams(sportParamsSchema, req);
  const { season } = validateQuery(seasonQuerySchema, req);
  const data = await momentumService.getMomentumAnalysis(sport, season);
  sendSuccess(res, data);
}

/** GET /api/momentum/game/:gameId — momentum timeline for one game. */
export async function getGameMomentum(req: Request, res: Response): Promise<void> {
  const { gameId } = validateParams(gameParamsSchema, req);
  const data = await momentumService.getGameMomentum(gameId);
  sendSuccess(res, data);
}

/** GET /api/momentum/comparison — all sports side by side. */
export async function getSportComparison(req: Request, res: Response): Promise<void> {
  const { season } = validateQuery(seasonQuerySchema, req);
  const data = await momentumService.getSportComparison(season);
  sendSuccess(res, data);
}

/** GET /api/momentum/timeout/:sport — timeout optimizer recommendation. */
export async function getTimeoutRecommendation(req: Request, res: Response): Promise<void> {
  const { sport } = validateParams(sportParamsSchema, req);
  const situation = validateQuery(timeoutQuerySchema, req);
  const data = await momentumService.getTimeoutRecommendation(sport, situation);
  sendSuccess(res, data);
}
