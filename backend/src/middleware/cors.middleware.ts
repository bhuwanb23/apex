import cors from 'cors';
import { env } from '../config/env.js';

/**
 * CORS middleware — reads ALLOWED_ORIGINS from env (comma-separated).
 * Handles preflight OPTIONS requests automatically.
 *
 * The Expo dev server (Metro) serves the app from localhost:8081 (web) — and
 * the phone's Expo Go on the LAN uses http://<machine-ip>:8081. To avoid the
 * "blocked by CORS policy" wall during development, the default allow-list
 * includes localhost:8081 and the LAN wildcard when no explicit origins are
 * configured. Production deployments should set ALLOWED_ORIGINS explicitly.
 */
type AllowedOrigin = string | RegExp;

function resolveOrigins(): AllowedOrigin[] | true {
  const configured = env.ALLOWED_ORIGINS.split(',')
    .map(o => o.trim())
    .filter(Boolean);
  if (configured.includes('*')) return true;

  // Dev defaults: explicit localhost origins + any <ip>:8081 on the LAN.
  const devOrigins: AllowedOrigin[] = ['http://localhost:8081', 'http://127.0.0.1:8081'];
  if (env.NODE_ENV !== 'production') {
    devOrigins.push(/^http:\/\/\d{1,3}(\.\d{1,3}){3}:8081$/);
  }
  return [...new Set([...configured, ...devOrigins])];
}

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowed = resolveOrigins();
    // Non-browser clients (curl, node) send no Origin — always allow.
    if (!origin || allowed === true) return callback(null, true);
    const matches = allowed.some(o => (typeof o === 'string' ? o === origin : o.test(origin)));
    if (!matches) return callback(new Error(`Origin ${origin} not allowed by CORS`));
    return callback(null, origin);
  },
  credentials: true,
});
