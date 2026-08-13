import { Router } from 'express';
import {
  getCoachDecisions,
  getCoachLeaderboard,
  getGameDecisions,
  listDecisionTypes,
} from '../controllers/decisions.controller.js';
import { leaderboardCacheMiddleware } from '../middleware/cache.middleware.js';

export const decisionsRouter = Router();

/**
 * @openapi
 * /api/decisions/coaches/{sport}:
 *   get:
 *     summary: Coach leaderboard
 *     description: All coaches ranked by EV rate for a sport, with optional filters.
 *     tags: [Decisions]
 *     parameters:
 *       - in: path
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *       - in: query
 *         name: season
 *         schema:
 *           type: string
 *         description: Season identifier, defaults to the sport's current season
 *       - in: query
 *         name: decisionType
 *         schema:
 *           type: string
 *           enum: [all, 4th_down, timeout, 2pt]
 *           default: all
 *       - in: query
 *         name: gameType
 *         schema:
 *           type: string
 *           enum: [all, regular, playoff]
 *           default: all
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Ranked leaderboard with pagination
 *       404:
 *         description: Sport not found
 */
decisionsRouter.get('/coaches/:sport', leaderboardCacheMiddleware, getCoachLeaderboard);

/**
 * @openapi
 * /api/decisions/coach/{coachId}:
 *   get:
 *     summary: Coach decision drill-down
 *     description: Every decision for one coach with game context, summary and process-vs-outcome counts.
 *     tags: [Decisions]
 *     parameters:
 *       - in: path
 *         name: coachId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: season
 *         schema:
 *           type: string
 *       - in: query
 *         name: decisionType
 *         schema:
 *           type: string
 *           enum: [all, 4th_down, timeout, 2pt]
 *           default: all
 *       - in: query
 *         name: isOptimal
 *         schema:
 *           type: boolean
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
 *         description: Coach decisions with summary
 *       404:
 *         description: Coach not found
 */
decisionsRouter.get('/coach/:coachId', getCoachDecisions);

/**
 * @openapi
 * /api/decisions/game/{gameId}:
 *   get:
 *     summary: Game decisions
 *     description: All coaching decisions made in one game, split by coach.
 *     tags: [Decisions]
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Both coaches' decisions for the game
 *       404:
 *         description: Game not found
 */
decisionsRouter.get('/game/:gameId', getGameDecisions);

/**
 * @openapi
 * /api/decisions/types/{sport}:
 *   get:
 *     summary: Decision types for a sport
 *     description: Available decision categories from the sport config, for filter dropdowns.
 *     tags: [Decisions]
 *     parameters:
 *       - in: path
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *     responses:
 *       200:
 *         description: Decision types array
 *       404:
 *         description: Sport not found
 */
decisionsRouter.get('/types/:sport', listDecisionTypes);
