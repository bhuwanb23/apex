import cors from 'cors';
import { env } from '../config/env.js';

/**
 * CORS middleware — reads ALLOWED_ORIGINS from env (comma-separated).
 * Handles preflight OPTIONS requests automatically.
 */
const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(o => o.trim());

export const corsMiddleware = cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
});
