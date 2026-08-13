// Phase 7 Step 4 validation — SQLite cache layer (7.2).
//   npx tsx scripts/sqlite-cache-step4-test.ts
//
// Exercises every function of src/services/sqlite.cache.service.ts against the
// real SQLite DB using scratch keys (prefix "__step4_test:" and the scratch
// season "__step4_test_season") that are deleted at the end, so it never
// touches production cache rows.
import { prisma } from '../src/db/client.js';
import {
  getCacheInfo,
  getCacheStats,
  getExpiredCaches,
  isCacheStale,
  isCacheValid,
  isLeaderboardFresh,
  isMomentumFresh,
  isRiskScoreFresh,
  isStoryFresh,
  markCacheInvalid,
  markCacheValid,
  markLeaderboardComputed,
  markMomentumComputed,
  markRiskScoreComputed,
} from '../src/services/sqlite.cache.service.js';
import { CacheDataType, SQLITE_TTL } from '../src/utils/cache.config.js';

const PREFIX = '__step4_test:';
// Scratch season for sport-scoped helpers — keeps leaderboard/momentum rows
// out of the real season's namespace so they can never look like real data.
const SCRATCH_SEASON = '__step4_test_season';
const SCRATCH_PLAYER_ID = 999_999_999; // guaranteed non-existent — no real rows clobbered

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

async function main(): Promise<void> {
  const now = Date.now();
  const freshKey = `${PREFIX}fresh`;
  const staleKey = `${PREFIX}stale`;
  const invalidKey = `${PREFIX}invalid`;

  // --- 4.1 isCacheValid / markCacheValid / getCacheInfo ---
  console.log('4.1 core registry:');
  check('isCacheValid(missing) → false', (await isCacheValid(freshKey)) === false);
  const missingStale = await isCacheStale(freshKey);
  check('isCacheStale(missing) → { isStale:false, staleSince:null }', missingStale.isStale === false && missingStale.staleSince === null);

  await markCacheValid(freshKey, CacheDataType.TEAM_DATA, { ttl: 3600, recordCount: 3 });
  check('isCacheValid → true after markCacheValid', await isCacheValid(freshKey));

  const info = await getCacheInfo(freshKey);
  check('getCacheInfo returns the record', info != null && info.cacheKey === freshKey);
  check(
    'record fields set (dataType, isValid, recordCount)',
    info != null && info.dataType === CacheDataType.TEAM_DATA && info.isValid === true && info.recordCount === 3
  );
  check(
    'expiresAt = cachedAt + ttl',
    info != null && Math.abs(info.expiresAt.getTime() - (info.cachedAt.getTime() + 3600_000)) < 2000
  );
  const freshStale = await isCacheStale(freshKey);
  check('isCacheStale while fresh → { isStale:false, staleSince:null }', freshStale.isStale === false && freshStale.staleSince === null);

  // --- expiry + getExpiredCaches ---
  await markCacheValid(staleKey, CacheDataType.SEARCH_RESULTS, { ttl: 1 });
  check('fresh right after 1s-TTL mark', await isCacheValid(staleKey));
  await new Promise(resolve => {
    setTimeout(resolve, 1100);
  });
  check('expired after TTL → isCacheValid false', (await isCacheValid(staleKey)) === false);
  const staleness = await isCacheStale(staleKey);
  check('isCacheStale → { isStale:true, staleSince≈expiry }', staleness.isStale === true && staleness.staleSince != null);

  const expired = await getExpiredCaches();
  check('getExpiredCaches includes expired scratch key', expired.some(e => e.cacheKey === staleKey));
  const expiredFiltered = await getExpiredCaches(CacheDataType.SEARCH_RESULTS);
  check(
    'getExpiredCaches(dataType) filters correctly',
    expiredFiltered.some(e => e.cacheKey === staleKey) && expiredFiltered.every(e => e.dataType === CacheDataType.SEARCH_RESULTS)
  );

  // --- markCacheInvalid (single + array) ---
  await markCacheValid(invalidKey, CacheDataType.STORY_TEXT, { ttl: 3600 });
  const invalidatedSingle = await markCacheInvalid(invalidKey);
  check('markCacheInvalid(single) → count 1', invalidatedSingle === 1);
  check('isCacheValid → false after invalidate', (await isCacheValid(invalidKey)) === false);
  const invalidation = await isCacheStale(invalidKey);
  check('isCacheStale after invalidate → true with staleSince', invalidation.isStale === true && invalidation.staleSince != null);

  await markCacheValid(`${PREFIX}a`, CacheDataType.TEAM_DATA, { ttl: 3600 });
  await markCacheValid(`${PREFIX}b`, CacheDataType.TEAM_DATA, { ttl: 3600 });
  const invalidatedMany = await markCacheInvalid([`${PREFIX}a`, `${PREFIX}b`]);
  check('markCacheInvalid(array of 2) → count 2', invalidatedMany === 2);
  check('both array keys now invalid', !(await isCacheValid(`${PREFIX}a`)) && !(await isCacheValid(`${PREFIX}b`)));

  // --- getCacheStats ---
  const stats = await getCacheStats();
  check('stats.totalEntries includes scratch entries', stats.totalEntries >= 4);
  check('stats.validEntries excludes expired/invalid scratch rows', stats.validEntries <= stats.totalEntries);
  check('stats.expiredEntries ≥ 1 (the expired scratch key)', stats.expiredEntries >= 1);
  check('stats.byDataType has team_data + search_results', stats.byDataType[CacheDataType.TEAM_DATA] != null && stats.byDataType[CacheDataType.SEARCH_RESULTS] != null);
  check('stats.oldestEntry is a record or null', stats.oldestEntry === null || typeof stats.oldestEntry.cacheKey === 'string');

  // --- 4.2 specific helpers ---
  console.log('4.2 specific helpers:');

  // Risk score (scratch player id — verifies key + TTL + freshness cycle)
  check('isRiskScoreFresh(scratch) → false initially', (await isRiskScoreFresh(SCRATCH_PLAYER_ID)) === false);
  await markRiskScoreComputed(SCRATCH_PLAYER_ID);
  const riskInfo = await getCacheInfo(`risk:${SCRATCH_PLAYER_ID}`);
  check('markRiskScoreComputed → CacheMetadata row for risk:{id}', riskInfo != null);
  check(
    'risk row: dataType RISK_SCORES + 6h TTL + entityId',
    riskInfo != null &&
      riskInfo.dataType === CacheDataType.RISK_SCORES &&
      Math.abs(riskInfo.expiresAt.getTime() - (riskInfo.cachedAt.getTime() + SQLITE_TTL.RISK_SCORES * 1000)) < 2000 &&
      riskInfo.entityId === String(SCRATCH_PLAYER_ID)
  );
  check('isRiskScoreFresh → true right after mark', await isRiskScoreFresh(SCRATCH_PLAYER_ID));
  await markCacheInvalid(`risk:${SCRATCH_PLAYER_ID}`);
  check('isRiskScoreFresh → false after invalidate', (await isRiskScoreFresh(SCRATCH_PLAYER_ID)) === false);

  // Leaderboard + momentum (sport-scoped with a SCRATCH season, also proves
  // sportId resolution — 'NBA' resolves to the real sport id in the Sports table)
  const sport = await prisma.sports.findFirst({ select: { id: true, abbreviation: true, season: true } });
  if (sport) {
    check('isLeaderboardFresh → false initially', (await isLeaderboardFresh('NBA', SCRATCH_SEASON, '4th_down')) === false);
    await markLeaderboardComputed('NBA', SCRATCH_SEASON, '4th_down');
    const lb = await getCacheInfo(`leaderboard:NBA:${SCRATCH_SEASON}:4th_down`);
    check('markLeaderboardComputed → row for leaderboard:{sport}:{season}:{type}', lb != null);
    check(
      'leaderboard row: dataType COACH_LEADERBOARD + 24h TTL',
      lb != null && lb.dataType === CacheDataType.COACH_LEADERBOARD && Math.abs(lb.expiresAt.getTime() - (lb.cachedAt.getTime() + SQLITE_TTL.COACH_LEADERBOARD * 1000)) < 2000
    );
    check('leaderboard row resolves sportId via lowercase lookup', lb?.sportId === sport.id);
    check('isLeaderboardFresh → true after mark', await isLeaderboardFresh('NBA', SCRATCH_SEASON, '4th_down'));

    check('isMomentumFresh → false initially', (await isMomentumFresh('NBA', SCRATCH_SEASON)) === false);
    await markMomentumComputed('NBA', SCRATCH_SEASON);
    const mo = await getCacheInfo(`momentum:season:NBA:${SCRATCH_SEASON}`);
    check('markMomentumComputed → row for momentum:season:{sport}:{season}', mo != null);
    check(
      'momentum row: dataType MOMENTUM_ANALYSIS + 24h TTL + sportId',
      mo != null && mo.dataType === CacheDataType.MOMENTUM_ANALYSIS && Math.abs(mo.expiresAt.getTime() - (mo.cachedAt.getTime() + SQLITE_TTL.MOMENTUM_ANALYSIS * 1000)) < 2000 && mo.sportId === sport.id
    );
    check('isMomentumFresh → true after mark', await isMomentumFresh('NBA', SCRATCH_SEASON));
  } else {
    console.log('  (no sports in DB — skipping leaderboard/momentum checks)');
  }

  // Story (checks the StoryLogs table directly)
  const storyKey = `${PREFIX}story`;
  check('isStoryFresh(missing) → false', (await isStoryFresh(storyKey)) === false);
  await prisma.storyLogs.create({
    data: {
      storyKey,
      module: 'injury',
      sport: 'NBA',
      role: 'fan',
      storyText: 'scratch story',
      keyMetrics: {},
      generatedBy: 'template',
      expiresAt: new Date(now + 3600_000),
    },
  });
  check('isStoryFresh after row created → true', await isStoryFresh(storyKey));

  // --- cleanup: delete every scratch row created above ---
  await prisma.cacheMetadata.deleteMany({ where: { cacheKey: { startsWith: PREFIX } } });
  await prisma.cacheMetadata.deleteMany({ where: { cacheKey: { contains: SCRATCH_SEASON } } });
  await prisma.cacheMetadata.deleteMany({ where: { cacheKey: `risk:${SCRATCH_PLAYER_ID}` } });
  await prisma.storyLogs.deleteMany({ where: { storyKey: { startsWith: PREFIX } } });

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch(err => {
    console.error('STEP4 TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
