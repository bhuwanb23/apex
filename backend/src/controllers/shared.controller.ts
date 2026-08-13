/**
 * Shared module controllers (Phase 5, Step 4).
 * Thin request/response layer: validate → call service → send standard shapes.
 * Validation happens in the route middleware (Phase 8 Step 5) — controllers
 * read the cleaned, typed data from req.validated* and never re-validate.
 * Express 5 forwards rejected promises to the global error handler, so no
 * try/catch is needed here — services throw AppError for known failures.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  sharedPlayersQuerySchema,
  sportParamsSchema,
} from '../middleware/validation.middleware.js';
import * as sharedService from '../services/shared.service.js';
import { sendPaginated, sendSuccess } from '../utils/response.util.js';

/** GET /api/sports — all active sports with their config. */
export async function listSports(_req: Request, res: Response): Promise<void> {
  const sports = await sharedService.getSports();
  sendSuccess(res, { sports, total: sports.length });
}

/** GET /api/sports/:sport/teams — teams for a sport, sorted by name. */
export async function listTeams(req: Request, res: Response): Promise<void> {
  const { sport } = req.validatedParams as z.infer<typeof sportParamsSchema>;
  const teams = await sharedService.getTeamsForSport(sport);
  sendSuccess(res, { sport, teams, total: teams.length });
}

/** GET /api/sports/:sport/players — paginated active players with team info. */
export async function listPlayers(req: Request, res: Response): Promise<void> {
  const { sport } = req.validatedParams as z.infer<typeof sportParamsSchema>;
  const query = req.validatedQuery as z.infer<typeof sharedPlayersQuerySchema>;
  const { players, total } = await sharedService.getPlayersForSport(sport, query);
  sendPaginated(res, players, query.page, query.limit, total);
}
