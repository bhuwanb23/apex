import { pino } from 'pino'
import { env } from './env.js'

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'aqx-backend' },
  transport:
    env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
})
