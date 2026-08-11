import { existsSync, mkdirSync } from 'node:fs';
import { destination, multistream, pino, transport } from 'pino';
import { env } from './env.js';

// Ensure the logs directory exists (per the project layout)
if (!existsSync('logs')) {
  mkdirSync('logs', { recursive: true });
}

const errorFile = destination({ dest: 'logs/error.log', sync: true });
const combinedFile = destination({ dest: 'logs/combined.log', sync: true });

export const logger = pino(
  {
    level: env.LOG_LEVEL,
    base: { service: env.APP_NAME },
  },
  multistream([
    {
      level: env.LOG_LEVEL,
      stream:
        env.NODE_ENV === 'production'
          ? destination(1) // JSON to stdout in production
          : transport({
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
            }),
    },
    { level: env.LOG_LEVEL, stream: combinedFile },
    { level: 'error', stream: errorFile },
  ])
);
