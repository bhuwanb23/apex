import path from 'node:path'
import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { env } from '../config/env.js'

/**
 * Resolve the SQLite file URL to an absolute path anchored at the backend root,
 * so the runtime DB location is independent of the process CWD (deployment-safe).
 * The Prisma CLI resolves the same URL relative to prisma.config.ts (backend root),
 * so both stay in sync.
 */
function resolveSqliteUrl(url: string): string {
  if (url.startsWith('file:./')) {
    const relativePath = url.slice('file:./'.length)
    const absolute = path.resolve(import.meta.dirname, '..', '..', relativePath)
    return `file:${absolute.replaceAll('\\', '/')}`
  }
  return url
}

/**
 * Prisma Client wired to SQLite through the better-sqlite3 driver adapter.
 * Single shared instance for the whole app (import this, don't construct your own).
 */
const adapter = new PrismaBetterSqlite3({ url: resolveSqliteUrl(env.DATABASE_URL) })

export const prisma = new PrismaClient({ adapter })
