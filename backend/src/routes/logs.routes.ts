/**
 * Phase 8 Step 11.2 — log viewer route.
 *
 * GET /api/logs/recent — protected by X-Admin-Key, reads logs/combined.log,
 * parses the JSON lines and returns the newest matching entries:
 *   ?level   → include lines AT this level or more severe (error → error+fatal)
 *   ?context → only lines whose context matches (jobs, ml-client, database)
 *   ?since   → ISO timestamp, only lines at/after it
 *   ?limit   → max lines (default 50, capped at 200)
 */
import { Router } from 'express';
import { assertAdminKey } from '../middleware/admin.middleware.js';
import { createValidator, logsQuerySchema } from '../middleware/validation.middleware.js';
import { readRecentLogs } from '../utils/log.manager.js';
import { sendSuccess } from '../utils/response.util.js';

export const logsRouter = Router();

/**
 * @openapi
 * /api/logs/recent:
 *   get:
 *     summary: Recent log entries
 *     description: Newest JSON lines from logs/combined.log, filtered by level, context, since and limit. Requires the X-Admin-Key header.
 *     tags: [System]
 *     parameters:
 *       - in: header
 *         name: X-Admin-Key
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [silly, trace, debug, http, info, warn, error, fatal]
 *       - in: query
 *         name: context
 *         schema:
 *           type: string
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Matching log entries
 *       401:
 *         description: Missing or invalid X-Admin-Key
 */
logsRouter.get('/recent', createValidator(logsQuerySchema, 'query'), (req, res) => {
  assertAdminKey(req);
  const { level, context, limit, since } = req.validatedQuery as {
    level?: string;
    context?: string;
    limit?: number;
    since?: string;
  };
  const entries = readRecentLogs({ level, context, limit: limit ?? 50, since });
  sendSuccess(res, {
    file: 'logs/combined.log',
    count: entries.length,
    entries,
  });
});
