// Phase 8 Step 11 — test the log manager (rotation, viewer, startup banner).
//   npx tsx scripts/log-manager-step11-test.ts
//
//   T1  rotation — file → .1, older generations gzipped (.2.gz …), chain
//       capped at maxFiles; small files are left alone
//   T2  readRecentLogs — level (>= severity), context, since, limit filters
//   T3  GET /api/logs/recent — X-Admin-Key required; filters work over HTTP
//   T4  startup banner — routes/jobs/cache summary logged; route collection
//       includes the new endpoints

// Env first.
process.env.LOG_LEVEL = 'debug';
process.env.PYTHON_ML_URL = 'http://127.0.0.1:1';
process.env.JOB_CONTROL_ADMIN_KEY = 'test-admin-key';

import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`, extra ?? '');
  }
}

const { logStartupBanner, readRecentLogs, rotateAllLogFiles, rotateLogFile } =
  await import('../src/utils/log.manager.js');
const { collectRoutesSummary } = await import('../src/routes/index.js');
const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/db/client.js');

const TEST_LOG = 'logs/rotate-test.log';
function cleanupRotateFiles(): void {
  for (const f of readdirSync('logs').filter(n => n.startsWith('rotate-test.log'))) {
    unlinkSync(`logs/${f}`);
  }
}

try {
  // -------------------------------------------------------------------------
  // T1 — rotation
  // -------------------------------------------------------------------------
  console.log('T1. rotation:');
  cleanupRotateFiles();
  writeFileSync(TEST_LOG, 'AAAAAAAAAA'); // 10 bytes
  const didRotate = rotateLogFile(TEST_LOG, { maxSizeBytes: 5, maxFiles: 3 });
  check('T1. oversized file rotates (returns true)', didRotate);
  check('T1. current file moved to .1', !existsSync(TEST_LOG) && existsSync(`${TEST_LOG}.1`));

  writeFileSync(TEST_LOG, 'BBBBBBBBBB');
  rotateLogFile(TEST_LOG, { maxSizeBytes: 5, maxFiles: 3 });
  check('T1. previous generation compressed to .2.gz', existsSync(`${TEST_LOG}.2.gz`));
  const gz = readFileSync(`${TEST_LOG}.2.gz`);
  check('T1. .2.gz is gzip (magic 1f 8b)', gz[0] === 0x1f && gz[1] === 0x8b);

  writeFileSync(TEST_LOG, 'CCCCCCCCCC');
  rotateLogFile(TEST_LOG, { maxSizeBytes: 5, maxFiles: 3 });
  check('T1. third generation at .3.gz', existsSync(`${TEST_LOG}.3.gz`));

  writeFileSync(TEST_LOG, 'DDDDDDDDDD');
  rotateLogFile(TEST_LOG, { maxSizeBytes: 5, maxFiles: 3 });
  check(
    'T1. chain capped at maxFiles (3 generations)',
    existsSync(`${TEST_LOG}.3.gz`) && !existsSync(`${TEST_LOG}.4.gz`)
  );

  writeFileSync(TEST_LOG, 'small');
  check('T1. small file not rotated', rotateLogFile(TEST_LOG, { maxSizeBytes: 100 }) === false);
  cleanupRotateFiles();
  check('T1. rotateAllLogFiles does not throw', typeof rotateAllLogFiles() === 'undefined');

  // -------------------------------------------------------------------------
  // T2 — readRecentLogs filters
  // -------------------------------------------------------------------------
  console.log('T2. log viewer filters:');
  const VIEW = 'logs/viewer-test.log';
  const lines = [
    { time: 1_700_000_000_000, level: 30, msg: 'info-a', context: 'jobs' },
    { time: 1_700_000_001_000, level: 50, msg: 'error-b', context: 'jobs' },
    { time: 1_700_000_002_000, level: 40, msg: 'warn-c', context: 'ml-client' },
    { time: 1_700_000_003_000, level: 60, msg: 'fatal-d', context: 'database' },
    { time: 1_700_000_004_000, level: 20, msg: 'debug-e', context: 'jobs' },
  ];
  writeFileSync(VIEW, lines.map(l => JSON.stringify(l)).join('\n'));

  const all = readRecentLogs({ file: VIEW });
  check('T2. no filters → newest 50', all.length === 5 && all[0]?.msg === 'debug-e', all[0]?.msg);
  const errors = readRecentLogs({ file: VIEW, level: 'error' });
  check(
    'T2. level error → error + fatal only',
    errors.length === 2 && errors.every(e => [50, 60].includes(Number(e.level))),
    errors
  );
  const jobs = readRecentLogs({ file: VIEW, context: 'jobs' });
  check(
    'T2. context jobs → 3 entries',
    jobs.length === 3 && jobs.every(e => e.context === 'jobs'),
    jobs
  );
  const since = readRecentLogs({ file: VIEW, since: new Date(1_700_000_001_500).toISOString() });
  check('T2. since filter → 3 entries (after 001500)', since.length === 3, since);
  const limited = readRecentLogs({ file: VIEW, limit: 2 });
  check(
    'T2. limit 2 → 2 newest entries',
    limited.length === 2 && limited[0]?.msg === 'debug-e' && limited[1]?.msg === 'fatal-d',
    limited
  );
  check(
    'T2. missing file → empty array',
    Array.isArray(readRecentLogs({ file: 'logs/nope.log' })) &&
      readRecentLogs({ file: 'logs/nope.log' }).length === 0
  );
  unlinkSync(VIEW);

  // -------------------------------------------------------------------------
  // T3 — HTTP: GET /api/logs/recent
  // -------------------------------------------------------------------------
  console.log('T3. /api/logs/recent over HTTP:');
  const app = createApp();
  const server = await new Promise<import('node:http').Server>(resolve => {
    const srv = app.listen(0, () => resolve(srv));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const noKey = await fetch(`${base}/api/logs/recent`);
  check('T3. missing X-Admin-Key → 403', noKey.status === 403, noKey.status);
  const withKey = await fetch(`${base}/api/logs/recent`, {
    headers: { 'x-admin-key': 'test-admin-key' },
  });
  const withKeyBody = (await withKey.json()) as {
    success: boolean;
    data: { count: number; entries: Array<Record<string, unknown>>; file: string };
  };
  check(
    'T3. valid key → 200 with entries',
    withKey.status === 200 &&
      withKeyBody.success === true &&
      withKeyBody.data.file === 'logs/combined.log' &&
      Array.isArray(withKeyBody.data.entries) &&
      withKeyBody.data.count === withKeyBody.data.entries.length,
    withKeyBody.data
  );
  const filtered = await (
    await fetch(`${base}/api/logs/recent?level=warn&limit=3`, {
      headers: { 'x-admin-key': 'test-admin-key' },
    })
  ).json();
  check(
    'T3. level+limit filters over HTTP',
    (filtered as { data: { entries: Array<Record<string, unknown>> } }).data.entries.length <= 3 &&
      (filtered as { data: { entries: Array<Record<string, unknown>> } }).data.entries.every(
        e => Number(e.level) >= 40
      ),
    filtered
  );
  const badLevel = await fetch(`${base}/api/logs/recent?level=banana`, {
    headers: { 'x-admin-key': 'test-admin-key' },
  });
  check('T3. invalid level → 400 VALIDATION_ERROR', badLevel.status === 400, badLevel.status);
  server.close();

  // -------------------------------------------------------------------------
  // T4 — startup banner + route collection
  // -------------------------------------------------------------------------
  console.log('T4. startup banner:');
  logStartupBanner({
    appName: 'AQX Sports Intelligence',
    version: '0.1.0',
    environment: 'development',
    port: 8000,
    database: './prisma/aqx.db',
    mlService: 'http://localhost:8001',
    nodeVersion: process.version,
    startedAt: new Date().toISOString(),
    routes: collectRoutesSummary(),
    jobs: [{ name: 'data_sync', schedule: '0 0,6,12,18 * * *' }],
    cache: { memoryKeys: 3, sqliteEntries: 7 },
  });
  const combined = readFileSync('logs/combined.log', 'utf8');
  check(
    'T4. banner logs "Ready to accept requests"',
    combined.includes('"msg":"Ready to accept requests"')
  );
  check(
    'T4. banner logs cache status',
    /"msg":"Cache status"/.test(combined) && combined.includes('"sqliteCacheEntries":7')
  );
  const routes = collectRoutesSummary();
  check(
    'T4. route collection includes /api/logs/recent',
    routes.some(r => r.includes('/api/logs/recent')),
    routes
  );
  check(
    'T4. route collection includes /api/health/errors',
    routes.some(r => r.includes('/api/health/errors'))
  );
  check(
    'T4. route collection includes the root route',
    routes.some(r => r.includes('GET /'))
  );
} finally {
  cleanupRotateFiles();
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
