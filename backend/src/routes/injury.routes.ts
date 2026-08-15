import { Router } from 'express';
import {
  getInjuryCounts,
  getLeagueAlerts,
  getPlayerRisk,
  getPlayerRiskHistory,
  getTeamRisk,
} from '../controllers/injury.controller.js';
import {
  alertsCacheMiddleware,
  riskScoreCacheMiddleware,
  teamRiskCacheMiddleware,
} from '../middleware/cache.middleware.js';
import {
  alertsQuerySchema,
  createValidator,
  historyQuerySchema,
  playerIdParamsSchema,
  playerRiskQuerySchema,
  sportParamsSchema,
  teamIdParamsSchema,
} from '../middleware/validation.middleware.js';

export const injuryRouter = Router();

/**
 * @openapi
 * /api/injury/player/{playerId}:
 *   get:
 *     summary: Injury risk profile for a player
 *     description: Full risk profile with player context, workload summary and 10-score trend.
 *     tags: [Injury]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: recalculate
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Force a fresh ML computation instead of a cached score
 *     responses:
 *       200:
 *         description: Player risk profile
 *       400:
 *         description: Invalid playerId
 *       404:
 *         description: Player not found
 */
injuryRouter.get(
  '/player/:playerId',
  createValidator(playerIdParamsSchema, 'params'),
  createValidator(playerRiskQuerySchema, 'query'),
  riskScoreCacheMiddleware,
  getPlayerRisk
);

/**
 * @openapi
 * /api/injury/team/{teamId}:
 *   get:
 *     summary: Team risk dashboard
 *     description: Risk summary for the whole roster, sorted by risk score.
 *     tags: [Injury]
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Team risk summary
 *       404:
 *         description: Team not found
 */
injuryRouter.get(
  '/team/:teamId',
  createValidator(teamIdParamsSchema, 'params'),
  teamRiskCacheMiddleware,
  getTeamRisk
);

/**
 * @openapi
 * /api/injury/alerts/{sport}:
 *   get:
 *     summary: League-wide risk alerts
 *     description: All players currently in a zone across a league.
 *     tags: [Injury]
 *     parameters:
 *       - in: path
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *       - in: query
 *         name: zone
 *         schema:
 *           type: string
 *           enum: [red, yellow]
 *           default: red
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of alerts
 */
injuryRouter.get(
  '/alerts/:sport',
  createValidator(sportParamsSchema, 'params'),
  createValidator(alertsQuerySchema, 'query'),
  alertsCacheMiddleware,
  getLeagueAlerts
);

/**
 * @openapi
 * /api/injury/player/{playerId}/history:
 *   get:
 *     summary: Player risk score history
 *     description: Risk score snapshots for the trend chart.
 *     tags: [Injury]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 60
 *     responses:
 *       200:
 *         description: Risk history
 *       404:
 *         description: Player not found
 */
injuryRouter.get(
  '/player/:playerId/history',
  createValidator(playerIdParamsSchema, 'params'),
  createValidator(historyQuerySchema, 'query'),
  getPlayerRiskHistory
);

/**
 * @openapi
 * /api/injury/counts/{sport}:
 *   get:
 *     summary: League-wide risk zone counts
 *     description: Red / yellow / green counts across the whole league (not just the first page of alerts) plus the roster size.
 *     tags: [Injury]
 *     parameters:
 *       - in: path
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *     responses:
 *       200:
 *         description: Zone counts
 *       404:
 *         description: Sport not found
 */
injuryRouter.get('/counts/:sport', createValidator(sportParamsSchema, 'params'), getInjuryCounts);
