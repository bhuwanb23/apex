import { Router } from 'express';
import {
  getInjuryCounts,
  getLeagueAlerts,
  getPlayerRisk,
  getPlayerRiskHistory,
  getTeamReport,
  getTeamRisk,
  getTeamRiskHistory,
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   playerId: 4926
 *                   playerName: LeBron James
 *                   teamId: 149
 *                   teamName: Los Angeles Lakers
 *                   position: SF
 *                   sport: NBA
 *                   riskScore: 68
 *                   zone: red
 *                   triggerMetric: ↑ Minutes
 *                   minutesZScore: 2.31
 *                   distanceZScore: 1.12
 *                   intensityZScore: 1.54
 *                   backToBackFlag: true
 *                   baselineMeanMinutes: 28.5
 *                   baselineStdMinutes: 4.1
 *                   recentMeanMinutes: 36.1
 *                   recentMeanDistance: 4.2
 *                   recentMeanIntensity: 38
 *                   explanation: LeBron has played 27% more minutes than his personal average over the last 5 games.
 *                   windowStart: '2026-08-09'
 *                   windowEnd: '2026-08-15'
 *                   computedAt: '2026-08-16T09:00:00.000Z'
 *                   gameLogs:
 *                     - date: '2026-08-15'
 *                       minutesPlayed: 38
 *                       distanceCovered: 4.4
 *                       highIntensityEvents: 42
 *                       backToBack: false
 *                       isSpike: true
 *                   history:
 *                     - computedAt: '2026-08-15T09:00:00.000Z'
 *                       riskScore: 61
 *                       zone: red
 *                       triggerMetric: ↑ Minutes
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   teamId: 149
 *                   teamName: Los Angeles Lakers
 *                   sport: NBA
 *                   summary:
 *                     redCount: 2
 *                     yellowCount: 3
 *                     greenCount: 12
 *                   players:
 *                     - playerId: 4926
 *                       playerName: LeBron James
 *                       position: SF
 *                       riskScore: 68
 *                       zone: red
 *                       triggerMetric: ↑ Minutes
 *                   lastUpdated: '2026-08-16T09:00:00.000Z'
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   sport: NBA
 *                   zone: red
 *                   alerts:
 *                     - playerId: 4926
 *                       playerName: LeBron James
 *                       teamName: Los Angeles Lakers
 *                       position: SF
 *                       riskScore: 68
 *                       zone: red
 *                       triggerMetric: ↑ Minutes
 *                       explanation: LeBron has played 27% more minutes than his personal average over the last 5 games.
 *                       daysInZone: 3
 *                   generatedAt: '2026-08-16T09:00:00.000Z'
 *                   meta:
 *                     page: 1
 *                     limit: 20
 *                     total: 8
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   playerId: 4926
 *                   playerName: LeBron James
 *                   history:
 *                     - computedAt: '2026-08-15T09:00:00.000Z'
 *                       riskScore: 61
 *                       zone: red
 *                       triggerMetric: ↑ Minutes
 *                     - computedAt: '2026-08-14T09:00:00.000Z'
 *                       riskScore: 44
 *                       zone: yellow
 *                       triggerMetric: ↑ Distance
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
 * /api/injury/team/{teamId}/history:
 *   get:
 *     summary: Team-average risk trend
 *     description: Average risk score across the roster per snapshot day for the team trend chart.
 *     tags: [Injury]
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Team risk history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   teamId: 149
 *                   teamName: Los Angeles Lakers
 *                   sport: NBA
 *                   history:
 *                     - date: '2026-07-16'
 *                       avgRiskScore: 31.4
 *                       playersScored: 15
 *                       avgMinutesZ: 0.42
 *                     - date: '2026-07-22'
 *                       avgRiskScore: 33.8
 *                       playersScored: 15
 *                       avgMinutesZ: 0.51
 *       404:
 *         description: Team not found
 */
injuryRouter.get(
  '/team/:teamId/history',
  createValidator(teamIdParamsSchema, 'params'),
  createValidator(historyQuerySchema, 'query'),
  getTeamRiskHistory
);

/**
 * @openapi
 * /api/injury/team/{teamId}/report:
 *   get:
 *     summary: Team risk report (PDF)
 *     description: Generates and returns a PDF report of the whole roster with zone summary and risk scores.
 *     tags: [Injury]
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Team not found
 */
injuryRouter.get(
  '/team/:teamId/report',
  createValidator(teamIdParamsSchema, 'params'),
  getTeamReport
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   sport: NBA
 *                   counts:
 *                     red: 8
 *                     yellow: 14
 *                     green: 428
 *                   totalScored: 450
 *                   totalPlayers: 450
 *                   generatedAt: '2026-08-16T09:00:00.000Z'
 *       404:
 *         description: Sport not found
 */
injuryRouter.get('/counts/:sport', createValidator(sportParamsSchema, 'params'), getInjuryCounts);
