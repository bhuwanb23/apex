/**
 * Phase 8 Step 7.4 — request context propagation.
 *
 * Every HTTP request gets a context (requestId, startTime) that follows it
 * through ALL async layers — controllers, services, and even outbound calls
 * like the ML client — via AsyncLocalStorage. Any code can pull the current
 * request's context without threading a `req` object through every function:
 *
 *   import { getRequestId } from '../utils/request.context.js';
 *   const requestId = getRequestId(); // undefined when not in an HTTP request
 *
 * This is what links the request/response logs (Step 7.2) to the ML call logs
 * (Step 8.1/8.2): an ML call made while handling a request automatically
 * carries the same requestId.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  /** Unique UUID for this request (crypto.randomUUID — a real v4). */
  requestId: string;
  /** process.hrtime.bigint() at arrival — drives response-time timing. */
  startTime: bigint;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** The current request's context, or undefined outside an HTTP request. */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/** The current request's UUID, or undefined when not inside an HTTP request. */
export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

/** Milliseconds elapsed since the request's startTime (2 decimal places). */
export function getElapsedMs(startTime: bigint): number {
  return Math.round((Number(process.hrtime.bigint() - startTime) / 1e6) * 100) / 100;
}
