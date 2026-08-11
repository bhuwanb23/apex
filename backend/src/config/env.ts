import 'dotenv/config';
import { z } from 'zod';

/**
 * Typed, validated environment configuration.
 * The app fails fast at boot if required variables are missing or malformed.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(8000),
  APP_NAME: z.string().min(1).default('AQX Sports Intelligence'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Python ML microservice
  PYTHON_ML_URL: z.string().url().default('http://localhost:8001'),

  // Cache TTL tiers (seconds): short 6h, medium 24h, long 7 days
  CACHE_TTL_SHORT: z.coerce.number().int().positive().default(21600),
  CACHE_TTL_MEDIUM: z.coerce.number().int().positive().default(86400),
  CACHE_TTL_LONG: z.coerce.number().int().positive().default(604800),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('debug'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  OPENAI_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map(issue => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console -- logger is not available before env validation
  console.error(`❌ Invalid environment variables:\n${details}`);
  process.exit(1);
}

export const env = parsed.data;
