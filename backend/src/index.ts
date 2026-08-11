import { createApp } from './app.js'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { prisma } from './db/client.js'

async function main(): Promise<void> {
  // Verify DB connectivity before accepting traffic
  await prisma.$queryRaw`SELECT 1`
  logger.info('Database connection verified (SQLite via better-sqlite3)')

  const app = createApp()

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 AQX Sports Intelligence API listening on http://localhost:${env.PORT}`)
    logger.info(`📚 Swagger docs at http://localhost:${env.PORT}/api-docs`)
  })

  // Boot failures (e.g. port already in use) fire asynchronously on the server
  server.on('error', (err) => {
    logger.error({ err }, 'Server failed to start')
    process.exit(1)
  })

  // Graceful shutdown
  const shutdown = (signal: string): void => {
    logger.info(`${signal} received — shutting down gracefully`)
    server.close(() => {
      prisma
        .$disconnect()
        .catch(() => {})
        .finally(() => process.exit(0))
    })
    // Force-exit if graceful shutdown hangs
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup')
  process.exit(1)
})
