import { Router } from 'express';
import { listPlayers, listSports, listTeams } from '../controllers/shared.controller.js';
import { teamListCacheMiddleware } from '../middleware/cache.middleware.js';

export const sharedRouter = Router();

/**
 * @openapi
 * /api/sports:
 *   get:
 *     summary: List all active sports
 *     description: Sports with their config and active status — populates the frontend sport selector.
 *     tags: [Sports]
 *     responses:
 *       200:
 *         description: Active sports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     sports:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                             example: NBA
 *                           abbreviation:
 *                             type: string
 *                           season:
 *                             type: string
 *                           isActive:
 *                             type: boolean
 *                     total:
 *                       type: integer
 */
sharedRouter.get('/', listSports);

/**
 * @openapi
 * /api/sports/{sport}/teams:
 *   get:
 *     summary: List teams for a sport
 *     description: All teams for a sport, sorted alphabetically — populates team selector dropdowns.
 *     tags: [Sports]
 *     parameters:
 *       - in: path
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *     responses:
 *       200:
 *         description: Teams for the sport
 *       404:
 *         description: Sport not found
 */
sharedRouter.get('/:sport/teams', teamListCacheMiddleware, listTeams);

/**
 * @openapi
 * /api/sports/{sport}/players:
 *   get:
 *     summary: List players for a sport
 *     description: Paginated active players with team info, optionally filtered by team.
 *     tags: [Sports]
 *     parameters:
 *       - in: path
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *       - in: query
 *         name: teamId
 *         schema:
 *           type: integer
 *         description: Optional team filter
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Paginated players
 *       404:
 *         description: Sport not found
 */
sharedRouter.get('/:sport/players', listPlayers);
