import swaggerJsdoc from 'swagger-jsdoc';
import { env } from '../config/env.js';
import pkg from '../../package.json' with { type: 'json' };

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AQX Sports Intelligence API',
      version: pkg.version,
      description:
        'REST API for AQX Sports Intelligence — data ingestion, sports analytics, and model-backed predictions served by the Node.js backend.',
    },
    servers: [{ url: `http://localhost:${env.PORT}`, description: 'Local development' }],
    tags: [
      { name: 'System', description: 'Health & meta endpoints' },
      { name: 'Sports', description: 'Sports, teams and players reference data' },
      { name: 'Injury', description: 'Injury risk profiles and alerts' },
      { name: 'Decisions', description: 'Coaching decision EV and leaderboards' },
      { name: 'Momentum', description: 'Cox hazard analysis and game timelines' },
      { name: 'Search', description: 'Player / team / coach / game search' },
      { name: 'Story', description: 'Narrative story mode generation' },
    ],
  },
  // JSDoc @openapi annotations live in the route files
  apis: ['./src/routes/**/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
