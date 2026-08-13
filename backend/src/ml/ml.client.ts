/**
 * ML client layer (Phase 5, Step 10) — the ONLY place Node talks to the
 * Python microservice over HTTP. Every module client (injury, decisions,
 * momentum, timeout, story) goes through here so timeouts, retries and
 * error mapping live in one spot.
 *
 * Error contract (services rely on these):
 *   MLServiceUnavailableError — Python unreachable (connection refused/timeout)
 *   MLServiceError            — Python responded with an error status
 *
 * Both error classes are defined in src/utils/errors.ts (Phase 8 Step 2) and
 * re-exported here so existing `import … from '../ml/ml.client.js'` call sites
 * keep working — there is exactly one definition in the codebase.
 */
import axios, { type AxiosInstance } from 'axios';
import { env } from '../config/env.js';
import { mlLogger as logger } from '../config/logger.js';
import {
  MLServiceError,
  MLServiceUnavailableError,
  type MLServiceErrorOptions,
} from '../utils/errors.js';
import { instrumentMLCall } from './ml.logger.js';

export { MLServiceError, MLServiceUnavailableError };

const MAX_CONNECT_RETRIES = 2; // retry connect failures twice (doc: 2 retries)

/** Full Python /health payload — used by the job control ml-health route. */
export interface MLHealthPayload {
  status: string;
  service?: string;
  version?: string;
  environment?: string;
  models?: Record<string, string>;
  nflDataAvailable?: boolean;
  modelCacheSize?: number;
  timestamp?: string;
}

export interface MLClient {
  post<TResponse, TBody = unknown>(path: string, body: TBody): Promise<TResponse>;
  /** GET /health — true when the Python service answers 200. */
  checkHealth(): Promise<boolean>;
  /** GET /health with the full payload (models, version…), or null when unreachable. */
  getHealth(): Promise<MLHealthPayload | null>;
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

  async function checkHealth(): Promise<boolean> {
    return (await getHealth()) !== null;
  }

  async function getHealth(): Promise<MLHealthPayload | null> {
    try {
      const res = await http.get<MLHealthPayload>('/health', { timeout: 1500 });
      return res.data;
    } catch {
      return null;
    }
  }

  async function post<TResponse, TBody = unknown>(path: string, body: TBody): Promise<TResponse> {
    let attempt = 0;
    for (;;) {
      try {
        // Phase 8 Step 8 — every Python call is logged (request/response/
        // failure) and timed into the rolling performance window by
        // instrumentMLCall. Errors rethrow so the retry/error mapping below
        // is unchanged.
        return await instrumentMLCall(path, body, () =>
          http.post<TResponse>(path, body).then(res => res.data)
        );
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

  return { post, checkHealth, getHealth };
}

function toMLError(err: unknown, path: string): MLServiceError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === undefined) {
      // No HTTP response — network/connection failure (never retried as 4xx/5xx).
      return new MLServiceUnavailableError(
        `ML service unreachable at ${env.PYTHON_ML_URL}${path}`,
        { mlEndpoint: path }
      );
    }
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    const suffix = detail !== undefined ? `: ${JSON.stringify(detail)}` : '';
    return new MLServiceError(`ML service error (HTTP ${status}) for ${path}${suffix}`, {
      mlEndpoint: path,
      mlStatusCode: status,
    } satisfies MLServiceErrorOptions);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new MLServiceError(`ML request to ${path} failed: ${message}`, {
    mlEndpoint: path,
  });
}

/** Shared instance — import this, don't construct your own (tests use createMLClient). */
export const mlClient = createMLClient();
