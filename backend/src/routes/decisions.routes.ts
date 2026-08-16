import { Router } from 'express';
import {
  getCoachDecisions,
  getCoachLeaderboard,
  getGameDecisions,
  listDecisionTypes,
} from '../controllers/decisions.controller.js';
import {
  coachDetailCacheMiddleware,
  leaderboardCacheMiddleware,
} from '../middleware/cache.middleware.js';
import {
  coachIdParamsSchema,
  coachQuerySchema,
  createValidator,
  gameIdParamsSchema,
  leaderboardQuerySchema,
  sportParamsSchema,
} from '../middleware/validation.middleware.js';

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   sport: NFL
 *                   season: '2026'
 *                   decisionType: all
 *                   gameType: all
 *                   coaches:
 *                     - coachId: 12
 *                       coachName: Andy Reid
 *                       teamName: Kansas City Chiefs
 *                       totalDecisions: 148
 *                       optimalDecisions: 104
 *                       evRate: 70.3
 *                       avgEvDifference: 0.021
 *                       rank: 1
 *                       trend: up
 *                     - coachId: 14
 *                       coachName: Nick Sirianni
 *                       teamName: Philadelphia Eagles
 *                       totalDecisions: 141
 *                       optimalDecisions: 96
 *                       evRate: 68.1
 *                       avgEvDifference: 0.028
 *                       rank: 2
 *                       trend: same
 *                   generatedAt: '2026-08-16T09:00:00.000Z'
 *                   meta:
 *                     page: 1
 *                     limit: 30
 *                     total: 32
 *                     totalPages: 2
 *                     hasNext: true
 *       404:
 *         description: Sport not found
 */
decisionsRouter.get(
  '/coaches/:sport',
  createValidator(sportParamsSchema, 'params'),
  createValidator(leaderboardQuerySchema, 'query'),
  leaderboardCacheMiddleware,
  getCoachLeaderboard
);

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   coach:
 *                     coachId: 12
 *                     coachName: Andy Reid
 *                     teamName: Kansas City Chiefs
 *                     sport: NFL
 *                   summary:
 *                     rank: 1
 *                     evRate: 70.3
 *                     totalDecisions: 148
 *                     optimalDecisions: 104
 *                     avgEvDifference: 0.021
 *                   processVsOutcome:
 *                     goodProcessGoodOutcome: 52
 *                     goodProcessBadOutcome: 52
 *                     badProcessGoodOutcome: 18
 *                     badProcessBadOutcome: 26
 *                   decisions:
 *                     - id: 8341
 *                       gameId: 2104
 *                       coachId: 12
 *                       gameDate: '2026-08-15'
 *                       opponent: Buffalo Bills
 *                       decisionType: 4th_down
 *                       situation: 4th and 2 at the opponent 45, down 3 with 2:14 left in the 4th quarter
 *                       chosenAction: Go for it
 *                       evChosen: 0.54
 *                       evBest: 0.61
 *                       isOptimal: true
 *                       outcome: Patrick Mahomes converts with a 9-yard pass to Travis Kelce
 *                       outcomeSuccess: true
 *                       period: 4
 *                       clock: '2:14'
 *                       winProbabilityBefore: 0.43
 *                       alternativeActions:
 *                         - action: Go for it
 *                           ev: 0.61
 *                           probSuccess: 0.62
 *                           wpIfSuccess: 0.58
 *                           wpIfFailure: 0.31
 *                   meta:
 *                     page: 1
 *                     limit: 20
 *                     total: 148
 *       404:
 *         description: Coach not found
 */
decisionsRouter.get(
  '/coach/:coachId',
  createValidator(coachIdParamsSchema, 'params'),
  createValidator(coachQuerySchema, 'query'),
  coachDetailCacheMiddleware,
  getCoachDecisions
);

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   gameId: 2104
 *                   date: '2026-08-15'
 *                   homeCoach:
 *                     coachId: 12
 *                     name: Andy Reid
 *                     team: Kansas City Chiefs
 *                   awayCoach:
 *                     coachId: 18
 *                     name: Sean McDermott
 *                     team: Buffalo Bills
 *                   decisions:
 *                     - id: 8341
 *                       coachId: 12
 *                       decisionType: 4th_down
 *                       period: 4
 *                       clock: '2:14'
 *                       situation: 4th and 2 at the opponent 45, down 3
 *                       chosenAction: Go for it
 *                       evChosen: 0.54
 *                       evBest: 0.61
 *                       isOptimal: true
 *                       outcomeSuccess: true
 *       404:
 *         description: Game not found
 */
decisionsRouter.get(
  '/game/:gameId',
  createValidator(gameIdParamsSchema, 'params'),
  getGameDecisions
);

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   sport: NFL
 *                   types:
 *                     - key: 4th_down
 *                       label: 4th Down
 *                     - key: timeout
 *                       label: Timeout
 *                     - key: 2pt
 *                       label: 2-Point
 *       404:
 *         description: Sport not found
 */
decisionsRouter.get(
  '/types/:sport',
  createValidator(sportParamsSchema, 'params'),
  listDecisionTypes
);
