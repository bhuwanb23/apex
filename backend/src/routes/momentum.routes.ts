import { Router } from 'express';
import {
  getGameMomentum,
  getMomentumAnalysis,
  getSportComparison,
  getTimeoutRecommendation,
} from '../controllers/momentum.controller.js';
import {
  comparisonCacheMiddleware,
  momentumCacheMiddleware,
  timeoutCacheMiddleware,
} from '../middleware/cache.middleware.js';
import {
  createValidator,
  gameIdParamsSchema,
  seasonQuerySchema,
  sportParamsSchema,
  timeoutSituationSchema,
} from '../middleware/validation.middleware.js';

export const momentumRouter = Router();

/**
 * @openapi
 * /api/momentum/analysis/{sport}:
 *   get:
 *     summary: Momentum Cox analysis for a sport
 *     description: Season-level Cox model findings (cached 24h, recomputed from play-by-play when stale).
 *     tags: [Momentum]
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
 *     responses:
 *       200:
 *         description: Cox model findings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   sport: NBA
 *                   season: '2026-27'
 *                   verdict:
 *                     verdictLabel: inconclusive
 *                     isSignificant: false
 *                     shortExplanation: The numbers hint at momentum, but the effect is too weak to call it real.
 *                   statistics:
 *                     hazardCoefficient: 1.08
 *                     pValue: 0.089
 *                     confidenceIntervalLow: 0.97
 *                     confidenceIntervalHigh: 1.21
 *                     effectSize: 0.08
 *                     hazardRateChange: 8.2
 *                   context:
 *                     gamesAnalyzed: 1230
 *                     playsAnalyzed: 41120
 *                     streakThreshold: 3
 *                   plainExplanation: After a scoring run of 3 or more, the team that scored is 8% more likely to score next — but the effect is too weak to call statistically significant.
 *                   computedAt: '2026-08-16T09:00:00.000Z'
 *       404:
 *         description: Sport not found
 */
momentumRouter.get(
  '/analysis/:sport',
  createValidator(sportParamsSchema, 'params'),
  createValidator(seasonQuerySchema, 'query'),
  momentumCacheMiddleware,
  getMomentumAnalysis
);

/**
 * @openapi
 * /api/momentum/game/{gameId}:
 *   get:
 *     summary: Game momentum timeline
 *     description: Per-moment momentum timeline for the replay scrubber (computed on first request).
 *     tags: [Momentum]
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Momentum timeline with game context
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   game:
 *                     gameId: 5892
 *                     date: '2026-08-15'
 *                     homeTeam: Los Angeles Lakers
 *                     awayTeam: Golden State Warriors
 *                     finalScore: '112-104'
 *                   timeline:
 *                     homeTeamMomentum: [0, 12, 8, 34, 22, 48]
 *                     awayTeamMomentum: [0, 4, 18, 6, 26, 14]
 *                     events:
 *                       - gameTimeSeconds: 480
 *                         homeMomentumScore: 12
 *                         awayMomentumScore: 4
 *                         eventDescription: Anthony Davis dunk — Lakers take the lead
 *                       - gameTimeSeconds: 1210
 *                         homeMomentumScore: 8
 *                         awayMomentumScore: 18
 *                         eventDescription: Stephen Curry three — Warriors answer back
 *                   summary:
 *                     peakHomeMomentum: 48
 *                     peakAwayMomentum: 26
 *                     momentumShifts: 7
 *                     longestStreak:
 *                       length: 5
 *                       teamName: Los Angeles Lakers
 *                       startTime: 'Q2 - 06:14'
 *                   computedAt: '2026-08-16T09:00:00.000Z'
 *       404:
 *         description: Game not found
 */
momentumRouter.get('/game/:gameId', createValidator(gameIdParamsSchema, 'params'), getGameMomentum);

/**
 * @openapi
 * /api/momentum/comparison:
 *   get:
 *     summary: Sport comparison
 *     description: All sports side by side, sorted by effect size (missing sports computed in the background).
 *     tags: [Momentum]
 *     parameters:
 *       - in: query
 *         name: season
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comparison array sorted by effect size
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   sports:
 *                     - sport: NHL
 *                       verdictLabel: significant
 *                       hazardCoefficient: 1.22
 *                       pValue: 0.001
 *                       effectSize: 0.21
 *                       isSignificant: true
 *                       shortExplanation: Momentum is real in hockey — fast continuous play lets runs compound.
 *                     - sport: NBA
 *                       verdictLabel: inconclusive
 *                       hazardCoefficient: 1.08
 *                       pValue: 0.089
 *                       effectSize: 0.08
 *                       isSignificant: false
 *                       shortExplanation: The effect is too weak to call statistically significant.
 *                   computedAt: '2026-08-16T09:00:00.000Z'
 */
momentumRouter.get(
  '/comparison',
  createValidator(seasonQuerySchema, 'query'),
  comparisonCacheMiddleware,
  getSportComparison
);

/**
 * @openapi
 * /api/momentum/timeout/{sport}:
 *   get:
 *     summary: Timeout optimizer recommendation
 *     description: Should the coach call a timeout in this situation (precomputed scenario or live compute).
 *     tags: [Momentum]
 *     parameters:
 *       - in: path
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *       - in: query
 *         name: consecutiveScores
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: scoreDiff
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: timeRemaining
 *         required: true
 *         schema:
 *           type: integer
 *         description: Seconds remaining in the game
 *       - in: query
 *         name: period
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: timeoutsAvailable
 *         schema:
 *           type: integer
 *           default: 2
 *     responses:
 *       200:
 *         description: Timeout recommendation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   situation:
 *                     consecutiveScores: 3
 *                     scoreDiff: -7
 *                     timeRemaining: 300
 *                     period: 4
 *                     timeoutsAvailable: 2
 *                   recommendation:
 *                     shouldCallTimeout: true
 *                     stopProbabilityWith: 0.62
 *                     stopProbabilityWithout: 0.48
 *                     probabilityDiff: 0.14
 *                     confidenceLevel: High
 *                     recommendationText: After 3 consecutive opponent scores with 5 minutes remaining, calling a timeout has historically improved the stop rate by 14%.
 *                   basedOnSampleSize: 847
 *       404:
 *         description: Sport not found
 */
momentumRouter.get(
  '/timeout/:sport',
  createValidator(sportParamsSchema, 'params'),
  createValidator(timeoutSituationSchema, 'query'),
  timeoutCacheMiddleware,
  getTimeoutRecommendation
);
