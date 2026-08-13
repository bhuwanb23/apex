/**
 * Phase 8 Step 3.4 — asyncHandler utility (8.1).
 *
 * Express 5 forwards rejected promises from async handlers to the error
 * middleware automatically, so every existing controller relies on that
 * instead of try/catch boilerplate. This utility exists for two reasons:
 *
 *   1. Defensive consistency — if a handler is ever reused behind a router
 *      or middleware that predates Express 5's behavior, the wrapper still
 *      guarantees rejections reach next(error).
 *   2. Explicit intent — `asyncHandler(fn)` documents that a handler is
 *      async and that its rejections are the error middleware's problem.
 *
 * Usage:
 *   router.get('/players', asyncHandler(controller.getPlayers))
 *
 * The wrapper never swallows errors — it always forwards them via next().
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
