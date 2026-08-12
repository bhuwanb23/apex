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

  // NBA data source (BallDontLie — https://balldontlie.io)
  BALLDONTLIE_API_KEY: z.string().optional(),
  // Request pacing for BallDontLie (requests/min): free tier is 5, ALL-STAR 60, GOAT 600
  BALLDONTLIE_RATE_LIMIT: z.coerce.number().int().positive().default(5),

  // Cache TTL tiers (seconds): short 6h, medium 24h, long 7 days
  CACHE_TTL_SHORT: z.coerce.number().int().positive().default(21600),
  CACHE_TTL_MEDIUM: z.coerce.number().int().positive().default(86400),
  CACHE_TTL_LONG: z.coerce.number().int().positive().default(604800),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // Background jobs (Phase 6) — master switch + cron overrides
  JOBS_ENABLED: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  // Default schedule per the Phase 6 plan; override via env for dev/testing
  JOB_CRON_DATA_SYNC: z.string().default('0 0,6,12,18 * * *'), // every 6h
  JOB_CRON_RISK_COMPUTE: z.string().default('0 1,7,13,19 * * *'), // 1h after sync
  JOB_CRON_MOMENTUM: z.string().default('0 2 * * *'), // once daily
  JOB_CRON_CLEANUP: z.string().default('0 3 * * *'), // once daily
  JOB_CRON_HEALTH_CHECK: z.string().default('*/15 * * * *'), // every 15 min

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
