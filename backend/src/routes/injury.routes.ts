import { Router } from 'express';
import {
  getLeagueAlerts,
  getPlayerRisk,
  getPlayerRiskHistory,
  getTeamRisk,
} from '../controllers/injury.controller.js';

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
injuryRouter.get('/player/:playerId', getPlayerRisk);

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
injuryRouter.get('/team/:teamId', getTeamRisk);

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
injuryRouter.get('/alerts/:sport', getLeagueAlerts);

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
injuryRouter.get('/player/:playerId/history', getPlayerRiskHistory);
