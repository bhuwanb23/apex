// Phase 8 Step 12 — test everything. End-to-end verification of all of Phase 8.
//   npx tsx scripts/phase8-e2e-test.ts
//
//   T1  custom error classes — ValidationError from a route → full response
//       shape (success/status/errorCode/message/validationErrors), no stack,
//       warn-level log with context
//   T2  global error middleware — unhandled Error → safe 500, real error +
//       stack in error.log, app keeps serving
//   T3  ML fallback — Python down → last known score from DB (not 503) with
//       warning/_cachedAt/_cached; 'ML call failed' logged
//   T4  validation middleware — invalid sport, invalid playerId, missing
//       required timeout params → structured 400s
//   T5  request logging — http.log JSON with all fields; 404 at warn; slow
//       request → 'Slow request detected'
//   T6  ML call logging — ?recalculate=true forces an ML attempt; request +
//       failure logs appear
//   T7  data fetch logging — job trigger flow works (202); fetch/sync log
//       helpers emit the Step 9 fields
//   T8  error tracking — 5 invalid-sport requests → validationErrors=5,
//       rate ~0.08/min, status still healthy
//   T9  log files — combined/error/http logs exist, every line valid JSON,
//       rotation policy constants (20 MB / 10 files)
//   T10 startup banner — boot the REAL server (child process), verify the
//       banner (version/environment/port/routes/jobs/cache) then shut down

// Env first — Python must be unreachable for the fallback tests.
process.env.LOG_LEVEL = 'debug';
process.env.PYTHON_ML_URL = 'http://127.0.0.1:1';
process.env.JOB_CONTROL_ADMIN_KEY = 'test-admin-key';

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import express from 'express';

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

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

// Static type-only import (erased — safe before env-dependent imports).
import type { SportFetcher } from '../src/data/fetcher.manager.js';

const { createApp } = await import('../src/app.js');
const { errorHandler, notFound } = await import('../src/middleware/error.middleware.js');
const { requestLogger } = await import('../src/middleware/request.logger.js');
const { resetErrorTracker } = await import('../src/utils/error.tracker.js');
const {
  MAX_LOG_FILES,
  MAX_LOG_SIZE_BYTES,
  rotateAllLogFiles,
} = await import('../src/utils/log.manager.js');
const {
  logFetchStart,
  logFetchSuccess,
  logSyncStart,
} = await import('../src/data/fetch.logger.js');
const { FetcherManager } = await import('../src/data/fetcher.manager.js');
const { ValidationError } = await import('../src/utils/errors.js');
const { prisma } = await import('../src/db/client.js');

const combined = (): string =>
  existsSync('logs/combined.log') ? readFileSync('logs/combined.log', 'utf8') : '';

/** JSON lines in a file whose msg matches a substring. */
function linesMatching(file: string, needle: string): Array<Record<string, unknown>> {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(l => l.includes(needle))
    .map(l => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((l): l is Record<string, unknown> => l !== null);
}

/** Boots an express app on a free port. */
async function boot(app: express.Express): Promise<{ base: string; server: import('node:http').Server }> {
  const server = await new Promise<import('node:http').Server>(resolve => {
    const srv = app.listen(0, () => resolve(srv));
  });
  return { base: `http://127.0.0.1:${(server.address() as { port: number }).port}`, server };
}

const childProcesses: ChildProcess[] = [];

try {
  // -------------------------------------------------------------------------
  // T1 — custom error classes from a route
  // -------------------------------------------------------------------------
  console.log('T1. Custom error classes:');
  const app1 = express();
  app1.use(requestLogger);
  app1.get('/validation', () => {
    throw new ValidationError('Invalid sport supplied', [
      { field: 'sport', message: 'sport must be one of: NBA, NFL, MLB, NHL', value: 'FOOTBALL' },
    ]);
  });
  app1.use(notFound);
  app1.use(errorHandler);
  const s1 = await boot(app1);
  const r1 = (await (await fetch(`${s1.base}/validation`)).json()) as Record<string, unknown>;
  check(
    'T1. response shape success/status/errorCode/message/validationErrors',
    r1.success === false &&
      r1.status === 400 &&
      r1.errorCode === 'VALIDATION_ERROR' &&
      typeof r1.message === 'string' &&
      Array.isArray(r1.validationErrors) &&
      (r1.validationErrors as Array<Record<string, unknown>>)[0]?.field === 'sport',
    r1
  );
  check('T1. no stack trace in response', !JSON.stringify(r1).includes('stack'));
  await sleep(100);
  const warnLines = linesMatching('logs/combined.log', '"errorCode":"VALIDATION_ERROR"');
  const warnLine = warnLines.at(-1) as Record<string, unknown>;
  check('T1. logged at warn level (40) with context', warnLine?.level === 40 && typeof warnLine?.name === 'string', warnLine);
  s1.server.close();

  // -------------------------------------------------------------------------
  // T2 — global error middleware: unknown error → safe 500
  // -------------------------------------------------------------------------
  console.log('T2. Global error middleware:');
  const app2 = express();
  app2.get('/boom', () => {
    throw new Error('secret-internal-detail-xyz');
  });
  app2.use(errorHandler);
  const s2 = await boot(app2);
  const boom = (await (await fetch(`${s2.base}/boom`)).json()) as Record<string, unknown>;
  check(
    'T2. safe 500 — generic message, NOT the internal message',
    boom.status === 500 && boom.errorCode === 'API_ERROR' && boom.message === 'An internal error occurred' && !JSON.stringify(boom).includes('secret-internal-detail-xyz'),
    boom
  );
  const errLog = existsSync('logs/error.log') ? readFileSync('logs/error.log', 'utf8') : '';
  check('T2. error.log has the real error + stack', errLog.includes('secret-internal-detail-xyz') && errLog.includes('stack'));
  const after = await fetch(`${s2.base}/boom`);
  check('T2. app still accepts requests after the error', after.status === 500);
  s2.server.close();

  // -------------------------------------------------------------------------
  // T3 — ML fallback: last known score from DB when Python is down
  // -------------------------------------------------------------------------
  console.log('T3. ML service fallback:');
  const nba = await prisma.sports.findUnique({ where: { abbreviation: 'nba' } });
  if (!nba) throw new Error('NBA sport not seeded — aborting T3');
  const team = await prisma.teams.create({
    data: { sportId: nba.id, name: 'E2E Fallback Team', abbreviation: 'E2T', city: 'Testville', externalId: 'P8E2E-TEAM', isActive: true },
  });
  const player = await prisma.players.create({
    data: { teamId: team.id, sportId: nba.id, name: 'E2E Fallback Player', firstName: 'E2E', lastName: 'Fallback', position: 'PG', externalId: 'P8E2E-PLAYER', isActive: true },
  });
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
      externalId: 'P8E2E-GAME',
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
  await prisma.injuryRiskScores.create({
    data: {
      playerId: player.id,
      computedAt: new Date(Date.now() - 2 * 86_400_000),
      windowStart: new Date(Date.now() - 14 * 86_400_000),
      windowEnd: new Date(Date.now() - 7 * 86_400_000),
      riskScore: 71,
      zone: 'red',
      triggerMetric: 'minutes',
      backToBackFlag: false,
      explanation: 'e2e fallback test score',
      isLatest: true,
    },
  });
  const app3 = createApp();
  const s3 = await boot(app3);
  const fallback = (await (
    await fetch(`${s3.base}/api/injury/player/${player.id}`)
  ).json()) as { data: Record<string, unknown> };
  check(
    'T3. last known score served (200, riskScore 71, not 503)',
    fallback.data?.riskScore === 71 && typeof fallback.data?.warning === 'string',
    fallback.data
  );
  check(
    'T3. fallback meta present (_cached true, _cachedAt ISO, _staleSince 48)',
    fallback.data?._cached === true &&
      typeof fallback.data?._cachedAt === 'string' &&
      fallback.data?._staleSince === 48,
    fallback.data
  );
  await sleep(100);
  check('T3. "ML call failed" logged', linesMatching('logs/combined.log', '"msg":"ML call failed"').length >= 1);

  // -------------------------------------------------------------------------
  // T4 — validation middleware (real routes)
  // -------------------------------------------------------------------------
  console.log('T4. Validation middleware:');
  const badSport = await fetch(`${s3.base}/api/injury/alerts/FOOTBALL`);
  const badSportBody = (await badSport.json()) as { errorCode: string; validationErrors?: Array<Record<string, unknown>> };
  check(
    'T4. invalid sport → 400 VALIDATION_ERROR, message mentions sports',
    badSport.status === 400 &&
      badSportBody.errorCode === 'VALIDATION_ERROR' &&
      /one of: NBA, NFL, MLB, NHL/.test(String(badSportBody.validationErrors?.[0]?.message)),
    badSportBody
  );
  const badId = (await (await fetch(`${s3.base}/api/injury/player/abc`)).json()) as {
    validationErrors?: Array<Record<string, unknown>>;
  };
  check(
    'T4. invalid playerId → 400, message explains integer',
    /positive integer/.test(String(badId.validationErrors?.[0]?.message)),
    badId
  );
  const missingParams = (await (
    await fetch(`${s3.base}/api/momentum/timeout/NBA`)
  ).json()) as { validationErrors?: Array<Record<string, unknown>> };
  check(
    'T4. missing required timeout params → 400, lists each missing field',
    missingParams.validationErrors?.length === 3 &&
      ['scoreDiff', 'timeRemaining', 'period'].every(f => missingParams.validationErrors?.some(e => e.field === f)),
    missingParams.validationErrors
  );

  // -------------------------------------------------------------------------
  // T6 — ML call logging via ?recalculate=true (forces an ML attempt)
  // -------------------------------------------------------------------------
  console.log('T6. ML call logging:');
  const recalc = (await (
    await fetch(`${s3.base}/api/injury/player/${player.id}?recalculate=true`)
  ).json()) as { data: Record<string, unknown> };
  check('T6. recalculate still falls back when ML down', typeof recalc.data?.warning === 'string');
  await sleep(100);
  const mlStarts = linesMatching('logs/combined.log', '"msg":"ML call start"');
  check('T6. "ML call start" logged before the call', mlStarts.length >= 1 && mlStarts.at(-1)?.mlEndpoint != null, mlStarts.at(-1));
  check('T6. "ML call failed" logged with errorType', linesMatching('logs/combined.log', '"msg":"ML call failed"').length >= 2);

  // -------------------------------------------------------------------------
  // T7 — data fetch logging + job trigger flow
  // -------------------------------------------------------------------------
  console.log('T7. Data fetch logging:');
  logFetchStart({ apiName: 'BallDontLie', endpoint: 'teams', params: {}, cacheCheck: true, cacheResult: 'miss' });
  logFetchSuccess({ apiName: 'BallDontLie', endpoint: 'teams', responseTimeMs: 234, recordCount: 30, cacheUpdated: true });
  logSyncStart({ sport: 'nba', sections: ['teams', 'players', 'games'], triggeredBy: 'scheduler' });
  const startLine = linesMatching('logs/combined.log', '"msg":"fetch start"').at(-1) as Record<string, unknown>;
  check('T7. fetch start line has apiName/endpoint/cacheResult', startLine?.apiName === 'BallDontLie' && startLine?.endpoint === 'teams' && startLine?.cacheResult === 'miss', startLine);
  const okLine = linesMatching('logs/combined.log', '"msg":"fetch success"').at(-1) as Record<string, unknown>;
  check('T7. fetch success line has recordCount + responseTimeMs', okLine?.recordCount === 30 && okLine?.responseTimeMs === 234, okLine);

  const trigger = await fetch(`${s3.base}/api/jobs/trigger`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-key': 'test-admin-key' },
    body: JSON.stringify({ jobName: 'health_check' }),
  });
  const triggerBody = (await trigger.json()) as { data: { status: string } };
  check('T7. POST /api/jobs/trigger works (202, accepted)', trigger.status === 202 && triggerBody.data?.status === 'triggered', triggerBody);
  s3.server.close();

  // -------------------------------------------------------------------------
  // T8 — error tracking: 5 invalid sports, still healthy
  // -------------------------------------------------------------------------
  console.log('T8. Error tracking:');
  resetErrorTracker();
  const app8 = createApp();
  const s8 = await boot(app8);
  for (let i = 0; i < 5; i++) {
    await fetch(`${s8.base}/api/injury/alerts/INVALID`);
  }
  const errors = (await (await fetch(`${s8.base}/api/health/errors`)).json()) as {
    data: { counts: Record<string, number>; rates: { errorsPerMinute: Record<string, number> }; status: string };
  };
  check('T8. validationErrors count === 5', errors.data.counts.validationErrors === 5, errors.data.counts);
  check(
    'T8. rate = 5/60 per minute',
    Math.abs(errors.data.rates.errorsPerMinute.validationErrors - 5 / 60) < 0.001,
    errors.data.rates
  );
  check('T8. status still healthy', errors.data.status === 'healthy', errors.data.status);
  s8.server.close();

  // -------------------------------------------------------------------------
  // T5 — request logging (http.log fields, 404 warn, slow warning)
  // -------------------------------------------------------------------------
  console.log('T5. Request logging:');
  const app5 = express();
  app5.use(requestLogger);
  app5.get('/ok', (_req, res) => {
    res.json({ ok: true });
  });
  app5.get('/slow', async (_req, res) => {
    await sleep(2100);
    res.json({ slow: true });
  });
  app5.use(notFound);
  app5.use(errorHandler);
  const s5 = await boot(app5);
  await fetch(`${s5.base}/ok`);
  await fetch(`${s5.base}/missing-route`);
  await sleep(100);
  const httpLines = linesMatching('logs/http.log', '"msg":"request done"');
  const okDone = httpLines.filter(l => l.url === '/ok').at(-1) as Record<string, unknown>;
  check(
    'T5. http.log response line has all fields',
    okDone?.method === 'GET' && okDone?.url === '/ok' && okDone?.statusCode === 200 && typeof okDone?.responseTimeMs === 'number' && typeof okDone?.requestId === 'string' && typeof okDone?.responseSize === 'number',
    okDone
  );
  const notFoundDone = linesMatching('logs/combined.log', '"msg":"request done"')
    .filter(l => l.statusCode === 404)
    .at(-1) as Record<string, unknown>;
  check('T5. 404 logged at warn level (40)', notFoundDone?.level === 40, notFoundDone);
  const slowStart = Date.now();
  await fetch(`${s5.base}/slow`);
  await sleep(100);
  const slowLines = linesMatching('logs/combined.log', '"msg":"Slow request detected"');
  check(
    'T5. slow request > 2s → "Slow request detected" with threshold',
    slowLines.length >= 1 && (slowLines.at(-1) as Record<string, unknown>)?.slowThresholdMs === 2000 && Date.now() - slowStart >= 2000
  );
  s5.server.close();

  // -------------------------------------------------------------------------
  // T9 — log files exist, valid JSON, rotation policy
  // -------------------------------------------------------------------------
  console.log('T9. Log files:');
  for (const f of ['logs/combined.log', 'logs/error.log', 'logs/http.log']) {
    check(`T9. ${f} exists with content`, existsSync(f) && readFileSync(f, 'utf8').length > 0);
  }
  let badJson = 0;
  let totalLines = 0;
  for (const line of readFileSync('logs/combined.log', 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    totalLines += 1;
    try {
      JSON.parse(line);
    } catch {
      badJson += 1;
    }
  }
  check('T9. every combined.log line is valid JSON', badJson === 0 && totalLines > 0, { badJson, totalLines });
  check('T9. rotation policy — 20 MB / 10 files', MAX_LOG_SIZE_BYTES === 20 * 1024 * 1024 && MAX_LOG_FILES === 10);
  check('T9. rotateAllLogFiles runs cleanly', typeof rotateAllLogFiles() === 'undefined');

  // -------------------------------------------------------------------------
  // T10 — startup banner from the REAL server (child process boot)
  // -------------------------------------------------------------------------
  console.log('T10. Startup banner (real boot):');
  const child = spawn('npx tsx src/index.ts', {
    cwd: process.cwd(),
    shell: true,
    env: {
      ...process.env,
      PORT: '8931',
      LOG_LEVEL: 'debug',
      JOBS_ENABLED: 'false',
      RUN_JOBS_ON_STARTUP: 'false',
    },
  });
  childProcesses.push(child);
  let bootOut = '';
  child.stdout?.on('data', d => {
    bootOut += String(d);
  });
  child.stderr?.on('data', d => {
    bootOut += String(d);
  });
  const childExit = new Promise<void>(resolve => {
    child.on('exit', () => resolve());
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !bootOut.includes('Ready to accept requests')) {
    await sleep(200);
  }
  check('T10. banner printed "Ready to accept requests"', bootOut.includes('Ready to accept requests'), bootOut.slice(-400));
  check('T10. banner printed version/environment/port', /version:/.test(bootOut) && /environment:/.test(bootOut) && /port:/.test(bootOut));
  check('T10. banner lists routes (incl. /api/logs/recent)', bootOut.includes('Registered routes') && bootOut.includes('api/logs/recent'));
  check('T10. banner lists scheduled jobs + cache status', bootOut.includes('Scheduled jobs') && bootOut.includes('Cache status'));
  let childHealthy = false;
  try {
    const health = await fetch('http://127.0.0.1:8931/api/health');
    childHealthy = health.status === 200;
  } catch {
    childHealthy = false;
  }
  check('T10. real server answers /api/health', childHealthy);

  child.kill('SIGTERM');
  await Promise.race([childExit, sleep(10_000)]);
  check('T10. server shut down cleanly', child.exitCode === 0 || child.signalCode !== null);
} finally {
  // Cleanup seeded rows + any child process.
  for (const child of childProcesses) {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
  await prisma.playerGameLogs.deleteMany({ where: { player: { externalId: 'P8E2E-PLAYER' } } });
  await prisma.games.deleteMany({ where: { externalId: 'P8E2E-GAME' } });
  await prisma.injuryRiskScores.deleteMany({ where: { explanation: 'e2e fallback test score' } });
  await prisma.players.deleteMany({ where: { externalId: 'P8E2E-PLAYER' } });
  await prisma.teams.deleteMany({ where: { externalId: 'P8E2E-TEAM' } });
  resetErrorTracker();
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
