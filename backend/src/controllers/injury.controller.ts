/**
 * Injury module controllers (Phase 5, Step 5).
 * Thin request/response layer: validate → call service → send standard shapes.
 * Validation happens in the route middleware (Phase 8 Step 5) — controllers
 * read the cleaned, typed data from req.validated* and never re-validate.
 * Express 5 forwards rejected promises to the global error handler, so no
 * try/catch is needed here — services throw AppError for known failures.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  alertsQuerySchema,
  historyQuerySchema,
  playerIdParamsSchema,
  playerRiskQuerySchema,
  sportParamsSchema,
  teamIdParamsSchema,
} from '../middleware/validation.middleware.js';
import * as injuryService from '../services/injury.service.js';
import { generateTeamReportPdf } from '../services/report.service.js';
import { sendSuccess } from '../utils/response.util.js';

/** GET /api/injury/player/:playerId — full risk profile + context + trend. */
export async function getPlayerRisk(req: Request, res: Response): Promise<void> {
  const { playerId } = req.validatedParams as z.infer<typeof playerIdParamsSchema>;
  const { recalculate } = req.validatedQuery as z.infer<typeof playerRiskQuerySchema>;
  const data = await injuryService.getPlayerRisk(playerId, recalculate);
  sendSuccess(res, data);
}

/** GET /api/injury/team/:teamId — roster-wide risk summary. */
export async function getTeamRisk(req: Request, res: Response): Promise<void> {
  const { teamId } = req.validatedParams as z.infer<typeof teamIdParamsSchema>;
  const data = await injuryService.getTeamRisk(teamId);
  sendSuccess(res, data);
}

/** GET /api/injury/alerts/:sport — league-wide players in a zone. */
export async function getLeagueAlerts(req: Request, res: Response): Promise<void> {
  const { sport } = req.validatedParams as z.infer<typeof sportParamsSchema>;
  const { zone, limit } = req.validatedQuery as z.infer<typeof alertsQuerySchema>;
  const data = await injuryService.getLeagueAlerts(sport, zone, limit);
  sendSuccess(res, data);
}

/** GET /api/injury/counts/:sport — league-wide zone counts. */
export async function getInjuryCounts(req: Request, res: Response): Promise<void> {
  const { sport } = req.validatedParams as z.infer<typeof sportParamsSchema>;
  const data = await injuryService.getInjuryCounts(sport);
  sendSuccess(res, data);
}

/** GET /api/injury/player/:playerId/history — risk trend for the chart. */
export async function getPlayerRiskHistory(req: Request, res: Response): Promise<void> {
  const { playerId } = req.validatedParams as z.infer<typeof playerIdParamsSchema>;
  const { days } = req.validatedQuery as z.infer<typeof historyQuerySchema>;
  const data = await injuryService.getPlayerRiskHistory(playerId, days);
  sendSuccess(res, data);
}

/** GET /api/injury/team/:teamId/history — team-average risk trend. */
export async function getTeamRiskHistory(req: Request, res: Response): Promise<void> {
  const { teamId } = req.validatedParams as z.infer<typeof teamIdParamsSchema>;
  const { days } = req.validatedQuery as z.infer<typeof historyQuerySchema>;
  const data = await injuryService.getTeamRiskHistory(teamId, days);
  sendSuccess(res, data);
}

/** GET /api/injury/team/:teamId/report — PDF report (streamed, not JSON). */
export async function getTeamReport(req: Request, res: Response): Promise<void> {
  const { teamId } = req.validatedParams as z.infer<typeof teamIdParamsSchema>;
  const { buffer, filename } = await generateTeamReportPdf(teamId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
}
