import compression from 'compression';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { corsMiddleware } from './middleware/cors.middleware.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { requestLogger } from './middleware/request.logger.js';
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
  // HTTP request logging (Phase 8 Step 7 — requestId, timing, slow warnings)
  app.use(requestLogger);
  // Rate limiting on API routes. Health and the Swagger docs are exempt —
  // the app pings /api/health on a timer (offline detection) and judges open
  // /api/docs during the demo, so neither can ever be blocked.
  app.use(
    '/api',
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: req => {
        // req.path is relative to the '/api' mount: /health, /docs, …
        return (
          req.path === '/health' ||
          req.path === '/health/errors' ||
          req.path === '/docs' ||
          req.path.startsWith('/docs/')
        );
      },
    })
  );

  // API docs (auto-generated from route annotations)
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  // Alias — judges often type /api/docs (matching the Python service's /docs).
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  // Raw OpenAPI spec (swagger-ui-express embeds it in the UI, but expose it for tooling too)
  app.get('/api-docs.json', (_req, res) => {
    res.json(swaggerSpec);
  });

  // Feature routes — caching is per-route (Phase 7 Step 6.2 instances are
  // wired in each route file; uncached routes always compute fresh).
  app.use('/', routes);

  // 404 + error handling (must be registered last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
