import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './db/client.js';
import { queueManager } from './jobs/queue.manager.js';

async function main(): Promise<void> {
  // Verify DB connectivity before accepting traffic
  await prisma.$queryRaw`SELECT 1`;
  logger.info('Database connection verified (SQLite via better-sqlite3)');

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 ${env.APP_NAME} API listening on http://localhost:${env.PORT}`);
    logger.info(`💚 Health check at http://localhost:${env.PORT}/api/health`);
    logger.info(`📚 Swagger docs at http://localhost:${env.PORT}/api-docs`);
    // Background job scheduler (Phase 6) — cron jobs start after the server
    // accepts traffic so a boot failure is caught before any job runs. All
    // control flows through the queue manager (single control point).
    void queueManager.startAllJobs();
  });

  // Boot failures (e.g. port already in use) fire asynchronously on the server
  server.on('error', err => {
    logger.error({ err }, 'Server failed to start');
    process.exit(1);
  });

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return; // a second signal during the drain is ignored
    shuttingDown = true;
    logger.info(`${signal} received — shutting down gracefully`);
    logger.info('Waiting for running jobs to complete (bounded drain)…');
    // Safety net: the whole shutdown (drain + close) is bounded by one timer.
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    try {
      // Stop schedules and drain in-flight runs so a restart can't interrupt
      // a job mid-write.
      await queueManager.stopAllJobs();
    } catch (err) {
      logger.error({ err }, 'Error while stopping background jobs — continuing shutdown');
    }
    server.close(() => {
      prisma
        .$disconnect()
        .catch(() => {})
        .finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT').catch(err => logger.error({ err }, 'Graceful shutdown failed'));
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM').catch(err => logger.error({ err }, 'Graceful shutdown failed'));
  });
}

main().catch(err => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
