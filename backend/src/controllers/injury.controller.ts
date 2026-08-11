/**
 * Injury module controllers (Phase 5, Step 5).
 * Thin request/response layer: validate → call service → send standard shapes.
 * Express 5 forwards rejected promises to the global error handler, so no
 * try/catch is needed here — services throw ApiError for known failures.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as injuryService from '../services/injury.service.js';
import { SUPPORTED_SPORTS } from '../types/shared.types.js';
import { sendSuccess } from '../utils/response.util.js';
import { validateParams, validateQuery } from '../utils/validator.util.js';

const idParamsSchema = z.object({
  playerId: z.coerce.number().int().positive(),
});

const teamParamsSchema = z.object({
  teamId: z.coerce.number().int().positive(),
});

const sportParamsSchema = z.object({
  sport: z.enum(SUPPORTED_SPORTS),
});

const playerQuerySchema = z.object({
  recalculate: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
});

const alertsQuerySchema = z.object({
  zone: z.enum(['red', 'yellow']).default('red'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(60),
});

/** GET /api/injury/player/:playerId — full risk profile + context + trend. */
export async function getPlayerRisk(req: Request, res: Response): Promise<void> {
  const { playerId } = validateParams(idParamsSchema, req);
  const { recalculate } = validateQuery(playerQuerySchema, req);
  const data = await injuryService.getPlayerRisk(playerId, recalculate);
  sendSuccess(res, data);
}

/** GET /api/injury/team/:teamId — roster-wide risk summary. */
export async function getTeamRisk(req: Request, res: Response): Promise<void> {
  const { teamId } = validateParams(teamParamsSchema, req);
  const data = await injuryService.getTeamRisk(teamId);
  sendSuccess(res, data);
}

/** GET /api/injury/alerts/:sport — league-wide players in a zone. */
export async function getLeagueAlerts(req: Request, res: Response): Promise<void> {
  const { sport } = validateParams(sportParamsSchema, req);
  const { zone, limit } = validateQuery(alertsQuerySchema, req);
  const data = await injuryService.getLeagueAlerts(sport, zone, limit);
  sendSuccess(res, data);
}

/** GET /api/injury/player/:playerId/history — risk trend for the chart. */
export async function getPlayerRiskHistory(req: Request, res: Response): Promise<void> {
  const { playerId } = validateParams(idParamsSchema, req);
  const { days } = validateQuery(historyQuerySchema, req);
  const data = await injuryService.getPlayerRiskHistory(playerId, days);
  sendSuccess(res, data);
}
