// Phase 7 Step 6 validation — cache middleware (7.3).
//   npx tsx scripts/cache-middleware-step6-test.ts
//
// Boots the real app on a scratch port and verifies the middleware behaviors:
//   MISS → HIT (memory), X-Cache-* headers, varyBy isolation,
//   sqlite persistence (memory flushed → HIT/sqlite via the CacheMetadata
//   registry), stale-while-revalidate with background refresh, and that error
//   responses are never cached. Leaves the DB clean (deletes registry rows the
//   middleware marked for the test).
//
// NOTE: env vars must be set before ANY import of src/config/env.js (dynamic
// imports below), because the middleware's background refresh re-issues the
// request to 127.0.0.1:env.PORT.
process.env.PORT = '8123';
process.env.LOG_LEVEL = 'silent';

const { createCacheMiddleware } = await import('../src/middleware/cache.middleware.js');
const { env } = await import('../src/config/env.js');
const { cacheFlush } = await import('../src/cache/memoryCache.js');
const { prisma } = await import('../src/db/client.js');
const { createApp } = await import('../src/app.js');

const MAIN_PORT = 8124;
const STALE_PORT = env.PORT; // 8123 — must match the middleware's self-refresh target

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

function headers(res: Response): Record<string, string | null> {
  return {
    status: res.headers.get('x-cache-status'),
    layer: res.headers.get('x-cache-layer'),
    age: res.headers.get('x-cache-age'),
    ttl: res.headers.get('x-cache-ttl'),
  };
}

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

try {
  // Self-clean: another test (e.g. the step-9 warmup) may have left a valid
  // leaderboard registry row behind, which would flip this test's first
  // leaderboard request from MISS to HIT. The registry must start empty for
  // the "first request" semantics this suite asserts.
  await prisma.cacheMetadata.deleteMany({
    where: { cacheKey: { startsWith: 'leaderboard:NBA:' } },
  });
  cacheFlush();
  // -------------------------------------------------------------------------
  // 1. Stale-while-revalidate + background refresh (scratch instance)
  // -------------------------------------------------------------------------
  console.log('1. stale-while-revalidate:');
  const staleApp = (await import('express')).default();
  let count = 0;
  const staleMw = createCacheMiddleware({
    ttl: 2, // seconds
    allowStale: true,
    staleThreshold: 1, // stale after 1s
    cacheLayer: 'memory',
    keyBuilder: () => 'test:stale',
  });
  staleApp.get('/test', staleMw, (_req, res) => {
    count += 1;
    res.json({ n: count });
  });
  const staleServer = await new Promise<import('node:http').Server>(resolve => {
    const srv = staleApp.listen(STALE_PORT, () => resolve(srv));
  });

  const staleBase = `http://127.0.0.1:${STALE_PORT}`;
  const s1 = await fetch(`${staleBase}/test`);
  check('first request → MISS', s1.headers.get('x-cache-status') === 'MISS', headers(s1));
  check('MISS → X-Cache-Layer fresh', s1.headers.get('x-cache-layer') === 'fresh');
  check('controller ran once', ((await s1.json()) as { n: number }).n === 1);

  const s2 = await fetch(`${staleBase}/test`);
  check('second request → HIT (memory)', s2.headers.get('x-cache-status') === 'HIT', headers(s2));
  check('HIT served the cached body (n=1)', ((await s2.json()) as { n: number }).n === 1);
  check('HIT → X-Cache-Layer memory', s2.headers.get('x-cache-layer') === 'memory');
  check('X-Cache-Age is a number', Number(s2.headers.get('x-cache-age')) >= 0);
  check('X-Cache-TTL is a number', Number(s2.headers.get('x-cache-ttl')) > 0);

  await wait(1300); // age now past staleThreshold (1s)
  const s3 = await fetch(`${staleBase}/test`);
  check('after staleThreshold → STALE', s3.headers.get('x-cache-status') === 'STALE', headers(s3));
  check('STALE served the old body (n=1)', ((await s3.json()) as { n: number }).n === 1);

  await wait(700); // background refresh (self-request) repopulates the cache
  const s4 = await fetch(`${staleBase}/test`);
  check(
    'after background refresh → HIT with fresh body (n=2)',
    s4.headers.get('x-cache-status') === 'HIT' && ((await s4.json()) as { n: number }).n === 2,
    headers(s4)
  );
  staleServer.close();

  // -------------------------------------------------------------------------
  // 2. Real routes — MISS/HIT, varyBy, sqlite persistence, error handling
  // -------------------------------------------------------------------------
  console.log('2. real routes:');
  const app = createApp();
  const mainServer = await new Promise<import('node:http').Server>(resolve => {
    const srv = app.listen(MAIN_PORT, () => resolve(srv));
  });
  const base = `http://127.0.0.1:${MAIN_PORT}`;

  const nba = await prisma.sports.findUnique({ where: { abbreviation: 'nba' } });
  if (!nba) {
    throw new Error('NBA sport not seeded — aborting route tests');
  }

  // Team list (memory layer)
  const t1 = await fetch(`${base}/api/sports/NBA/teams`);
  check('team list → MISS', t1.headers.get('x-cache-status') === 'MISS', headers(t1));
  const t2 = await fetch(`${base}/api/sports/NBA/teams`);
  check(
    'team list → HIT (memory)',
    t2.headers.get('x-cache-status') === 'HIT' && t2.headers.get('x-cache-layer') === 'memory',
    headers(t2)
  );

  // Search players — MISS → HIT, varyBy isolation for limit
  const q1 = await fetch(`${base}/api/search/players?q=jam&sport=NBA&limit=5`);
  check('search players → MISS', q1.headers.get('x-cache-status') === 'MISS', headers(q1));
  const q2 = await fetch(`${base}/api/search/players?q=jam&sport=NBA&limit=5`);
  check('search players → HIT', q2.headers.get('x-cache-status') === 'HIT', headers(q2));
  const q3 = await fetch(`${base}/api/search/players?q=jam&sport=NBA&limit=20`);
  check('different limit → separate cache entry (MISS)', q3.headers.get('x-cache-status') === 'MISS', headers(q3));

  // Leaderboard — both layers: memory HIT, then sqlite persistence
  const l1 = await fetch(`${base}/api/decisions/coaches/NBA`);
  check('leaderboard → MISS', l1.headers.get('x-cache-status') === 'MISS', headers(l1));
  const l2 = await fetch(`${base}/api/decisions/coaches/NBA`);
  check(
    'leaderboard → HIT (memory)',
    l2.headers.get('x-cache-status') === 'HIT' && l2.headers.get('x-cache-layer') === 'memory',
    headers(l2)
  );

  // Simulate a restart: clear the in-memory cache; the CacheMetadata registry
  // (marked valid by the middleware) must still serve HIT/sqlite.
  cacheFlush();
  const l3 = await fetch(`${base}/api/decisions/coaches/NBA`);
  check(
    'after memory flush → HIT (sqlite registry)',
    l3.headers.get('x-cache-status') === 'HIT' && l3.headers.get('x-cache-layer') === 'sqlite',
    headers(l3)
  );
  const l4 = await fetch(`${base}/api/decisions/coaches/NBA`);
  check(
    'sqlite hit repopulated memory → HIT (memory)',
    l4.headers.get('x-cache-status') === 'HIT' && l4.headers.get('x-cache-layer') === 'memory',
    headers(l4)
  );

  // Error responses are never cached (validation 400) and carry no headers
  const b1 = await fetch(`${base}/api/search/players?q=j`);
  const b2 = await fetch(`${base}/api/search/players?q=j`);
  check('bad search → 400 both times', b1.status === 400 && b2.status === 400);
  check(
    '400 responses carry no X-Cache-Status',
    b1.headers.get('x-cache-status') === null && b2.headers.get('x-cache-status') === null
  );

  mainServer.close();

  // -------------------------------------------------------------------------
  // 3. Stale-while-revalidate on a sqlite layer re-validates the registry
  // -------------------------------------------------------------------------
  console.log('3. sqlite stale-while-revalidate + registry refresh:');
  const regApp = (await import('express')).default();
  const REG_KEY = 'test:registry-refresh';
  let regCount = 0;
  const regMw = createCacheMiddleware({
    ttl: 60,
    allowStale: true,
    staleThreshold: 1,
    cacheLayer: 'sqlite',
    dataType: 'season_data',
    keyBuilder: () => REG_KEY,
  });
  regApp.get('/test', regMw, (_req, res) => {
    regCount += 1;
    res.json({ n: regCount });
  });
  // Same port as env.PORT so scheduleBackgroundRefresh (self-request) hits this app.
  const regServer = await new Promise<import('node:http').Server>(resolve => {
    const srv = regApp.listen(STALE_PORT, () => resolve(srv));
  });
  const regBase = `http://127.0.0.1:${STALE_PORT}`;

  const r1 = await fetch(`${regBase}/test`);
  check('sqlite layer first request → MISS', r1.headers.get('x-cache-status') === 'MISS', headers(r1));

  // Expire the registry row + clear memory so the next request hits the
  // sqlite stale path (data exists in the registry but is past expiry).
  await prisma.cacheMetadata.updateMany({
    where: { cacheKey: REG_KEY },
    data: { isValid: false, expiresAt: new Date(Date.now() - 1000) },
  });
  cacheFlush();

  const r2 = await fetch(`${regBase}/test`);
  check(
    'expired registry + empty memory → STALE (sqlite)',
    r2.headers.get('x-cache-status') === 'STALE' && r2.headers.get('x-cache-layer') === 'sqlite',
    headers(r2)
  );

  await wait(700); // background refresh (self-request) recomputes + re-validates
  const regRow = await prisma.cacheMetadata.findUnique({ where: { cacheKey: REG_KEY } });
  check(
    'background refresh re-validated the sqlite registry',
    regRow != null && regRow.isValid && regRow.expiresAt.getTime() > Date.now(),
    { isValid: regRow?.isValid, expiresAt: regRow?.expiresAt }
  );
  const r3 = await fetch(`${regBase}/test`);
  check(
    'after refresh → HIT (memory) with fresh body',
    r3.headers.get('x-cache-status') === 'HIT' &&
      r3.headers.get('x-cache-layer') === 'memory' &&
      ((await r3.json()) as { n: number }).n === 3,
    headers(r3)
  );
  regServer.close();
} finally {
  // Cleanup — registry rows the middleware marked during the tests.
  await prisma.cacheMetadata.deleteMany({
    where: { cacheKey: { startsWith: 'leaderboard:NBA:' } },
  });
  await prisma.cacheMetadata.deleteMany({ where: { cacheKey: 'test:registry-refresh' } });
  cacheFlush();
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
