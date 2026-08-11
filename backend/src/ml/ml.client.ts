/**
 * ML client layer (Phase 5, Step 10) — the ONLY place Node talks to the
 * Python microservice over HTTP. Every module client (injury, decisions,
 * momentum, timeout, story) goes through here so timeouts, retries and
 * error mapping live in one spot.
 *
 * Error contract (services rely on these):
 *   MLServiceUnavailableError — Python unreachable (connection refused/timeout)
 *   MLServiceError            — Python responded with an error status
 */
import axios, { type AxiosInstance } from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.util.js';

/** The Python service responded with an error status (HTTP response received). */
export class MLServiceError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'MLServiceError';
    this.statusCode = statusCode;
  }
}

/** The Python service could not be reached at all (network/connection failure). */
export class MLServiceUnavailableError extends MLServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'MLServiceUnavailableError';
  }
}

const MAX_CONNECT_RETRIES = 2; // retry connect failures twice (doc: 2 retries)

export interface MLClient {
  post<TResponse, TBody = unknown>(path: string, body: TBody): Promise<TResponse>;
}

/**
 * Builds an ML client. `baseURL`/`timeoutMs` are injectable so tests can point
 * at a mock server; the app uses the shared `mlClient` instance below.
 */
export function createMLClient(
  baseURL: string = env.PYTHON_ML_URL,
  timeoutMs = 30_000 // models can take time — generous default
): MLClient {
  const http: AxiosInstance = axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: { 'Content-Type': 'application/json' },
  });

  async function post<TResponse, TBody = unknown>(path: string, body: TBody): Promise<TResponse> {
    let attempt = 0;
    for (;;) {
      try {
        const res = await http.post<TResponse>(path, body);
        return res.data;
      } catch (err) {
        const mlErr = toMLError(err, path);
        const isConnectFailure = mlErr instanceof MLServiceUnavailableError;
        attempt += 1;
        if (!isConnectFailure || attempt > MAX_CONNECT_RETRIES) throw mlErr;
        logger.warn({ path, attempt }, 'ML service unreachable — retrying');
        await new Promise(resolve => {
          setTimeout(resolve, 250 * attempt);
        });
      }
    }
  }

  return { post };
}

function toMLError(err: unknown, path: string): MLServiceError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === undefined) {
      // No HTTP response — network/connection failure (never retried as 4xx/5xx).
      return new MLServiceUnavailableError(
        `ML service unreachable at ${env.PYTHON_ML_URL}${path}`
      );
    }
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    const suffix = detail !== undefined ? `: ${JSON.stringify(detail)}` : '';
    return new MLServiceError(`ML service error (HTTP ${status}) for ${path}${suffix}`, status);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new MLServiceError(`ML request to ${path} failed: ${message}`);
}

/** Shared instance — import this, don't construct your own (tests use createMLClient). */
export const mlClient = createMLClient();
