// Phase 7 Step 8 validation — cache middleware integrated into all routes.
//   npx tsx scripts/cache-step8-integration-test.ts
//
// The step-6 script already proves the middleware mechanics; this one verifies
// the four routes Step 8 adds caching to are actually wired and behave as
// cached routes (MISS → HIT with X-Cache-* headers):
//   GET /api/injury/team/:teamId         → teamRiskCacheMiddleware
//   GET /api/decisions/coach/:coachId    → coachDetailCacheMiddleware (1h)
//   GET /api/momentum/comparison         → comparisonCacheMiddleware (24h)
//   GET /api/momentum/timeout/:sport     → timeoutCacheMiddleware (30d)
//
// The dev DB has no teams/coaches/timeout rows, so it seeds minimal rows
// (cleaned up afterwards) to make the controllers return 200.

process.env.LOG_LEVEL = 'silent';

// NOTE: env vars must be set before ANY import of src/config/env.js, so all
// app imports below are dynamic.
import { createHash } from 'node:crypto';

const { createApp } = await import('../src/app.js');
const { cacheFlush } = await import('../src/cache/memoryCache.js');
const { prisma } = await import('../src/db/client.js');

const PORT = 8134;
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

/** Replicates momentum.service.buildScenarioKey (sha1 of the canonical tuple). */
function scenarioKey(
  sport: string,
  consecutiveScores: number,
  scoreDiff: number,
  timeRemaining: number,
  period: number,
  timeoutsAvailable: number
): string {
  const canonical = `${sport.toLowerCase()}|${consecutiveScores}|${scoreDiff}|${Math.round(
    timeRemaining
  )}|${period}|${timeoutsAvailable}`;
  return createHash('sha1').update(canonical).digest('hex').slice(0, 12);
}

const cleanedIds: number[] = [];
const registryKeys: string[] = [];

try {
  // Self-clean: a previous interrupted run may have left the seeded rows behind
  // (FK order: coach before team), which would trip the unique constraints.
  await prisma.coaches.deleteMany({ where: { externalId: 'STEP8-COACH' } });
  await prisma.teams.deleteMany({ where: { externalId: 'STEP8-TEAM' } });
  const sk0 = scenarioKey('NBA', 2, -5, 120, 4, 2);
  await prisma.timeoutRecommendations.deleteMany({ where: { scenarioKey: sk0 } });

  const nba = await prisma.sports.findUnique({ where: { abbreviation: 'nba' } });
  if (!nba) throw new Error('NBA sport not seeded — aborting');

  // -------------------------------------------------------------------------
  // Seed minimal rows so the controllers return 200.
  // -------------------------------------------------------------------------
  const team = await prisma.teams.create({
    data: {
      sportId: nba.id,
      name: 'Step8 Testers',
      abbreviation: 'ST8',
      city: 'Testville',
      externalId: 'STEP8-TEAM',
      isActive: true,
    },
  });
  cleanedIds.push(team.id);

  const coach = await prisma.coaches.create({
    data: {
      teamId: team.id,
      sportId: nba.id,
      name: 'Step Eight',
      firstName: 'Step',
      lastName: 'Eight',
      role: 'head_coach',
      externalId: 'STEP8-COACH',
      isActive: true,
    },
  });
  cleanedIds.push(coach.id);

  const timeoutParams = { consecutiveScores: 2, scoreDiff: -5, timeRemaining: 120, period: 4, timeoutsAvailable: 2 };
  const sk = scenarioKey('NBA', 2, -5, 120, 4, 2);
  // SQLite reuses auto-increment ids after a delete, so an interrupted prior
  // run can leave valid registry rows for THESE ids behind — purge the exact
  // keys the test will exercise so every request starts from a clean slate.
  // NOTE: the middleware's timeout registry key is the RAW params form
  // (timeout:{sport}:{params}), not the sha1 DB scenario key.
  const timeoutMwKey = `timeout:NBA:${timeoutParams.consecutiveScores}|${timeoutParams.scoreDiff}|${timeoutParams.timeRemaining}|${timeoutParams.period}|${timeoutParams.timeoutsAvailable}`;
  const purgeKeys = [`risk:team:${team.id}`, `coach:${coach.id}`, timeoutMwKey, 'momentum:comparison:all'];
  registryKeys.push(...purgeKeys);
  await prisma.cacheMetadata.deleteMany({ where: { cacheKey: { in: purgeKeys } } });
  await prisma.timeoutRecommendations.create({
    data: {
      sportId: nba.id,
      scenarioKey: sk,
      consecutiveScores: 2,
      scoreDiff: -5,
      timeRemaining: 120,
      period: 4,
      shouldCallTimeout: true,
      stopProbabilityWith: 0.6,
      stopProbabilityWithout: 0.3,
      probabilityDiff: 0.3,
      recommendationText: 'Step 8 test recommendation',
      confidenceLevel: 'high',
      computedAt: new Date(),
    },
  });

  const app = createApp();
  const server = await new Promise<import('node:http').Server>(resolve => {
    const srv = app.listen(PORT, () => resolve(srv));
  });
  const base = `http://127.0.0.1:${PORT}`;



  // -------------------------------------------------------------------------
  // 1. Team risk
  // -------------------------------------------------------------------------
  console.log('1. GET /api/injury/team/:teamId:');
  const r1 = await fetch(`${base}/api/injury/team/${team.id}`);
  check('first request → MISS', r1.headers.get('x-cache-status') === 'MISS', r1.status);
  check('team risk returns 200', r1.status === 200);
  const r2 = await fetch(`${base}/api/injury/team/${team.id}`);
  check(
    'second request → HIT (memory)',
    r2.headers.get('x-cache-status') === 'HIT' && r2.headers.get('x-cache-layer') === 'memory',
    { status: r2.headers.get('x-cache-status'), layer: r2.headers.get('x-cache-layer') }
  );
  check('X-Cache-TTL present', Number(r2.headers.get('x-cache-ttl')) > 0);

  // -------------------------------------------------------------------------
  // 2. Coach detail (1h TTL — varyBy params get their own entries)
  // -------------------------------------------------------------------------
  console.log('2. GET /api/decisions/coach/:coachId:');
  const c1 = await fetch(`${base}/api/decisions/coach/${coach.id}`);
  check('first request → MISS', c1.headers.get('x-cache-status') === 'MISS', c1.status);
  check('coach detail returns 200', c1.status === 200);
  const c2 = await fetch(`${base}/api/decisions/coach/${coach.id}`);
  check(
    'second request → HIT (memory)',
    c2.headers.get('x-cache-status') === 'HIT' && c2.headers.get('x-cache-layer') === 'memory',
    { status: c2.headers.get('x-cache-status'), layer: c2.headers.get('x-cache-layer') }
  );
  // A varyBy variant of a FRESH resource is recomputed against the registry
  // (sqlite HIT — the underlying data is fresh) and cached under its own
  // memory key; the next identical request is then a memory HIT.
  const c3 = await fetch(`${base}/api/decisions/coach/${coach.id}?decisionType=4th_down`);
  check(
    'different decisionType → fresh variant (sqlite HIT)',
    c3.headers.get('x-cache-status') === 'HIT' && c3.headers.get('x-cache-layer') === 'sqlite',
    { status: c3.headers.get('x-cache-status'), layer: c3.headers.get('x-cache-layer') }
  );
  const c4 = await fetch(`${base}/api/decisions/coach/${coach.id}?decisionType=4th_down`);
  check(
    'variant cached under its own memory entry (HIT/memory)',
    c4.headers.get('x-cache-status') === 'HIT' && c4.headers.get('x-cache-layer') === 'memory',
    { status: c4.headers.get('x-cache-status'), layer: c4.headers.get('x-cache-layer') }
  );

  // -------------------------------------------------------------------------
  // 3. Comparison (24h TTL)
  // -------------------------------------------------------------------------
  console.log('3. GET /api/momentum/comparison:');
  const m1 = await fetch(`${base}/api/momentum/comparison`);
  check('first request → MISS', m1.headers.get('x-cache-status') === 'MISS', m1.status);
  check('comparison returns 200', m1.status === 200);
  const m2 = await fetch(`${base}/api/momentum/comparison`);
  check(
    'second request → HIT (memory)',
    m2.headers.get('x-cache-status') === 'HIT' && m2.headers.get('x-cache-layer') === 'memory',
    { status: m2.headers.get('x-cache-status'), layer: m2.headers.get('x-cache-layer') }
  );

  // -------------------------------------------------------------------------
  // 4. Timeout optimizer (30d TTL — precomputed row serves without ML)
  // -------------------------------------------------------------------------
  console.log('4. GET /api/momentum/timeout/:sport:');
  const qs = `consecutiveScores=${timeoutParams.consecutiveScores}&scoreDiff=${timeoutParams.scoreDiff}&timeRemaining=${timeoutParams.timeRemaining}&period=${timeoutParams.period}&timeoutsAvailable=${timeoutParams.timeoutsAvailable}`;
  const t1 = await fetch(`${base}/api/momentum/timeout/NBA?${qs}`);
  check('first request → MISS', t1.headers.get('x-cache-status') === 'MISS', t1.status);
  check('timeout returns 200', t1.status === 200);
  const t2 = await fetch(`${base}/api/momentum/timeout/NBA?${qs}`);
  check(
    'second request → HIT (memory)',
    t2.headers.get('x-cache-status') === 'HIT' && t2.headers.get('x-cache-layer') === 'memory',
    { status: t2.headers.get('x-cache-status'), layer: t2.headers.get('x-cache-layer') }
  );
  // Different scenario params build a different key — the response must NOT
  // come from the t1/t2 cached entry. With ML down and no precomputed row for
  // this variant the route errors (no cache headers); either way it proves
  // the cached recommendation was not served for a different situation.
  const t3 = await fetch(`${base}/api/momentum/timeout/NBA?${qs}&timeoutsAvailable=0`);
  check(
    'different scenario params are not served from the cached entry',
    t3.headers.get('x-cache-status') !== 'HIT',
    { status: t3.status, cache: t3.headers.get('x-cache-status') }
  );

  server.close();
} finally {
  // Cleanup — FK order matters (coach references team), then registry + memory.
  await prisma.coaches.deleteMany({ where: { externalId: 'STEP8-COACH' } });
  await prisma.teams.deleteMany({ where: { externalId: 'STEP8-TEAM' } });
  const sk = scenarioKey('NBA', 2, -5, 120, 4, 2);
  await prisma.timeoutRecommendations.deleteMany({ where: { scenarioKey: sk } });
  if (registryKeys.length > 0) {
    await prisma.cacheMetadata.deleteMany({ where: { cacheKey: { in: registryKeys } } });
  }
  cacheFlush();
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
