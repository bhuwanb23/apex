import { Router } from 'express';
import { getStory } from '../controllers/story.controller.js';
import { storyCacheMiddleware } from '../middleware/cache.middleware.js';

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
 *       400:
 *         description: Missing entityId for injury/decisions modules
 *       404:
 *         description: Entity or sport not found
 */
storyRouter.get('/:module/:sport', storyCacheMiddleware, getStory);
