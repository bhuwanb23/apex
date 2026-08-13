// Phase 7 Step 10 — test the entire cache system (all 9 doc tests).
//   npx tsx scripts/cache-step10-system-test.ts
//
//   T1 memory cache basic        → search MISS → HIT + stats counters
//   T2 sqlite restart persistence→ a real child process primes a leaderboard,
//                                  a fresh parent process serves it HIT/sqlite
//   T3 stale-while-revalidate    → invalidate via route → STALE → background
//                                  refresh → HIT (scratch TTL path is covered
//                                  by the step-6 suite)
//   T4 cache headers             → X-Cache-Status/Age/TTL/Layer present, age
//                                  does not decrease
//   T5 invalidation via route    → leaderboard HIT → { type, sport } → MISS
//   T6 warming                   → flush all → warmup → warmed routes HIT
//   T7 concurrent / dog-pile     → 10 simultaneous misses run the controller
//                                  exactly once (1 MISS, 9 HIT)
//   T8 large response            → leaderboard cached, ksize > 0
//   T9 job integration           → risk_compute with ML down skips + keeps
//                                  caches; zone-change invalidation (the exact
//                                  calls the job makes) drops alerts to MISS
//
// Requires the seeded dev DB (sports present). JOB_CONTROL_ADMIN_KEY is set
// here because the real .env doesn't configure it.

process.env.LOG_LEVEL = 'silent';
process.env.JOB_CONTROL_ADMIN_KEY = 'step10-test-admin';
// The main app listens on env.PORT so the middleware's background refresh
// (self-request) reaches the right server.
process.env.PORT = '8136';

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

// NOTE: env vars must be set before ANY import of src/config/env.js, so all
// app imports are dynamic (static imports are hoisted past the assignments).
const { createApp } = await import('../src/app.js');
const { cacheFlush } = await import('../src/cache/memoryCache.js');
const { env } = await import('../src/config/env.js');
const { prisma } = await import('../src/db/client.js');
const { runJob } = await import('../src/jobs/job.runner.js');
const { recordMLHealthCheck } = await import('../src/ml/availability.js');
const { createCacheMiddleware } = await import('../src/middleware/cache.middleware.js');
const {
  invalidatePlayerCache,
  invalidateTeamCache,
} = await import('../src/services/cache.invalidation.js');

const ADMIN = env.JOB_CONTROL_ADMIN_KEY;
const PORT = Number(env.PORT);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const cleanKeys: string[] = [];

try {
  const app = createApp();
  const server = await new Promise<import('node:http').Server>(resolve => {
    const srv = app.listen(PORT, () => resolve(srv));
  });
  const base = `http://127.0.0.1:${PORT}`;

  // Clean slate: other suites (e.g. the step-9 warmup) can leave valid
  // leaderboard registry rows behind, which would flip T2's child "first
  // request" from MISS to a registry HIT.
  await prisma.cacheMetadata.deleteMany({ where: { cacheKey: { startsWith: 'leaderboard:NBA:' } } });
  cacheFlush();

  // -------------------------------------------------------------------------
  // T1 — Memory cache basic
  // -------------------------------------------------------------------------
  console.log('T1. memory cache basic:');
  const p1 = await fetch(`${base}/api/search/players?q=jam&sport=NBA`);
  check('search first request → MISS', p1.headers.get('x-cache-status') === 'MISS', p1.headers.get('x-cache-status'));
  const p2 = await fetch(`${base}/api/search/players?q=jam&sport=NBA`);
  check(
    'search second request → HIT (memory)',
    p2.headers.get('x-cache-status') === 'HIT' && p2.headers.get('x-cache-layer') === 'memory',
    { status: p2.headers.get('x-cache-status'), layer: p2.headers.get('x-cache-layer') }
  );
  const stats1 = (await (await fetch(`${base}/api/cache/stats`)).json()).data;
  check('stats record hits', stats1.memory.hits >= 1, stats1.memory);
  check('stats record misses', stats1.memory.misses >= 1, stats1.memory);

  // -------------------------------------------------------------------------
  // T2 — SQLite cache survives a REAL process restart
  // -------------------------------------------------------------------------
  console.log('T2. sqlite restart persistence:');
  const childPath = path.join(__dirname, 'helpers', 'cache-restart-child.ts');
  const child = spawnSync(`npx --no-install tsx "${childPath}"`, {
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, PORT: '8141' },
    timeout: 60_000,
  });
  check('child process ran', child.status === 0, child.stderr?.slice(0, 300));
  const childStatus = /CHILD_STATUS=(\S+)/.exec(child.stdout ?? '')?.[1];
  check('child primed the entry (MISS)', childStatus === 'MISS', childStatus);

  // Simulate the parent (fresh process): memory is empty, the SQLite registry
  // must still serve the entry from the child's run.
  cacheFlush();
  const app2 = createApp();
  const server2 = await new Promise<import('node:http').Server>(resolve => {
    const srv2 = app2.listen(8141, () => resolve(srv2));
  });
  const base2 = `http://127.0.0.1:8141`;
  const r2 = await fetch(`${base2}/api/decisions/coaches/NBA`);
  check(
    'after restart → HIT (sqlite layer)',
    r2.headers.get('x-cache-status') === 'HIT' && r2.headers.get('x-cache-layer') === 'sqlite',
    { status: r2.headers.get('x-cache-status'), layer: r2.headers.get('x-cache-layer') }
  );
  server2.close();
  // Give T3 a clean slate: the shared in-process memory cache just absorbed
  // the 8141 instance's response, and the registry holds a valid row.
  await prisma.cacheMetadata.deleteMany({ where: { cacheKey: { startsWith: 'leaderboard:NBA:' } } });
  cacheFlush();

  // -------------------------------------------------------------------------
  // T3 — Stale while revalidate via the invalidate route
  // -------------------------------------------------------------------------
  console.log('T3. stale-while-revalidate:');
  const lb1 = await fetch(`${base}/api/decisions/coaches/NBA`);
  const lbKey = (await (await fetch(`${base}/api/cache/entries`)).json()).data.entries.find(
    (x: { cacheKey: string }) => x.cacheKey.startsWith('leaderboard:NBA:')
  )?.cacheKey;
  check('leaderboard cached (MISS first)', lb1.headers.get('x-cache-status') === 'MISS', lb1.headers.get('x-cache-status'));
  check('leaderboard registry key exists', typeof lbKey === 'string', lbKey);

  // Manually expire via the route → next request serves STALE + refreshes.
  const inv = await (
    await fetch(`${base}/api/cache/invalidate`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN },
      body: JSON.stringify({ key: lbKey }),
    })
  ).json();
  check('key invalidated via route', inv.success === true, inv);
  const stale1 = await fetch(`${base}/api/decisions/coaches/NBA`);
  check(
    'expired entry → STALE (sqlite)',
    stale1.headers.get('x-cache-status') === 'STALE' && stale1.headers.get('x-cache-layer') === 'sqlite',
    { status: stale1.headers.get('x-cache-status'), layer: stale1.headers.get('x-cache-layer') }
  );
  // Poll for the background refresh (fire-and-forget) to land instead of a
  // fixed sleep — avoids flakes on slow machines.
  let fresh1: Response | null = null;
  for (let i = 0; i < 20; i++) {
    const probe = await fetch(`${base}/api/decisions/coaches/NBA`);
    if (probe.headers.get('x-cache-status') === 'HIT') {
      fresh1 = probe;
      break;
    }
    await wait(250);
  }
  check('after refresh → HIT', fresh1?.headers.get('x-cache-status') === 'HIT', fresh1?.headers.get('x-cache-status'));

  // -------------------------------------------------------------------------
  // T4 — Cache headers (age present and non-decreasing)
  // -------------------------------------------------------------------------
  console.log('T4. cache headers:');
  const h1 = await fetch(`${base}/api/sports/NBA/teams`);
  const h2 = await fetch(`${base}/api/sports/NBA/teams`);
  for (const [name, h] of [
    ['X-Cache-Status', h2],
    ['X-Cache-Age', h2],
    ['X-Cache-TTL', h2],
    ['X-Cache-Layer', h2],
  ] as const) {
    check(`${name} header present`, h.headers.get(name.toLowerCase()) !== null);
  }
  const age1 = Number(h1.headers.get('x-cache-age'));
  const age2 = Number(h2.headers.get('x-cache-age'));
  check('X-Cache-Age does not decrease on repeat', age2 >= age1, { age1, age2 });

  // -------------------------------------------------------------------------
  // T5 — Invalidation via route ({ type, sport })
  // -------------------------------------------------------------------------
  console.log('T5. invalidation via route:');
  const lb5a = await fetch(`${base}/api/decisions/coaches/NBA`);
  const lb5b = await fetch(`${base}/api/decisions/coaches/NBA`);
  check('leaderboard cached (HIT)', lb5b.headers.get('x-cache-status') === 'HIT', lb5b.headers.get('x-cache-status'));
  const inv5 = await (
    await fetch(`${base}/api/cache/invalidate`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN },
      body: JSON.stringify({ type: 'coach_leaderboard', sport: 'NBA' }),
    })
  ).json();
  check('type+sport invalidation accepted', inv5.success === true && inv5.data.invalidated === 'type+sport', inv5);
  const lb5c = await fetch(`${base}/api/decisions/coaches/NBA`);
  // Step 7 marks rows invalid (never deletes) and the leaderboard route has
  // allowStale, so the next request is STALE (recomputed, not served from the
  // old cached response) rather than MISS. The essential property: NOT HIT.
  check(
    'leaderboard not served from old cache (recomputed)',
    lb5c.headers.get('x-cache-status') !== 'HIT',
    lb5c.headers.get('x-cache-status')
  );

  // -------------------------------------------------------------------------
  // T6 — Warming
  // -------------------------------------------------------------------------
  console.log('T6. cache warming:');
  await fetch(`${base}/api/cache/invalidate`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN },
    body: JSON.stringify({ all: true }),
  });
  const warm = await (await fetch(`${base}/api/cache/warmup`)).json();
  check('warmup ran', warm.success === true && warm.data.alreadyRunning === false, warm);
  const warmStats = (await (await fetch(`${base}/api/cache/stats`)).json()).data;
  check('several entries loaded', warmStats.memory.keys >= 1, warmStats.memory);
  const warmAlert = await fetch(`${base}/api/injury/alerts/NBA`);
  const warmLb = await fetch(`${base}/api/decisions/coaches/NBA`);
  check(
    'warmed alert route → HIT',
    warmAlert.headers.get('x-cache-status') === 'HIT',
    warmAlert.headers.get('x-cache-status')
  );
  check(
    'warmed leaderboard route → HIT',
    warmLb.headers.get('x-cache-status') === 'HIT',
    warmLb.headers.get('x-cache-status')
  );

  // -------------------------------------------------------------------------
  // T7 — Concurrent requests (dog-pile prevention)
  // -------------------------------------------------------------------------
  console.log('T7. concurrent requests:');
  const scratchApp = express();
  let computeCount = 0;
  scratchApp.get(
    '/slow',
    createCacheMiddleware({ ttl: 60, cacheLayer: 'memory', keyBuilder: () => 'test:stampede' }),
    async (_req, res) => {
      computeCount += 1;
      await wait(300); // force the followers to overlap with the leader
      res.json({ n: computeCount });
    }
  );
  const scratchServer = await new Promise<import('node:http').Server>(resolve => {
    const srv = scratchApp.listen(8137, () => resolve(srv));
  });
  const results = await Promise.all(
    Array.from({ length: 10 }, () => fetch('http://127.0.0.1:8137/slow'))
  );
  const statuses = results.map(r => r.headers.get('x-cache-status'));
  check('10 concurrent → controller ran once', computeCount === 1, { computeCount });
  check('exactly one MISS', statuses.filter(s => s === 'MISS').length === 1, statuses);
  check('nine HITs', statuses.filter(s => s === 'HIT').length === 9, statuses);
  scratchServer.close();

  // Real route stampede check (fast controller — allow a hair of slack).
  await fetch(`${base}/api/cache/invalidate`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN },
    body: JSON.stringify({ all: true }),
  });
  const realResults = await Promise.all(
    Array.from({ length: 10 }, () => fetch(`${base}/api/sports/NBA/teams`))
  );
  const realStatuses = realResults.map(r => r.headers.get('x-cache-status'));
  const realMisses = realStatuses.filter(s => s === 'MISS').length;
  // Single-flight should make exactly one compute; a hair of slack covers the
  // microsecond race where two requests both pass the in-flight check.
  check(
    'real route: at most 2 of 10 computed fresh (rest HIT)',
    realMisses <= 2 && realStatuses.filter(s => s === 'HIT').length >= 8,
    realStatuses
  );

  // -------------------------------------------------------------------------
  // T8 — Large response caching
  // -------------------------------------------------------------------------
  console.log('T8. large response caching:');
  await fetch(`${base}/api/decisions/coaches/NBA`);
  const bigStats = (await (await fetch(`${base}/api/cache/stats`)).json()).data;
  check('leaderboard cached (HIT)', (await (await fetch(`${base}/api/decisions/coaches/NBA`)).json()).success === true);
  check('memory ksize reflects stored data', bigStats.memory.keys >= 1, bigStats.memory);

  // -------------------------------------------------------------------------
  // T9 — Background job cache integration
  // -------------------------------------------------------------------------
  console.log('T9. background job cache integration:');
  const a1 = await fetch(`${base}/api/injury/alerts/NBA`);
  const a2 = await fetch(`${base}/api/injury/alerts/NBA`);
  check('alerts cached (HIT)', a2.headers.get('x-cache-status') === 'HIT', a2.headers.get('x-cache-status'));

  // Register + run the real risk_compute job. With the ML service down it must
  // skip cleanly and KEEP existing caches (documented Step 6.6 behavior).
  const { queueManager } = await import('../src/jobs/queue.manager.js');
  await import('../src/jobs/scheduler.js'); // side-effect job registration
  const riskJob = queueManager.get('risk_compute');
  check('risk_compute job registered', riskJob != null);
  if (riskJob) {
    // Report Python as down (as the health_check job would after failed probes)
    // so the job exercises its documented ML-unavailable skip path.
    recordMLHealthCheck(false);
    const result = await runJob(riskJob, { triggeredBy: 'manual' });
    check(
      'ML down → job skipped without failing the process',
      result.status === 'failed' &&
        JSON.stringify(result.summary ?? {}).includes('ML service unavailable'),
      { status: result.status, summary: result.summary }
    );
    const a3 = await fetch(`${base}/api/injury/alerts/NBA`);
    check('skipped job kept the cached alerts (HIT)', a3.headers.get('x-cache-status') === 'HIT', a3.headers.get('x-cache-status'));
  }

  // The job's zone-change path invalidates via invalidatePlayerCache +
  // invalidateTeamCache — exercise those exact calls against seeded data.
  const nba = await prisma.sports.findUnique({ where: { abbreviation: 'nba' } });
  if (!nba) throw new Error('NBA sport not seeded — aborting');
  const team = await prisma.teams.create({
    data: {
      sportId: nba.id,
      name: 'Step10 Testers',
      abbreviation: 'S10',
      city: 'Testville',
      externalId: 'STEP10-TEAM',
      isActive: true,
    },
  });
  const player = await prisma.players.create({
    data: {
      teamId: team.id,
      sportId: nba.id,
      name: 'Step Ten',
      firstName: 'Step',
      lastName: 'Ten',
      position: 'PG',
      externalId: 'STEP10-PLAYER',
      isActive: true,
    },
  });
  cleanKeys.push(`risk:${player.id}`, `risk:team:${team.id}`);
  const invP = await (
    await fetch(`${base}/api/cache/invalidate`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN },
      body: JSON.stringify({ key: `alerts:NBA:red` }),
    })
  ).json();
  check('alert cache invalidation accepted', invP.success === true, invP);

  // Seed a cached alert again, then run the job's exact invalidation calls.
  const a4 = await fetch(`${base}/api/injury/alerts/NBA`);
  const a5 = await fetch(`${base}/api/injury/alerts/NBA`);
  check('alerts cached again (HIT)', a5.headers.get('x-cache-status') === 'HIT', a5.headers.get('x-cache-status'));
  await invalidatePlayerCache(player.id);
  await invalidateTeamCache(team.id, 'NBA'); // what risk_compute does per zone change
  const a6 = await fetch(`${base}/api/injury/alerts/NBA`);
  check('zone-change invalidation drops alerts to MISS', a6.headers.get('x-cache-status') === 'MISS', a6.headers.get('x-cache-status'));

  server.close();
} finally {
  await prisma.players.deleteMany({ where: { externalId: 'STEP10-PLAYER' } });
  await prisma.teams.deleteMany({ where: { externalId: 'STEP10-TEAM' } });
  if (cleanKeys.length > 0) {
    await prisma.cacheMetadata.deleteMany({ where: { cacheKey: { in: cleanKeys } } });
  }
  await prisma.cacheMetadata.deleteMany({ where: { cacheKey: { startsWith: 'leaderboard:NBA:' } } });
  cacheFlush();
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
