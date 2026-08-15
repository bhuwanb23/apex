/**
 * Data refresh controller (integration plan: "Settings Screen — How It Works").
 *
 * The app's "Refresh data now" button calls POST /api/sync/refresh — a
 * client-facing trigger for the data_sync job (no X-Admin-Key, unlike the
 * full job-control trigger). It is deliberately fire-and-forget: the route
 * returns 202 with the JobLogs id as soon as the run is accepted, and the
 * app polls GET /api/jobs/history?jobName=data_sync to track completion.
 */
import type { Request, Response } from 'express';
import { queueManager } from '../jobs/queue.manager.js';
import { logger } from '../utils/logger.util.js';
import { sendSuccess } from '../utils/response.util.js';
import { awaitJobLogId } from './jobs.controller.js';

/** POST /api/sync/refresh — start a data sync now (optionally one sport). */
export async function refreshDataSync(req: Request, res: Response): Promise<void> {
  const { sport } = req.validatedBody as { sport?: string };

  const job = queueManager.get('data_sync');
  if (!job) throw new Error('data_sync job is not registered');

  // Fire-and-forget per the docs: don't block the HTTP response on the run.
  // Anchor the log-id poll to this instant so a rapid re-trigger can never
  // return the previous run's id (see awaitJobLogId in jobs.controller).
  const firedAt = new Date();
  void queueManager.triggerJob('data_sync', sport, 'manual');
  const logId = await awaitJobLogId('data_sync', firedAt);
  logger.info({ sport: sport ?? null, logId }, 'Data sync triggered via /api/sync/refresh');

  sendSuccess(
    res,
    {
      jobName: 'data_sync',
      sport: sport ?? null,
      logId,
      status: 'triggered',
      note: 'Track progress via GET /api/jobs/history?jobName=data_sync',
    },
    'Data sync triggered',
    202
  );
}
