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
 *       404:
 *         description: Sport not found
 */
momentumRouter.get('/analysis/:sport', momentumCacheMiddleware, getMomentumAnalysis);

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
 *       404:
 *         description: Game not found
 */
momentumRouter.get('/game/:gameId', getGameMomentum);

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
 */
momentumRouter.get('/comparison', comparisonCacheMiddleware, getSportComparison);

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
 *       404:
 *         description: Sport not found
 */
momentumRouter.get('/timeout/:sport', timeoutCacheMiddleware, getTimeoutRecommendation);
