// Phase 7 Step 7 validation — cache invalidation system (Step 7.1).
//   npx tsx scripts/cache-invalidation-step7-test.ts
//
// Verifies each invalidation function:
//   - removes the affected entries from memory (service-level keys AND the
//     middleware's "resp:" response entries), and
//   - marks the CacheMetadata registry rows invalid (isValid = false) WITHOUT
//     deleting them — the underlying data tables are untouched.
// Also verifies invalidateSportCache catches both key-prefix rows (middleware
// style, no sportId) and sportId-scoped rows (fetch-layer style), leaves other
// sports alone, and that invalidateAllCaches flushes memory + the registry.
//
// NOTE: invalidateAllCaches flips EVERY registry row invalid (the documented
// nuclear option) — real rows auto-heal on the next request/sync. The test
// deletes only the rows it created.

process.env.LOG_LEVEL = 'silent';

const { cacheFlush, cacheGet, cacheSet, memoryCache } = await import('../src/cache/memoryCache.js');
const { prisma } = await import('../src/db/client.js');
const { markCacheValid } = await import('../src/services/sqlite.cache.service.js');
const {
  invalidateAllCaches,
  invalidateLeaderboard,
  invalidateMomentumAnalysis,
  invalidatePlayerCache,
  invalidateSportCache,
  invalidateTeamCache,
} = await import('../src/services/cache.invalidation.js');
const { CacheDataType, SQLITE_TTL } = await import('../src/utils/cache.config.js');
const {
  alertsKey,
  leaderboardKey,
  momentumSeasonKey,
  playerInfoKey,
  riskScoreKey,
  searchPlayersKey,
  sportConfigKey,
  teamListKey,
  teamRiskKey,
} = await import('../src/utils/cache.keys.js');

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

const testKeys: string[] = [];

try {
  // -------------------------------------------------------------------------
  // 1. invalidatePlayerCache — memory + registry, data preserved
  // -------------------------------------------------------------------------
  console.log('1. invalidatePlayerCache:');
  const P = 4_242_001;
  cacheSet(playerInfoKey(P), { name: 'Test Player' }, 3600);
  cacheSet(riskScoreKey(P), { riskScore: 80 }, 3600);
  cacheSet(`resp:risk:${P}`, { status: 200, body: { zone: 'red' } }, 3600);
  cacheSet(`resp:player:info:${P}`, { status: 200, body: {} }, 3600);
  await markCacheValid(riskScoreKey(P), CacheDataType.RISK_SCORES, {
    entityId: String(P),
    ttl: SQLITE_TTL.RISK_SCORES,
  });
  testKeys.push(riskScoreKey(P));

  await invalidatePlayerCache(P);

  check('player:info removed from memory', cacheGet(playerInfoKey(P)) === undefined);
  check('risk key removed from memory', cacheGet(riskScoreKey(P)) === undefined);
  check('resp:risk entry removed from memory', cacheGet(`resp:risk:${P}`) === undefined);
  check('resp:player:info entry removed', cacheGet(`resp:player:info:${P}`) === undefined);
  const pRow = await prisma.cacheMetadata.findUnique({ where: { cacheKey: riskScoreKey(P) } });
  check(
    'registry row marked invalid, NOT deleted',
    pRow != null && pRow.isValid === false,
    { isValid: pRow?.isValid }
  );

  // -------------------------------------------------------------------------
  // 2. invalidateTeamCache — team risk, all alert zones, team list
  // -------------------------------------------------------------------------
  console.log('2. invalidateTeamCache:');
  const T = 4_242_002;
  cacheSet(teamRiskKey(T), { zone: 'red' }, 3600);
  cacheSet(`resp:risk:team:${T}`, {}, 3600);
  for (const zone of ['red', 'yellow', 'green']) {
    cacheSet(alertsKey('NBA', zone), [zone], 3600);
    cacheSet(`resp:alerts:NBA:${zone}`, {}, 3600);
  }
  cacheSet(teamListKey('NBA'), [1, 2, 3], 3600);
  cacheSet(`resp:teams:NBA`, {}, 3600);
  await markCacheValid(teamRiskKey(T), CacheDataType.RISK_SCORES, {
    ttl: SQLITE_TTL.RISK_SCORES,
  });
  testKeys.push(teamRiskKey(T));

  await invalidateTeamCache(T, 'NBA');

  check('team risk removed from memory', cacheGet(teamRiskKey(T)) === undefined);
  check('resp:team risk removed', cacheGet(`resp:risk:team:${T}`) === undefined);
  for (const zone of ['red', 'yellow', 'green']) {
    check(`alerts:${zone} removed`, cacheGet(alertsKey('NBA', zone)) === undefined);
    check(`resp:alerts:${zone} removed`, cacheGet(`resp:alerts:NBA:${zone}`) === undefined);
  }
  check('team list removed', cacheGet(teamListKey('NBA')) === undefined);
  const tRow = await prisma.cacheMetadata.findUnique({ where: { cacheKey: teamRiskKey(T) } });
  check('team registry row marked invalid', tRow != null && tRow.isValid === false);

  // -------------------------------------------------------------------------
  // 3. invalidateLeaderboard — full family for (sport, season), others kept
  // -------------------------------------------------------------------------
  console.log('3. invalidateLeaderboard:');
  const lbAll = leaderboardKey('NBA', '2024-25', 'all', 'all');
  const lb4th = leaderboardKey('NBA', '2024-25', '4th_down', 'regular');
  const lbOtherSeason = leaderboardKey('NBA', '2023-24', 'all', 'all');
  const lbOtherSport = leaderboardKey('NFL', '2024-25', 'all', 'all');
  for (const key of [lbAll, lb4th, lbOtherSeason, lbOtherSport]) {
    cacheSet(key, { coaches: [] }, 3600);
    cacheSet(`resp:${key}`, {}, 3600);
  }
  await markCacheValid(lbAll, CacheDataType.COACH_LEADERBOARD, {
    ttl: SQLITE_TTL.COACH_LEADERBOARD,
  });
  testKeys.push(lbAll);

  await invalidateLeaderboard('NBA', '2024-25');

  check('leaderboard (all) removed', cacheGet(lbAll) === undefined);
  check('leaderboard (4th_down) removed', cacheGet(lb4th) === undefined);
  check('resp leaderboard removed', cacheGet(`resp:${lbAll}`) === undefined);
  check('other season kept', cacheGet(lbOtherSeason) !== undefined);
  check('other sport kept', cacheGet(lbOtherSport) !== undefined);
  const lbRow = await prisma.cacheMetadata.findUnique({ where: { cacheKey: lbAll } });
  check('leaderboard registry marked invalid', lbRow != null && lbRow.isValid === false);

  // -------------------------------------------------------------------------
  // 4. invalidateMomentumAnalysis — memory + registry
  // -------------------------------------------------------------------------
  console.log('4. invalidateMomentumAnalysis:');
  const mKey = momentumSeasonKey('NBA', '2024-25');
  cacheSet(mKey, { hazardCoefficient: 0.4 }, 3600);
  cacheSet(`resp:${mKey}`, {}, 3600);
  await markCacheValid(mKey, CacheDataType.MOMENTUM_ANALYSIS, {
    ttl: SQLITE_TTL.MOMENTUM_ANALYSIS,
  });
  testKeys.push(mKey);

  await invalidateMomentumAnalysis('NBA', '2024-25');

  check('momentum key removed', cacheGet(mKey) === undefined);
  check('resp momentum removed', cacheGet(`resp:${mKey}`) === undefined);
  const mRow = await prisma.cacheMetadata.findUnique({ where: { cacheKey: mKey } });
  check('momentum registry marked invalid', mRow != null && mRow.isValid === false);

  // -------------------------------------------------------------------------
  // 5. invalidateSportCache — memory families + key-prefix + sportId rows
  // -------------------------------------------------------------------------
  console.log('5. invalidateSportCache:');
  cacheSet(searchPlayersKey('NBA', 'jam'), [{ id: 1 }], 3600);
  cacheSet(`resp:${searchPlayersKey('NBA', 'jam')}`, {}, 3600);
  cacheSet(teamListKey('NBA'), [1, 2], 3600);
  cacheSet(alertsKey('NBA', 'red'), [1], 3600);
  cacheSet(sportConfigKey('NBA'), { decisionTypes: [] }, 3600);
  cacheSet(leaderboardKey('NBA', '2024-25', 'all'), { coaches: [] }, 3600);
  cacheSet(momentumSeasonKey('NBA', '2024-25'), {}, 3600);

  const nba = await prisma.sports.findUnique({ where: { abbreviation: 'nba' } });
  if (!nba) throw new Error('NBA sport not seeded — aborting');
  const otherSport = await prisma.sports.findFirst({ where: { abbreviation: { not: 'nba' } } });
  const otherSportId = otherSport?.id ?? nba.id + 999;

  // Fetch-layer style row WITH sportId + middleware style row WITHOUT it.
  await markCacheValid('player_logs:nba:last7', CacheDataType.PLAYER_LOGS, {
    sportId: nba.id,
    ttl: SQLITE_TTL.SEASON_DATA,
  });
  await markCacheValid(leaderboardKey('NBA', '2024-25', 'all'), CacheDataType.COACH_LEADERBOARD, {
    ttl: SQLITE_TTL.COACH_LEADERBOARD,
  });
  await markCacheValid('player_logs:nfl:last7', CacheDataType.PLAYER_LOGS, {
    sportId: otherSportId,
    ttl: SQLITE_TTL.SEASON_DATA,
  });
  testKeys.push('player_logs:nba:last7', 'player_logs:nfl:last7', leaderboardKey('NBA', '2024-25', 'all'));

  await invalidateSportCache('NBA');

  check('search results removed', cacheGet(searchPlayersKey('NBA', 'jam')) === undefined);
  check('resp search removed', cacheGet(`resp:${searchPlayersKey('NBA', 'jam')}`) === undefined);
  check('team list removed', cacheGet(teamListKey('NBA')) === undefined);
  check('alerts removed', cacheGet(alertsKey('NBA', 'red')) === undefined);
  check('sport config removed', cacheGet(sportConfigKey('NBA')) === undefined);
  check('leaderboard removed', cacheGet(leaderboardKey('NBA', '2024-25', 'all')) === undefined);
  check('momentum removed', cacheGet(momentumSeasonKey('NBA', '2024-25')) === undefined);

  const logsRow = await prisma.cacheMetadata.findUnique({ where: { cacheKey: 'player_logs:nba:last7' } });
  check(
    'sportId-scoped registry row invalidated',
    logsRow != null && logsRow.isValid === false,
    { isValid: logsRow?.isValid }
  );
  const lbKey3 = leaderboardKey('NBA', '2024-25', 'all');
  const lbRow3 = await prisma.cacheMetadata.findUnique({ where: { cacheKey: lbKey3 } });
  check(
    'key-prefix (no sportId) registry row invalidated',
    lbRow3 != null && lbRow3.isValid === false,
    { isValid: lbRow3?.isValid }
  );
  const nflRow = await prisma.cacheMetadata.findUnique({ where: { cacheKey: 'player_logs:nfl:last7' } });
  check('other sport registry row untouched', nflRow != null && nflRow.isValid === true);

  // -------------------------------------------------------------------------
  // 6. invalidateAllCaches — nuclear option
  // -------------------------------------------------------------------------
  console.log('6. invalidateAllCaches:');
  cacheSet('test:anything', 1, 3600);
  await markCacheValid('test:all:registry', CacheDataType.STORY_TEXT, { ttl: 3600 });
  testKeys.push('test:all:registry');

  await invalidateAllCaches();

  check('memory fully flushed', memoryCache.keys().length === 0);
  const allRows = await prisma.cacheMetadata.findMany({ select: { isValid: true } });
  check(
    'every registry row marked invalid',
    allRows.length > 0 && allRows.every(r => r.isValid === false),
    { total: allRows.length }
  );
} finally {
  // Cleanup — only the rows this test created (real rows re-heal naturally).
  await prisma.cacheMetadata.deleteMany({ where: { cacheKey: { in: testKeys } } });
  cacheFlush();
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
