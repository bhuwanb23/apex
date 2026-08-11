/**
 * Shared module controllers (Phase 5, Step 4).
 * Thin request/response layer: validate → call service → send standard shapes.
 * Express 5 forwards rejected promises to the global error handler, so no
 * try/catch is needed here — services throw ApiError for known failures.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as sharedService from '../services/shared.service.js';
import { SUPPORTED_SPORTS } from '../types/shared.types.js';
import { sendPaginated, sendSuccess } from '../utils/response.util.js';
import { validateParams, validateQuery } from '../utils/validator.util.js';

const sportParamsSchema = z.object({
  sport: z.enum(SUPPORTED_SPORTS),
});

const playersQuerySchema = z.object({
  teamId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** GET /api/sports — all active sports with their config. */
export async function listSports(_req: Request, res: Response): Promise<void> {
  const sports = await sharedService.getSports();
  sendSuccess(res, { sports, total: sports.length });
}

/** GET /api/sports/:sport/teams — teams for a sport, sorted by name. */
export async function listTeams(req: Request, res: Response): Promise<void> {
  const { sport } = validateParams(sportParamsSchema, req);
  const teams = await sharedService.getTeamsForSport(sport);
  sendSuccess(res, { sport, teams, total: teams.length });
}

/** GET /api/sports/:sport/players — paginated active players with team info. */
export async function listPlayers(req: Request, res: Response): Promise<void> {
  const { sport } = validateParams(sportParamsSchema, req);
  const query = validateQuery(playersQuerySchema, req);
  const { players, total } = await sharedService.getPlayersForSport(sport, query);
  sendPaginated(res, players, query.page, query.limit, total);
}
