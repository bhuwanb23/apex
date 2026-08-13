/**
 * Search module controllers (Phase 5, Step 8).
 * Thin request/response layer: validate → call service → send standard shapes.
 * Validation happens in the route middleware (Phase 8 Step 5) — controllers
 * read the cleaned, typed data from req.validated* and never re-validate.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  gamesSearchQuerySchema,
  searchPlayersQuerySchema,
  simpleSearchQuerySchema,
} from '../middleware/validation.middleware.js';
import * as searchService from '../services/search.service.js';
import { sendSuccess } from '../utils/response.util.js';

/** GET /api/search/players — player autocomplete (cached 1h). */
export async function searchPlayers(req: Request, res: Response): Promise<void> {
  const query = req.validatedQuery as z.infer<typeof searchPlayersQuerySchema>;
  const players = await searchService.searchPlayers(query.q, query);
  sendSuccess(res, { players });
}

/** GET /api/search/teams — team autocomplete with sport info. */
export async function searchTeams(req: Request, res: Response): Promise<void> {
  const query = req.validatedQuery as z.infer<typeof simpleSearchQuerySchema>;
  const teams = await searchService.searchTeams(query.q, query);
  sendSuccess(res, { teams });
}

/** GET /api/search/coaches — coach autocomplete for the decisions module. */
export async function searchCoaches(req: Request, res: Response): Promise<void> {
  const query = req.validatedQuery as z.infer<typeof simpleSearchQuerySchema>;
  const coaches = await searchService.searchCoaches(query.q, query);
  sendSuccess(res, { coaches });
}

/** GET /api/search/games — filtered game list for replay / drill-down. */
export async function searchGames(req: Request, res: Response): Promise<void> {
  const query = req.validatedQuery as z.infer<typeof gamesSearchQuerySchema>;
  const data = await searchService.searchGames(query);
  sendSuccess(res, data);
}
