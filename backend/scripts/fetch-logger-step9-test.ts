// Phase 8 Step 9 — test the data fetch logging.
//   npx tsx scripts/fetch-logger-step9-test.ts
//
//   T1  fetch start (debug) — apiName/endpoint/params/cacheCheck/cacheResult
//   T2  fetch success (info) — responseTimeMs/recordCount/pageCount/cacheUpdated
//   T3  fetch failure — retryable → warn with retryAttempt/retryIn/willRetry;
//       permanent → error; classifyFetchError maps 429/5xx/network/timeout
//   T4  cache hit path — second fetch logs cacheResult 'hit' and skips the API
//   T5  sync logs — start / section / complete with the Step 9.4 fields

// Env first — debug so all levels reach combined.log.
process.env.LOG_LEVEL = 'debug';
process.env.PYTHON_ML_URL = 'http://127.0.0.1:1';

import axios from 'axios';
import { readFileSync, writeFileSync } from 'node:fs';
// Type-only — erased at compile time, so it runs before env-dependent imports.
import type { SportFetcher } from '../src/data/fetcher.manager.js';

// Fresh log file (combined.log is append-only across runs).
writeFileSync('logs/combined.log', '');

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

const { FetcherManager } = await import('../src/data/fetcher.manager.js');
const {
  classifyFetchError,
  logFetchFailure,
  logFetchStart,
  logFetchSuccess,
  logSyncComplete,
  logSyncSection,
  logSyncStart,
} = await import('../src/data/fetch.logger.js');
const { prisma } = await import('../src/db/client.js');

function readLog(): string {
  try {
    return readFileSync('logs/combined.log', 'utf8');
  } catch {
    return '';
  }
}

/** JSON lines whose msg matches. */
function linesForMsg(msg: string): Array<Record<string, unknown>> {
  return readLog()
    .split('\n')
    .filter(l => l.includes(`"msg":"${msg}"`))
    .map(l => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((l): l is Record<string, unknown> => l !== null);
}

/** A fake sport fetcher wired into a FetcherManager subclass (tests only). */
class MockManager extends FetcherManager {
  constructor(private readonly mode: 'ok' | 'fail-once' | 'fail') {
    super();
    this.register(mockFetcher);
  }
  protected override register(fetcher: SportFetcher): void {
    super.register(fetcher);
  }
  async runTeams(): Promise<unknown> {
    return this.fetchTeams('mock');
  }
}

const mockFetcher: SportFetcher = {
  sport: 'mock',
  apiName: 'mockapi',
  fetchTeams: async () => [{ id: 1 }, { id: 2 }],
  fetchPlayers: async () => [{ id: 1 }],
  fetchGames: async () => [{ id: 1 }, { id: 2 }, { id: 3 }],
  fetchPlayerGameLogs: async () => [],
  fetchPlayByPlay: async () => [],
  fetchRosters: async () => [],
  fetchCoaches: async () => [],
};

const CLEANUP_PREFIXES = [
  'teams:mock',
  'players:mock',
  'games:mock',
  'coaches:mock',
  'player_logs:mock',
  'play_by_play:mock',
];

try {
  // -------------------------------------------------------------------------
  // T1/T2 — pure-function logging helpers
  // -------------------------------------------------------------------------
  console.log('T1/T2. fetch log helpers:');
  logFetchStart({
    apiName: 'BallDontLie',
    endpoint: 'players?team_id=9',
    params: { team_id: '9' },
    cacheCheck: true,
    cacheResult: 'miss',
  });
  logFetchSuccess({
    apiName: 'BallDontLie',
    endpoint: 'players',
    responseTimeMs: 123.45,
    recordCount: 7,
    pageCount: 2,
    cacheUpdated: true,
  });
  const startLine = linesForMsg('fetch start').at(-1) as Record<string, unknown>;
  check(
    'fetch start has apiName/endpoint/params/cacheCheck/cacheResult',
    startLine?.apiName === 'BallDontLie' &&
      startLine?.endpoint === 'players?team_id=9' &&
      startLine?.cacheCheck === true &&
      startLine?.cacheResult === 'miss' &&
      typeof startLine?.params === 'object',
    startLine
  );
  const okLine = linesForMsg('fetch success').at(-1) as Record<string, unknown>;
  check(
    'fetch success has responseTimeMs/recordCount/pageCount/cacheUpdated',
    okLine?.apiName === 'BallDontLie' &&
      okLine?.recordCount === 7 &&
      okLine?.pageCount === 2 &&
      okLine?.cacheUpdated === true &&
      typeof okLine?.responseTimeMs === 'number',
    okLine
  );
  check('fetch start is debug level (20)', startLine?.level === 20, startLine?.level);
  check('fetch success is info level (30)', okLine?.level === 30, okLine?.level);

  // -------------------------------------------------------------------------
  // T3 — failure classification + logs
  // -------------------------------------------------------------------------
  console.log('T3. fetch failures:');
  check(
    '429 → rate_limit',
    classifyFetchError(
      new axios.AxiosError('rl', '429', {} as never, {} as never, { status: 429 } as never)
    ).type === 'rate_limit'
  );
  check(
    '500 → server',
    classifyFetchError(
      new axios.AxiosError('srv', '500', {} as never, {} as never, { status: 500 } as never)
    ).type === 'server'
  );
  check(
    'ECONNABORTED → timeout',
    classifyFetchError(new axios.AxiosError('t', 'ECONNABORTED', {} as never, {} as never)).type ===
      'timeout'
  );
  check(
    'ECONNREFUSED → network',
    classifyFetchError(new axios.AxiosError('n', 'ECONNREFUSED', {} as never, {} as never)).type ===
      'network'
  );
  check('plain Error → unknown', classifyFetchError(new Error('boom')).type === 'unknown');

  logFetchFailure({
    apiName: 'ESPN',
    endpoint: 'games',
    errorType: 'network',
    retryAttempt: 2,
    retryIn: 4,
    willRetry: true,
  });
  logFetchFailure({
    apiName: 'ESPN',
    endpoint: 'games',
    errorType: 'server',
    statusCode: 500,
    retryAttempt: 3,
    willRetry: false,
  });
  const retryLine = linesForMsg('fetch failed — retrying').at(-1) as Record<string, unknown>;
  check(
    'retryable → warn (40) with retryAttempt/retryIn/willRetry',
    retryLine?.level === 40 &&
      retryLine?.errorType === 'network' &&
      retryLine?.retryAttempt === 2 &&
      retryLine?.retryIn === 4 &&
      retryLine?.willRetry === true,
    retryLine
  );
  const permanentLine = linesForMsg('fetch failed permanently').at(-1) as Record<string, unknown>;
  check(
    'permanent → error (50) with statusCode',
    permanentLine?.level === 50 &&
      permanentLine?.errorType === 'server' &&
      permanentLine?.statusCode === 500 &&
      permanentLine?.willRetry === false,
    permanentLine
  );

  // -------------------------------------------------------------------------
  // T4 — integration: fetch start/success + cache hit through the manager
  // -------------------------------------------------------------------------
  console.log('T4. manager integration:');
  const manager = new MockManager('ok');
  const first = await manager.runTeams();
  check(
    'T4. first fetch returns 2 records',
    Array.isArray(first.data) && (first.data as unknown[]).length === 2
  );
  const startLines = linesForMsg('fetch start');
  const okLines = linesForMsg('fetch success');
  const lastStart = startLines.at(-1) as Record<string, unknown>;
  const lastOk = okLines.at(-1) as Record<string, unknown>;
  check(
    'T4. fetch start logged cacheResult miss',
    lastStart?.cacheResult === 'miss' &&
      lastStart?.apiName === 'mockapi' &&
      lastStart?.endpoint === 'teams',
    lastStart
  );
  check(
    'T4. fetch success logged recordCount 2 + cacheUpdated',
    lastOk?.recordCount === 2 && lastOk?.cacheUpdated === true && lastOk?.endpoint === 'teams',
    lastOk
  );

  // Second fetch — CacheMetadata now fresh → cache hit, no API call.
  const second = await manager.runTeams();
  check('T4. second fetch is a cache hit', second.cached === true && second.data === null, second);
  const hitLine = linesForMsg('fetch start').at(-1) as Record<string, unknown>;
  check('T4. second fetch logs cacheResult hit', hitLine?.cacheResult === 'hit', hitLine);

  // -------------------------------------------------------------------------
  // T5 — sync logs through syncAllData (start + complete)
  // -------------------------------------------------------------------------
  console.log('T5. sync logs:');
  // The T4 teams row would make the teams stage a cache hit — clear the mock
  // cache rows so every stage of this sync fetches live.
  await prisma.cacheMetadata.deleteMany({
    where: { OR: CLEANUP_PREFIXES.map(p => ({ cacheKey: { startsWith: p } })) },
  });
  const syncResult = await manager.syncAllData('mock');
  check(
    'T5. syncAllData completes',
    syncResult.stages.teams.recordCount === 2 &&
      syncResult.stages.players.recordCount === 1 &&
      syncResult.stages.games.recordCount === 3
  );
  const syncStart = linesForMsg('sync start').at(-1) as Record<string, unknown>;
  check(
    'T5. sync start has sport + sections + triggeredBy',
    syncStart?.sport === 'mock' &&
      Array.isArray(syncStart?.sections) &&
      syncStart?.sections?.length === 3 &&
      syncStart?.triggeredBy === 'manager',
    syncStart
  );
  const syncDone = linesForMsg('sync complete').at(-1) as Record<string, unknown>;
  check(
    'T5. sync complete has totalDurationMs/recordsProcessed/errors/status',
    syncDone?.sport === 'mock' &&
      typeof syncDone?.totalDurationMs === 'number' &&
      syncDone?.recordsProcessed === 6 &&
      syncDone?.errors === 0 &&
      syncDone?.status === 'complete',
    syncDone
  );

  // Pure-function section log.
  logSyncStart({ sport: 'nba', sections: ['teams', 'players'], triggeredBy: 'scheduler' });
  logSyncSection({
    section: 'teams',
    recordCount: 30,
    durationMs: 250,
    upsertCount: 28,
    skipCount: 2,
  });
  logSyncComplete({
    sport: 'nba',
    totalDurationMs: 1200,
    recordsProcessed: 42,
    errors: 1,
    nextSyncAt: null,
    status: 'partial',
  });
  const sectionLine = linesForMsg('sync section complete').at(-1) as Record<string, unknown>;
  check(
    'T5. sync section has section/recordCount/durationMs/upsertCount/skipCount',
    sectionLine?.section === 'teams' &&
      sectionLine?.recordCount === 30 &&
      sectionLine?.upsertCount === 28 &&
      sectionLine?.skipCount === 2,
    sectionLine
  );
  const schedStart = linesForMsg('sync start').at(-1) as Record<string, unknown>;
  check(
    'T5. scheduler-triggered sync start',
    schedStart?.triggeredBy === 'scheduler' && schedStart?.sport === 'nba',
    schedStart
  );
} finally {
  // Remove the cache metadata rows the integration part wrote.
  await prisma.cacheMetadata.deleteMany({
    where: { OR: CLEANUP_PREFIXES.map(p => ({ cacheKey: { startsWith: p } })) },
  });
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
