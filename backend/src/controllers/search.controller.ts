/**
 * Search module controllers (Phase 5, Step 8).
 * Thin request/response layer: validate → call service → send standard shapes.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as searchService from '../services/search.service.js';
import { SUPPORTED_SPORTS } from '../types/shared.types.js';
import { sendSuccess } from '../utils/response.util.js';
import { validateQuery } from '../utils/validator.util.js';

const playersQuerySchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters'),
  sport: z.enum(SUPPORTED_SPORTS).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const simpleQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  sport: z.enum(SUPPORTED_SPORTS).optional(),
});

const gamesQuerySchema = z.object({
  teamId: z.coerce.number().int().positive().optional(),
  sport: z.enum(SUPPORTED_SPORTS).optional(),
  season: z.string().min(1).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/search/players — player autocomplete (cached 1h). */
export async function searchPlayers(req: Request, res: Response): Promise<void> {
  const query = validateQuery(playersQuerySchema, req);
  const players = await searchService.searchPlayers(query.q, query);
  sendSuccess(res, { players });
}

/** GET /api/search/teams — team autocomplete with sport info. */
export async function searchTeams(req: Request, res: Response): Promise<void> {
  const query = validateQuery(simpleQuerySchema, req);
  const teams = await searchService.searchTeams(query.q, query);
  sendSuccess(res, { teams });
}

/** GET /api/search/coaches — coach autocomplete for the decisions module. */
export async function searchCoaches(req: Request, res: Response): Promise<void> {
  const query = validateQuery(simpleQuerySchema, req);
  const coaches = await searchService.searchCoaches(query.q, query);
  sendSuccess(res, { coaches });
}

/** GET /api/search/games — filtered game list for replay / drill-down. */
export async function searchGames(req: Request, res: Response): Promise<void> {
  const query = validateQuery(gamesQuerySchema, req);
  const data = await searchService.searchGames(query);
  sendSuccess(res, data);
}
