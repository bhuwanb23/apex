import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'
import { pinoHttp } from 'pino-http'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { routes } from './routes/index.js'
import { swaggerSpec } from './swagger/swagger.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'

export function createApp(): express.Express {
  const app = express()

  // Security & parsing
  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    }),
  )
  app.use(express.json({ limit: '1mb' }))

  // Request logging
  app.use(pinoHttp({ logger }))

  // API docs (auto-generated from route annotations)
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

  // Feature routes
  app.use('/', routes)

  // 404 + error handling (must be registered last)
  app.use(notFound)
  app.use(errorHandler)

  return app
}
