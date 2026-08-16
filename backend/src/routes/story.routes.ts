import { Router } from 'express';
import { getStory } from '../controllers/story.controller.js';
import { storyCacheMiddleware } from '../middleware/cache.middleware.js';
import {
  createValidator,
  storyModuleSportParamsSchema,
  storyQuerySchema,
} from '../middleware/validation.middleware.js';

export const storyRouter = Router();

/**
 * @openapi
 * /api/story/{module}/{sport}:
 *   get:
 *     summary: Story mode narrative
 *     description: Plain-English paragraph summarizing the current module view (cached 1h).
 *     tags: [Story]
 *     parameters:
 *       - in: path
 *         name: module
 *         required: true
 *         schema:
 *           type: string
 *           enum: [injury, decisions, momentum]
 *       - in: path
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NBA, NFL, MLB, NHL]
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [trainer, coach, analyst, fan, journalist]
 *           default: analyst
 *       - in: query
 *         name: entityId
 *         schema:
 *           type: string
 *         description: Player id (injury) or coach id (decisions) the story is about
 *       - in: query
 *         name: season
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Generated story with headline and tone
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   module: injury
 *                   sport: NBA
 *                   role: analyst
 *                   entityId: '4926'
 *                   entityName: LeBron James
 *                   storyText: LeBron James is at high injury risk this week. His minutes spiked 27% above his personal average over the last 5 games, pushing his risk score to 68/100 — firmly in the red zone. Trainers may want to manage his workload and watch for fatigue in the next back-to-back.
 *                   headlineText: LeBron James is at high injury risk this week
 *                   toneLabel: professional
 *                   generatedBy: python-story-generator
 *                   keyMetrics:
 *                     riskScore: 68
 *                     triggerMetric: ↑ Minutes
 *                     daysInRedZone: 3
 *                   generatedAt: '2026-08-16T09:00:00.000Z'
 *       400:
 *         description: Missing entityId for injury/decisions modules
 *       404:
 *         description: Entity or sport not found
 */
storyRouter.get(
  '/:module/:sport',
  createValidator(storyModuleSportParamsSchema, 'params'),
  createValidator(storyQuerySchema, 'query'),
  storyCacheMiddleware,
  getStory
);
