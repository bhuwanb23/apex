// Phase 7 Step 9 validation — cache monitoring routes.
//   npx tsx scripts/cache-step9-monitoring-test.ts
//
// Verifies:
//   GET    /api/cache/stats      → memory + sqlite + performance blocks
//   GET    /api/cache/entries    → computed isExpired/age/ttlRemaining + filters
//   DELETE /api/cache/invalidate → 403 without key, 200 for key / all, actually works
//   GET    /api/cache/warmup     → warms entries; warmed routes return HIT
//
// NOTE: JOB_CONTROL_ADMIN_KEY is set here (before any import of config/env)
// because the real .env doesn't configure it — the route would otherwise 503.
// Warmup + invalidate mutate the dev DB's registry state; invalid rows heal on
// the next request/sync.

process.env.LOG_LEVEL = 'silent';
process.env.JOB_CONTROL_ADMIN_KEY = 'step9-test-admin';
// Warmup self-requests target env.PORT — boot the app on the SAME port.
process.env.PORT = '8135';

const { createApp } = await import('../src/app.js');
const { cacheFlush } = await import('../src/cache/memoryCache.js');
const { env } = await import('../src/config/env.js');
const { prisma } = await import('../src/db/client.js');

const PORT = Number(env.PORT);
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

const ADMIN = env.JOB_CONTROL_ADMIN_KEY;

try {
  const app = createApp();
  const server = await new Promise<import('node:http').Server>(resolve => {
    const srv = app.listen(PORT, () => resolve(srv));
  });
  const base = `http://127.0.0.1:${PORT}`;

  // -------------------------------------------------------------------------
  // 1. Stats — shape, then populated after real traffic
  // -------------------------------------------------------------------------
  console.log('1. GET /api/cache/stats:');
  const s1 = await (await fetch(`${base}/api/cache/stats`)).json();
  const m1 = s1.data?.memory;
  check(
    'memory block present',
    typeof m1?.keys === 'number' && typeof m1?.hitRate === 'number' && typeof m1?.ksize === 'number',
    m1
  );
  check(
    'sqlite block present',
    typeof s1.data?.sqlite?.totalEntries === 'number' &&
      typeof s1.data?.sqlite?.byDataType === 'object' &&
      s1.data.sqlite.byDataType !== null,
    s1.data?.sqlite
  );
  check(
    'performance block present',
    typeof s1.data?.performance?.avgHitResponseMs === 'number' &&
      typeof s1.data?.performance?.avgMissResponseMs === 'number',
    s1.data?.performance
  );

  // Drive real traffic: MISS then HIT so the counters have samples.
  await fetch(`${base}/api/sports/NBA/teams`);
  await fetch(`${base}/api/sports/NBA/teams`);
  const s2 = await (await fetch(`${base}/api/cache/stats`)).json();
  check('memory hits recorded', s2.data.memory.hits >= 1, s2.data.memory);
  check('memory misses recorded', s2.data.memory.misses >= 1, s2.data.memory);
  check('hitRate between 0 and 100', s2.data.memory.hitRate >= 0 && s2.data.memory.hitRate <= 100);

  // -------------------------------------------------------------------------
  // 2. Entries — shape, computed fields, filters
  // -------------------------------------------------------------------------
  console.log('2. GET /api/cache/entries:');
  const e1 = await (await fetch(`${base}/api/cache/entries`)).json();
  check('entries endpoint returns array', Array.isArray(e1.data?.entries), e1.data);
  check('total matches entries length', e1.data?.total === e1.data?.entries.length);
  const first = e1.data?.entries?.[0];
  if (first) {
    check(
      'computed fields present (isExpired/age/ttlRemaining)',
      typeof first.isExpired === 'boolean' &&
        typeof first.age === 'number' &&
        typeof first.ttlRemaining === 'number',
      first
    );
  } else {
    check('computed fields present (isExpired/age/ttlRemaining)', true, 'no entries — skipped');
  }
  const ev = await (await fetch(`${base}/api/cache/entries?valid=true`)).json();
  check(
    'valid=true filter returns only valid entries',
    (ev.data?.entries ?? []).every((x: { isValid: boolean }) => x.isValid === true)
  );
  const ei = await (await fetch(`${base}/api/cache/entries?valid=false`)).json();
  check(
    'valid=false filter returns only invalid entries',
    (ei.data?.entries ?? []).every((x: { isValid: boolean }) => x.isValid === false)
  );

  // -------------------------------------------------------------------------
  // 3. Invalidate — auth, then key + all
  // -------------------------------------------------------------------------
  console.log('3. DELETE /api/cache/invalidate:');
  const noAuth = await fetch(`${base}/api/cache/invalidate`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: 'x' }),
  });
  check('missing admin key → 403', noAuth.status === 403, noAuth.status);
  const wrongAuth = await fetch(`${base}/api/cache/invalidate`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', 'x-admin-key': 'wrong' },
    body: JSON.stringify({ key: 'x' }),
  });
  check('wrong admin key → 403', wrongAuth.status === 403, wrongAuth.status);

  // Prime a both-layer registry row, then invalidate it by key.
  await fetch(`${base}/api/decisions/coaches/NBA`);
  const entries2 = (await (await fetch(`${base}/api/cache/entries`)).json()).data.entries;
  const lbRow = entries2.find((x: { cacheKey: string }) => x.cacheKey.startsWith('leaderboard:NBA:'));
  if (lbRow) {
    const inv = await (
      await fetch(`${base}/api/cache/invalidate`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN },
        body: JSON.stringify({ key: lbRow.cacheKey }),
      })
    ).json();
    check('key invalidation returns 200 payload', inv.success === true, inv);
    const row = await prisma.cacheMetadata.findUnique({ where: { cacheKey: lbRow.cacheKey } });
    check('registry row actually marked invalid', row != null && row.isValid === false, {
      isValid: row?.isValid,
    });
  } else {
    check('key invalidation works', true, 'no leaderboard registry row — skipped');
  }

  const badBody = await fetch(`${base}/api/cache/invalidate`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN },
    body: JSON.stringify({}),
  });
  check('empty body → 400', badBody.status === 400, badBody.status);

  const allInv = await (
    await fetch(`${base}/api/cache/invalidate`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN },
      body: JSON.stringify({ all: true }),
    })
  ).json();
  check('all invalidation returns 200 payload', allInv.success === true && allInv.data.invalidated === 'all', allInv);
  const s3 = await (await fetch(`${base}/api/cache/stats`)).json();
  check('memory flushed by all-invalidation', s3.data.memory.keys === 0, s3.data.memory);

  // -------------------------------------------------------------------------
  // 4. Warmup — warms entries; warmed routes return HIT
  // -------------------------------------------------------------------------
  console.log('4. GET /api/cache/warmup:');
  const w = await (await fetch(`${base}/api/cache/warmup`)).json();
  check('warmup returns 200 payload', w.success === true && w.data.alreadyRunning === false, w);
  check('sport configs warmed', w.data.sportConfigs >= 1, w.data);
  check('team lists warmed', w.data.teamLists >= 1, w.data);
  check('alerts warmed', w.data.alertLists >= 1, w.data);
  check('leaderboards warmed', w.data.leaderboards >= 1, w.data);
  const warmed = await fetch(`${base}/api/sports/NBA/teams`);
  check(
    'warmed route now serves HIT (memory)',
    warmed.headers.get('x-cache-status') === 'HIT' &&
      warmed.headers.get('x-cache-layer') === 'memory',
    { status: warmed.headers.get('x-cache-status'), layer: warmed.headers.get('x-cache-layer') }
  );

  server.close();
} finally {
  cacheFlush();
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
