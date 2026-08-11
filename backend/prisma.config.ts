import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

/**
 * Prisma CLI configuration (Prisma ORM v7 style).
 * The datasource URL for CLI commands (db push / migrate / studio) is defined
 * here instead of in the schema file. Paths resolve relative to this file.
 */
export default defineConfig({
  // Multi-file schema: one .prisma file per table in prisma/schema/
  schema: 'prisma/schema',
  // Migrations live next to the datasource file (prisma/schema/schema.prisma)
  migrations: {
    path: 'prisma/schema/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
