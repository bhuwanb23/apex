// Best-effort `prisma generate` on install.
// - Runs when the Prisma CLI is present (dev installs) so the client is always fresh.
// - Skips gracefully when the CLI is missing (e.g. `npm ci --omit=dev` prod installs),
//   instead of failing the install. Production builds must run `npm run db:generate` explicitly.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const isWindows = process.platform === 'win32'
const prismaBin = join(process.cwd(), 'node_modules', '.bin', isWindows ? 'prisma.cmd' : 'prisma')

if (!existsSync(prismaBin)) {
  console.log('[postinstall] prisma CLI not installed — skipping prisma generate (run `npm run db:generate` when needed)')
  process.exit(0)
}

// On Windows the .cmd shim must run through cmd.exe
const result = spawnSync(prismaBin, ['generate'], { stdio: 'inherit', shell: isWindows })
process.exit(result.status ?? 1)
