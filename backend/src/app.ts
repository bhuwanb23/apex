import compression from 'compression';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { cacheMiddleware } from './middleware/cache.middleware.js';
import { corsMiddleware } from './middleware/cors.middleware.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { loggerMiddleware } from './middleware/logger.middleware.js';
import { routes } from './routes/index.js';
import { swaggerSpec } from './swagger/swagger.js';

export function createApp(): express.Express {
  const app = express();

  // Security headers
  app.use(helmet());
  // CORS with allowed origins from env
  app.use(corsMiddleware);
  // Gzip response compression
  app.use(compression());
  // JSON body parser with size limit
  app.use(express.json({ limit: '1mb' }));
  // HTTP request logging
  app.use(loggerMiddleware);
  // Rate limiting on API routes (15 min / 100 requests by default)
  app.use(
    '/api',
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    })
  );

  // API docs (auto-generated from route annotations)
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  // Raw OpenAPI spec (swagger-ui-express embeds it in the UI, but expose it for tooling too)
  app.get('/api-docs.json', (_req, res) => {
    res.json(swaggerSpec);
  });

  // Response cache (GET requests only) + feature routes
  app.use('/', cacheMiddleware, routes);

  // 404 + error handling (must be registered last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
