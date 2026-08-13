// Phase 8 Steps 3 + 4 — test the global error middleware and fallback handlers.
//   npx tsx scripts/errors-step3-4-test.ts
//
//   T1  Step 3.1 classify — AppError passes through untouched
//   T2  Step 3.2 Prisma    — P2002 → ValidationError, P2025 → NotFoundError,
//                            P2003 → ValidationError, unknown code → DatabaseError
//   T3  Step 3.3 Axios     — 429 → ExternalAPIError(retryAfter), 401 → generic,
//                            503/5xx → apiStatus, no response → unreachable
//   T4  Step 3.1 unknown   — raw Error → 500 safe message, no leak, app alive
//   T5  Step 3.4 asyncHandler — rejections forwarded to next(error)
//   T6  Step 4.1 ML fallback  — injury latest score served with _cached meta;
//                                decisions leaderboard snapshot; momentum row
//   T7  Step 4.2 API fallback — players/games served from SQLite with warning
//   T8  Step 4.3 DB fallback  — memory-cache hit serves cached + warning;
//                                miss returns DatabaseError (critical log)
//   T9  Step 4.4 404 handler  — ROUTE_NOT_FOUND + suggestion to /api/docs
//   T10 Service integration   — injury.service serves stale score + fallback
//                                meta when ML is down
//
// Requires the seeded dev DB (sports present). Python must NOT be reachable —
// PYTHON_ML_URL is forced to a dead port below so the ML-down fallback paths
// are deterministic.

// Force the ML client to a dead port BEFORE any src import (env is validated
// at import time; dotenv does not override an already-set variable).
process.env.LOG_LEVEL = 'silent';
process.env.PYTHON_ML_URL = 'http://127.0.0.1:1';

// Only non-src imports are static; every src module is imported dynamically so
// the env assignments above take effect first.
import axios from 'axios';
import express from 'express';
import { Prisma } from '../src/generated/prisma/client.js';

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

const {
  DatabaseError,
} = await import('../src/utils/errors.js');
const { errorHandler, notFound } = await import('../src/middleware/error.middleware.js');
const { asyncHandler } = await import('../src/utils/async.handler.js');
const {
  handleAPIFallback,
  handleDBFallback,
  handleMLFallback,
  buildFallbackMeta,
} = await import('../src/middleware/fallback.handlers.js');
const { cacheSet, cacheFlush } = await import('../src/cache/memoryCache.js');
const { prisma } = await import('../src/db/client.js');

/** Builds a minimal express app that routes into the real error middleware. */
function testApp(routes: Record<string, () => unknown>): express.Express {
  const app = express();
  for (const [path, handler] of Object.entries(routes)) {
    app.get(path, () => handler());
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

const CLIENT_VERSION = '7.9.1';

try {
  // -------------------------------------------------------------------------
  // T1 — Step 3.1: AppError passes through untouched
  // -------------------------------------------------------------------------
  console.log('T1. AppError classification:');
  const { NotFoundError, ValidationError } = await import('../src/utils/errors.js');
  const app1 = testApp({
    '/notfound': () => {
      throw new NotFoundError('Player 999 not found', 'player');
    },
    '/validation': () => {
      throw new ValidationError('Bad sport', [{ field: 'sport', message: 'must be NBA/NFL/MLB/NHL', value: 'FOOTBALL' }]);
    },
  });
  const s1 = await new Promise<import('node:http').Server>(resolve => {
    const srv = app1.listen(0, () => resolve(srv));
  });
  const p1 = (s1.address() as { port: number }).port;
  const base1 = `http://127.0.0.1:${p1}`;
  const nf = await (await fetch(`${base1}/notfound`)).json();
  check('NotFoundError → 404/NOT_FOUND + resource message', nf.status === 404 && nf.errorCode === 'NOT_FOUND' && nf.message === 'Player 999 not found');
  const val = await (await fetch(`${base1}/validation`)).json();
  check('ValidationError → 400/VALIDATION_ERROR + field errors', val.status === 400 && val.errorCode === 'VALIDATION_ERROR' && val.validationErrors?.[0]?.value === 'FOOTBALL');
  check('no stack trace leaks', !JSON.stringify(nf).includes('stack') && !JSON.stringify(val).includes('stack'));
  s1.close();

  // -------------------------------------------------------------------------
  // T2 — Step 3.2: Prisma error conversion
  // -------------------------------------------------------------------------
  console.log('T2. Prisma error conversion:');
  const mkKnown = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('prisma message', {
      code,
      clientVersion: CLIENT_VERSION,
      meta: code === 'P2002' ? { target: ['externalId', 'sportId'] } : code === 'P2003' ? { field_name: 'teamId' } : {},
    });
  const app2 = testApp({
    '/p2002': () => {
      throw mkKnown('P2002');
    },
    '/p2025': () => {
      throw mkKnown('P2025');
    },
    '/p2003': () => {
      throw mkKnown('P2003');
    },
    '/p9999': () => {
      throw mkKnown('P9999');
    },
  });
  const s2 = await new Promise<import('node:http').Server>(resolve => {
    const srv = app2.listen(0, () => resolve(srv));
  });
  const base2 = `http://127.0.0.1:${(s2.address() as { port: number }).port}`;
  const r2002 = await (await fetch(`${base2}/p2002`)).json();
  check('P2002 → 400 VALIDATION_ERROR "already exists"', r2002.status === 400 && r2002.errorCode === 'VALIDATION_ERROR' && /already exists/.test(r2002.message), r2002);
  const r2025 = await (await fetch(`${base2}/p2025`)).json();
  check('P2025 → 404 NOT_FOUND', r2025.status === 404 && r2025.errorCode === 'NOT_FOUND', r2025);
  const r2003 = await (await fetch(`${base2}/p2003`)).json();
  check('P2003 → 400 VALIDATION_ERROR invalid reference', r2003.status === 400 && r2003.errorCode === 'VALIDATION_ERROR' && /reference/.test(r2003.message), r2003);
  const r9999 = await (await fetch(`${base2}/p9999`)).json();
  check('unknown prisma code → 500 DATABASE_ERROR safe message', r9999.status === 500 && r9999.errorCode === 'DATABASE_ERROR' && !/prisma/i.test(r9999.message), r9999);
  check('no SQL/prisma internals leak', !JSON.stringify(r9999).includes('prisma message'));
  s2.close();

  // -------------------------------------------------------------------------
  // T3 — Step 3.3: Axios error conversion
  // -------------------------------------------------------------------------
  console.log('T3. Axios error conversion:');
  const mkAxios = (status?: number, retryAfter?: string) => {
    const response =
      status !== undefined
        ? { status, data: {}, headers: retryAfter ? { 'retry-after': retryAfter } : {}, statusText: 'err', config: {} }
        : undefined;
    return new axios.AxiosError('axios msg', status !== undefined ? String(status) : 'ERR_NETWORK', {} as never, {} as never, response as never);
  };
  const app3 = testApp({
    '/ratelimit': () => {
      throw mkAxios(429, '45');
    },
    '/auth': () => {
      throw mkAxios(401);
    },
    '/down': () => {
      throw mkAxios(503);
    },
    '/server': () => {
      throw mkAxios(500);
    },
    '/network': () => {
      throw mkAxios();
    },
  });
  const s3 = await new Promise<import('node:http').Server>(resolve => {
    const srv = app3.listen(0, () => resolve(srv));
  });
  const base3 = `http://127.0.0.1:${(s3.address() as { port: number }).port}`;
  const rl = await (await fetch(`${base3}/ratelimit`)).json();
  check('429 → 502 EXTERNAL_API_ERROR with retryAfter=45', rl.status === 502 && rl.errorCode === 'EXTERNAL_API_ERROR' && rl.retryAfter === 45, rl);
  const auth = await (await fetch(`${base3}/auth`)).json();
  check('401 → 502 EXTERNAL_API_ERROR generic (no key leak)', auth.status === 502 && auth.errorCode === 'EXTERNAL_API_ERROR' && !/key|credential/i.test(JSON.stringify(auth)), auth);
  const down = await (await fetch(`${base3}/down`)).json();
  check('503 → 502 EXTERNAL_API_ERROR unavailable', down.status === 502 && down.errorCode === 'EXTERNAL_API_ERROR' && /unavailable/.test(down.message), down);
  const server = await (await fetch(`${base3}/server`)).json();
  check('5xx → 502 EXTERNAL_API_ERROR with apiStatus', server.status === 502 && server.apiStatus === 500, server);
  const network = await (await fetch(`${base3}/network`)).json();
  check('no response → 502 EXTERNAL_API_ERROR unreachable', network.status === 502 && /unreachable/.test(network.message), network);
  s3.close();

  // -------------------------------------------------------------------------
  // T4 — Step 3.1: unknown errors → safe 500
  // -------------------------------------------------------------------------
  console.log('T4. Unknown errors:');
  const app4 = testApp({
    '/boom': () => {
      throw new Error('kaboom internal secret');
    },
  });
  const s4 = await new Promise<import('node:http').Server>(resolve => {
    const srv = app4.listen(0, () => resolve(srv));
  });
  const base4 = `http://127.0.0.1:${(s4.address() as { port: number }).port}`;
  const boom = await (await fetch(`${base4}/boom`)).json();
  check('unknown → 500 API_ERROR safe message', boom.status === 500 && boom.errorCode === 'API_ERROR' && !JSON.stringify(boom).includes('kaboom'), boom);
  const alive = await fetch(`${base4}/boom`);
  check('app still accepts requests after error', alive.status === 500, alive.status);
  s4.close();

  // -------------------------------------------------------------------------
  // T5 — Step 3.4: asyncHandler forwards rejections
  // -------------------------------------------------------------------------
  console.log('T5. asyncHandler:');
  const { NotFoundError: NotFoundErrorClass } = await import('../src/utils/errors.js');
  const app5 = express();
  app5.get(
    '/rejects',
    asyncHandler(async () => {
      throw new NotFoundErrorClass('async rejected', 'player');
    })
  );
  app5.use(errorHandler);
  const s5 = await new Promise<import('node:http').Server>(resolve => {
    const srv = app5.listen(0, () => resolve(srv));
  });
  const r5 = await (await fetch(`http://127.0.0.1:${(s5.address() as { port: number }).port}/rejects`)).json();
  check('async rejection → 404 NOT_FOUND via next(error)', r5.status === 404 && r5.errorCode === 'NOT_FOUND', r5);
  s5.close();

  // -------------------------------------------------------------------------
  // T6 — Step 4.1: ML fallback serves last computed data
  // -------------------------------------------------------------------------
  console.log('T6. ML fallback:');
  // Seed: NBA sport → team → player → latest risk score 2 days old.
  const nba = await prisma.sports.findUnique({ where: { abbreviation: 'nba' } });
  if (!nba) throw new Error('NBA sport not seeded — aborting');
  const team = await prisma.teams.create({
    data: { sportId: nba.id, name: 'Fallback Testers', abbreviation: 'FBT', city: 'Testville', externalId: 'ERRTEST-TEAM', isActive: true },
  });
  const player = await prisma.players.create({
    data: { teamId: team.id, sportId: nba.id, name: 'Fallback Player', firstName: 'Fallback', lastName: 'Player', position: 'PG', externalId: 'ERRTEST-PLAYER', isActive: true },
  });
  const oldDate = new Date(Date.now() - 2 * 86_400_000);
  await prisma.injuryRiskScores.create({
    data: {
      playerId: player.id,
      computedAt: oldDate,
      windowStart: new Date(Date.now() - 14 * 86_400_000),
      windowEnd: new Date(Date.now() - 7 * 86_400_000),
      riskScore: 71,
      zone: 'red',
      triggerMetric: 'minutes',
      backToBackFlag: false,
      explanation: 'fallback test score',
      isLatest: true,
    },
  });
  // The injury service only calls ML when game-log data exists — seed one game
  // + log so the flow reaches the ML call and falls back to the stale score.
  const game = await prisma.games.create({
    data: {
      sportId: nba.id,
      homeTeamId: team.id,
      awayTeamId: team.id,
      date: new Date(Date.now() - 3 * 86_400_000),
      season: nba.season,
      gameType: 'regular',
      status: 'final',
      homeScore: 100,
      awayScore: 90,
      externalId: 'ERRTEST-GAME',
    },
  });
  await prisma.playerGameLogs.create({
    data: {
      playerId: player.id,
      gameId: game.id,
      teamId: team.id,
      date: new Date(Date.now() - 3 * 86_400_000),
      minutesPlayed: 36,
      points: 25,
      backToBack: false,
      rawBoxScore: {},
    },
  });

  const injuryFallback = await handleMLFallback('injury', { playerId: player.id });
  check('injury fallback found the latest score', injuryFallback != null && (injuryFallback.data as { riskScore: number }).riskScore === 71);
  check('injury fallback meta: _cached/_cachedAt/_staleSince/warning', injuryFallback != null && injuryFallback.meta._cached === true && injuryFallback.meta._cachedAt != null && injuryFallback.meta._staleSince === 48 && typeof injuryFallback.meta.warning === 'string', injuryFallback?.meta);
  const missingFallback = await handleMLFallback('injury', { playerId: 999_999_999 });
  check('injury fallback returns null when nothing computed', missingFallback === null);

  const decisionsFallback = await handleMLFallback('decisions', { sportId: nba.id });
  check('decisions fallback returns array (may be empty → null)', decisionsFallback === null || Array.isArray(decisionsFallback.data));

  const momentumFallback = await handleMLFallback('momentum', { sportId: nba.id, season: nba.season });
  check('momentum fallback returns null or row', momentumFallback === null || momentumFallback.meta._cached === true);

  // -------------------------------------------------------------------------
  // T7 — Step 4.2: API fallback serves synced SQLite data
  // -------------------------------------------------------------------------
  console.log('T7. API fallback:');
  const playersFallback = await handleAPIFallback('NBA', 'players');
  check('players fallback contains the seeded player', playersFallback != null && (playersFallback.data as unknown[]).some((p: { externalId: string }) => p.externalId === 'ERRTEST-PLAYER'));
  check('players fallback has a warning string', playersFallback != null && typeof playersFallback.warning === 'string' && /unavailable/.test(playersFallback.warning), playersFallback?.warning);
  const gamesFallback = await handleAPIFallback('NBA', 'games');
  check('games fallback is array or null', gamesFallback === null || Array.isArray(gamesFallback.data));

  // -------------------------------------------------------------------------
  // T8 — Step 4.3: DB fallback serves memory cache / returns DatabaseError
  // -------------------------------------------------------------------------
  console.log('T8. DB fallback:');
  cacheFlush();
  cacheSet('errtest:key', { n: 42 });
  const cachedHit = handleDBFallback('errtest:key', { operation: 'test' });
  check('cache hit → served + warning', cachedHit.served === true && (cachedHit.data as { n: number }).n === 42 && typeof cachedHit.warning === 'string');
  const cachedMiss = handleDBFallback('errtest:missing', { operation: 'test' });
  check('cache miss → DatabaseError (not served)', cachedMiss.served === false && cachedMiss.error instanceof DatabaseError && cachedMiss.error.statusCode === 500);
  check('buildFallbackMeta(null) → _cachedAt null + _staleSince null', buildFallbackMeta(null)._cachedAt === null && buildFallbackMeta(null)._staleSince === null);
  cacheFlush();

  // -------------------------------------------------------------------------
  // T9 — Step 4.4: 404 handler
  // -------------------------------------------------------------------------
  console.log('T9. 404 handler:');
  const app9 = express();
  app9.use(notFound);
  const s9 = await new Promise<import('node:http').Server>(resolve => {
    const srv = app9.listen(0, () => resolve(srv));
  });
  const r9 = await (await fetch(`http://127.0.0.1:${(s9.address() as { port: number }).port}/api/nonexistent`)).json();
  check('404 → ROUTE_NOT_FOUND + suggestion', r9.status === 404 && r9.errorCode === 'ROUTE_NOT_FOUND' && /api\/docs/.test(r9.suggestion ?? ''), r9);
  s9.close();

  // -------------------------------------------------------------------------
  // T10 — Service integration: injury ML-down serves stale + fallback meta
  // -------------------------------------------------------------------------
  console.log('T10. Service integration (injury ML-down):');
  const { getPlayerRisk } = await import('../src/services/injury.service.js');
  const profile = await getPlayerRisk(player.id);
  check('ML down → stale profile served (riskScore 71)', profile.riskScore === 71, profile.riskScore);
  check('ML down → fallback meta present', (profile as unknown as { _cached?: boolean })._cached === true && typeof (profile as unknown as { warning?: string }).warning === 'string', profile);
  check('ML down → _staleSince ~48h', (profile as unknown as { _staleSince?: number })._staleSince === 48, profile);
} finally {
  await prisma.playerGameLogs.deleteMany({ where: { player: { externalId: 'ERRTEST-PLAYER' } } });
  await prisma.games.deleteMany({ where: { externalId: 'ERRTEST-GAME' } });
  await prisma.injuryRiskScores.deleteMany({ where: { explanation: 'fallback test score' } });
  await prisma.players.deleteMany({ where: { externalId: 'ERRTEST-PLAYER' } });
  await prisma.teams.deleteMany({ where: { externalId: 'ERRTEST-TEAM' } });
  cacheFlush();
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
