/**
 * Phase 8 Step 7 — request logging (7.1–7.4).
 *
 * Registered FIRST in the middleware chain (before routes) so every request —
 * including 404s and errors — is covered:
 *
 *   Step 7.1 — incoming request log (level http): method, url, path, query,
 *              userAgent, ip, requestId. Each request gets a unique UUID
 *              (crypto.randomUUID) attached to req.requestId.
 *   Step 7.2 — response completion log: statusCode, responseTimeMs (2 decimal
 *              places), requestId (same UUID → request/response match),
 *              cacheStatus (X-Cache-Status when the cache middleware ran),
 *              responseSize (bytes written to the socket). Level by status:
 *              http (2xx/3xx), warn (4xx), error (5xx). Sets the
 *              X-Response-Time header.
 *   Step 7.3 — slow request warning: any response slower than
 *              SLOW_REQUEST_THRESHOLD_MS (2s) logs "Slow request detected" at
 *              warn with slowThresholdMs included.
 *   Step 7.4 — context propagation: requestId + startTime are stored in an
 *              AsyncLocalStorage context (src/utils/request.context.ts) so any
 *              async layer — services, the ML client — can log with the
 *              request's id via getRequestId() without threading req around.
 *
 * Lines go to console + logs/combined.log via the main logger, and a
 * request-only mirror to logs/http.log via httpLogger.
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { httpLogger, logger } from '../config/logger.js';
import { getElapsedMs, requestContext, type RequestContext } from '../utils/request.context.js';

/** Step 7.3 — responses slower than this (ms) log a warn-level warning. */
export const SLOW_REQUEST_THRESHOLD_MS = 2000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express module augmentation
  namespace Express {
    interface Request {
      /** Unique UUID generated at arrival (Step 7.1). */
      requestId: string;
      /** hrtime at arrival — services can compute request-elapsed time. */
      startTime: bigint;
    }
  }
}

/** Bytes a response chunk contributes to the wire size. */
function byteCount(chunk: unknown): number {
  if (typeof chunk === 'string') return Buffer.byteLength(chunk);
  if (chunk instanceof Uint8Array) return chunk.byteLength;
  return 0;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  const startTime = process.hrtime.bigint();
  const ctx: RequestContext = { requestId, startTime };
  req.requestId = requestId;
  req.startTime = startTime;

  // Step 7.2 — count bytes written to the socket (wire bytes; compression
  // runs before this middleware so gzipped sizes are counted as-sent).
  let responseSize = 0;
  const origWrite = res.write.bind(res);
  res.write = ((chunk: unknown, ...args: unknown[]) => {
    responseSize += byteCount(chunk);
    return origWrite(chunk as never, ...(args as never[]));
  }) as typeof res.write;
  const origEnd = res.end.bind(res);
  res.end = ((chunk?: unknown, ...args: unknown[]) => {
    if (chunk !== undefined && chunk !== null) responseSize += byteCount(chunk);
    // Step 7.2 — the header must be set BEFORE the response is flushed (the
    // 'finish' event fires after headers are already on the wire).
    res.setHeader('X-Response-Time', String(getElapsedMs(startTime)));
    return origEnd(chunk as never, ...(args as never[]));
  }) as typeof res.end;

  // Everything downstream (including the finish listener, which is registered
  // inside this context) runs under the request's AsyncLocalStorage context.
  requestContext.run(ctx, () => {
    // Step 7.1 — incoming request.
    const incoming = {
      method: req.method,
      url: req.originalUrl,
      path: req.path,
      query: req.query,
      userAgent: req.get('user-agent'),
      ip: req.ip,
      requestId,
    };
    logger.http(incoming, 'request in');
    httpLogger.http(incoming, 'request in');

    res.on('finish', () => {
      const responseTimeMs = getElapsedMs(startTime);
      // cacheStatus comes from the cache middleware's X-Cache-Status header
      // (HIT / MISS / STALE) when the route is cached.
      const cacheHeader = res.getHeader('X-Cache-Status');
      const sport = (req.params as Record<string, string> | undefined)?.sport;
      const done = {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTimeMs,
        requestId,
        // null (not undefined) keeps the field shape stable for log consumers.
        cacheStatus: typeof cacheHeader === 'string' ? cacheHeader : null,
        responseSize,
        sport: sport ?? null,
      };

      // Step 7.2 — level by status class.
      if (res.statusCode >= 500) {
        logger.error(done, 'request done');
      } else if (res.statusCode >= 400) {
        logger.warn(done, 'request done');
      } else {
        logger.http(done, 'request done');
      }
      httpLogger.http(done, 'request done');

      // Step 7.3 — slow request detection.
      if (responseTimeMs > SLOW_REQUEST_THRESHOLD_MS) {
        logger.warn(
          { ...done, slowThresholdMs: SLOW_REQUEST_THRESHOLD_MS },
          'Slow request detected'
        );
      }
    });

    next();
  });
}
