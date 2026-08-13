import { Router } from 'express';
import {
  searchCoaches,
  searchGames,
  searchPlayers,
  searchTeams,
} from '../controllers/search.controller.js';
import {
  searchPlayersCacheMiddleware,
  searchTeamsCacheMiddleware,
} from '../middleware/cache.middleware.js';
import {
  createValidator,
  gamesSearchQuerySchema,
  searchPlayersQuerySchema,
  simpleSearchQuerySchema,
} from '../middleware/validation.middleware.js';

export const searchRouter = Router();

/**
 * @openapi
 * /api/search/players:
 *   get:
 *     summary: Player autocomplete
 *     description: Fast typeahead player search (cached 1h).
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *       - in: query
 *         name: sport
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Matching players
 *       400:
 *         description: Query too short
 */
searchRouter.get(
  '/players',
  createValidator(searchPlayersQuerySchema, 'query'),
  searchPlayersCacheMiddleware,
  searchPlayers
);

/**
 * @openapi
 * /api/search/teams:
 *   get:
 *     summary: Team autocomplete
 *     description: Team search by name, city or abbreviation.
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: sport
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *     responses:
 *       200:
 *         description: Matching teams
 */
searchRouter.get(
  '/teams',
  createValidator(simpleSearchQuerySchema, 'query'),
  searchTeamsCacheMiddleware,
  searchTeams
);

/**
 * @openapi
 * /api/search/coaches:
 *   get:
 *     summary: Coach autocomplete
 *     description: Coach search for the decisions module.
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: sport
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *     responses:
 *       200:
 *         description: Matching coaches
 */
searchRouter.get(
  '/coaches',
  createValidator(simpleSearchQuerySchema, 'query'),
  searchCoaches
);

/**
 * @openapi
 * /api/search/games:
 *   get:
 *     summary: Game search
 *     description: Games filtered by team, sport, season and date range.
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: teamId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: sport
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *       - in: query
 *         name: season
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated game list
 */
searchRouter.get(
  '/games',
  createValidator(gamesSearchQuerySchema, 'query'),
  searchGames
);
