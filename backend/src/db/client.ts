import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3'
import { env } from '../config/env.js'

/**
 * Prisma Client wired to SQLite through the better-sqlite3 driver adapter.
 * Single shared instance for the whole app (import this, don't construct your own).
 */
const adapter = new PrismaBetterSQLite3({ url: env.DATABASE_URL })

export const prisma = new PrismaClient({ adapter })
