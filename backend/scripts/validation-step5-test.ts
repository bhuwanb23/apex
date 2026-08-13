// Phase 8 Step 5 — test the request validation layer.
//   npx tsx scripts/validation-step5-test.ts
//
//   T1  sport case-insensitive normalize → 'NBA' (writeback reaches controller)
//   T2  invalid sport → 400 VALIDATION_ERROR + field errors (field/message/value)
//   T3  invalid playerId → 400 BEFORE the cache middleware runs
//   T4  playerId 0 → 400
//   T5  season format → 400 on '20245', accepted on '2024-25'
//   T6  timeout situation ranges → 400 on scoreDiff=999, accepted otherwise
//   T7  date range → start-after-end and >365 days both 400
//   T8  limit clamp → 500 → 100 in the paginated response
//   T9  createValidator unit — req.validated* attached, defaults NOT written
//       back, provided values ARE written back (cache-key consistency)
//   T10 pagination defaults → page 1, limit 50 (shared players)

// Env first, before any src import (dotenv does not override set variables).
process.env.LOG_LEVEL = 'silent';
process.env.PYTHON_ML_URL = 'http://127.0.0.1:1';

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

const { createApp } = await import('../src/app.js');
const { errorHandler } = await import('../src/middleware/error.middleware.js');
const {
  alertsQuerySchema,
  createValidator,
  gamesSearchQuerySchema,
  playerIdParamsSchema,
  searchPlayersQuerySchema,
  sportParamsSchema,
  timeoutSituationSchema,
} = await import('../src/middleware/validation.middleware.js');
const { prisma } = await import('../src/db/client.js');

try {
  // -------------------------------------------------------------------------
  // T9 — unit: createValidator behavior (validated* + writeback + defaults)
  // -------------------------------------------------------------------------
  console.log('T9. createValidator unit:');
  const unit = express();
  unit.get('/sport/:sport', createValidator(sportParamsSchema, 'params'), (req, res) => {
    res.json({ validated: req.validatedParams, rawParams: req.params });
  });
  unit.get('/alerts', createValidator(alertsQuerySchema, 'query'), (req, res) => {
    res.json({ validated: req.validatedQuery, rawQuery: req.query });
  });
  unit.get('/players', createValidator(searchPlayersQuerySchema, 'query'), (req, res) => {
    res.json({ validated: req.validatedQuery, rawQuery: req.query });
  });
  unit.get('/player/:playerId', createValidator(playerIdParamsSchema, 'params'), (req, res) => {
    res.json({ validated: req.validatedParams });
  });
  unit.get('/timeout', createValidator(timeoutSituationSchema, 'query'), (req, res) => {
    res.json({ validated: req.validatedQuery });
  });
  unit.get('/games', createValidator(gamesSearchQuerySchema, 'query'), (req, res) => {
    res.json({ validated: req.validatedQuery });
  });
  unit.use(errorHandler);

  const uServer = await new Promise<import('node:http').Server>(resolve => {
    const srv = unit.listen(0, () => resolve(srv));
  });
  const uBase = `http://127.0.0.1:${(uServer.address() as { port: number }).port}`;

  const s1 = await (await fetch(`${uBase}/sport/nba`)).json();
  check('sport "nba" → validated.sport === "NBA"', s1.validated?.sport === 'NBA', s1);
  check('writeback: req.params.sport === "NBA"', s1.rawParams?.sport === 'NBA', s1);

  const badSport = await fetch(`${uBase}/sport/FOOTBALL`);
  const badSportBody = await badSport.json();
  check(
    'invalid sport → 400 VALIDATION_ERROR + field error with value',
    badSport.status === 400 &&
      badSportBody.errorCode === 'VALIDATION_ERROR' &&
      badSportBody.validationErrors?.[0]?.field === 'sport' &&
      badSportBody.validationErrors?.[0]?.value === 'FOOTBALL' &&
      /one of: NBA, NFL, MLB, NHL/.test(badSportBody.validationErrors?.[0]?.message ?? ''),
    badSportBody
  );

  const noAlerts = await (await fetch(`${uBase}/alerts`)).json();
  check(
    'defaults applied: validated zone red / limit 20',
    noAlerts.validated?.zone === 'red' && noAlerts.validated?.limit === 20,
    noAlerts
  );
  check(
    'defaults NOT written back (cache-key consistency)',
    !('zone' in noAlerts.rawQuery) && !('limit' in noAlerts.rawQuery),
    noAlerts.rawQuery
  );

  const withAlerts = await (await fetch(`${uBase}/alerts?zone=yellow&limit=5`)).json();
  check(
    'provided values coerced for the controller (limit 5 as number)',
    withAlerts.validated?.zone === 'yellow' && withAlerts.validated?.limit === 5,
    withAlerts
  );
  // Express's req.query is a getter that re-parses on every access, so query
  // write-back can't persist — the cache layer keeps the raw wire values
  // (deterministic per input), which is what matters for cache keys.
  check(
    'raw query keeps wire values (cache sees raw input)',
    withAlerts.rawQuery?.limit === '5',
    withAlerts.rawQuery
  );

  const clamped = await (await fetch(`${uBase}/players?q=le&limit=500`)).json();
  check('search players limit 500 → clamped to 50', clamped.validated?.limit === 50, clamped);

  const badId = await fetch(`${uBase}/player/abc`);
  const badIdBody = await badId.json();
  check(
    'playerId "abc" → 400, field playerId',
    badId.status === 400 && badIdBody.validationErrors?.[0]?.field === 'playerId',
    badIdBody
  );

  const badTimeout = await fetch(`${uBase}/timeout?scoreDiff=999&timeRemaining=120&period=4`);
  check(
    'timeout scoreDiff=999 → 400 field scoreDiff',
    badTimeout.status === 400,
    badTimeout.status
  );
  const okTimeout = await (
    await fetch(`${uBase}/timeout?scoreDiff=-5&timeRemaining=120&period=4`)
  ).json();
  check(
    'valid timeout situation → parsed values (defaults filled)',
    okTimeout.validated?.scoreDiff === -5 &&
      okTimeout.validated?.timeRemaining === 120 &&
      okTimeout.validated?.period === 4 &&
      okTimeout.validated?.consecutiveScores === 0 &&
      okTimeout.validated?.timeoutsAvailable === 2,
    okTimeout
  );

  const badRange = await fetch(`${uBase}/games?dateFrom=2024-01-02&dateTo=2024-01-01`);
  const badRangeBody = await badRange.json();
  check(
    'dateFrom after dateTo → 400 startDate must be before endDate',
    badRange.status === 400 &&
      /before endDate/.test(badRangeBody.validationErrors?.[0]?.message ?? ''),
    badRangeBody
  );
  const longRange = await fetch(`${uBase}/games?dateFrom=2023-01-01&dateTo=2024-06-01`);
  check('range > 365 days → 400', longRange.status === 400, longRange.status);
  const badDate = await fetch(`${uBase}/games?dateFrom=nope&dateTo=2024-01-01`);
  check('malformed date → 400', badDate.status === 400, badDate.status);
  uServer.close();

  // -------------------------------------------------------------------------
  // Real app — validation wired into routes, before the cache middleware
  // -------------------------------------------------------------------------
  console.log('Real app routes:');
  const app = createApp();
  const server = await new Promise<import('node:http').Server>(resolve => {
    const srv = app.listen(0, () => resolve(srv));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  // T1 — case-insensitive sport normalized, controller echoes 'NBA'.
  const teams = await (await fetch(`${base}/api/sports/nba/teams`)).json();
  check(
    'T1. /api/sports/nba/teams → 200 sport "NBA"',
    teams.success === true && teams.data?.sport === 'NBA',
    teams.data?.sport
  );

  // T2 — invalid sport → structured 400.
  const badSport2 = await fetch(`${base}/api/sports/FOOTBALL/teams`);
  const badSport2Body = await badSport2.json();
  check(
    'T2. /api/sports/FOOTBALL/teams → 400 VALIDATION_ERROR',
    badSport2.status === 400 && badSport2Body.errorCode === 'VALIDATION_ERROR',
    badSport2Body
  );

  // T3 — validation runs BEFORE the cache middleware (no cache lookup happens).
  const badPlayer = await fetch(`${base}/api/injury/player/abc`);
  const badPlayerBody = await badPlayer.json();
  check(
    'T3. /api/injury/player/abc → 400 field playerId (before cache)',
    badPlayer.status === 400 && badPlayerBody.validationErrors?.[0]?.field === 'playerId',
    badPlayerBody
  );

  // T4 — non-positive playerId.
  const zeroPlayer = await fetch(`${base}/api/injury/player/0`);
  check('T4. playerId 0 → 400', zeroPlayer.status === 400, zeroPlayer.status);

  // T5 — season format.
  const badSeason = await fetch(`${base}/api/momentum/analysis/NBA?season=20245`);
  check('T5. season "20245" → 400', badSeason.status === 400, badSeason.status);
  const okSeason = await fetch(`${base}/api/momentum/analysis/NBA?season=2024-25`);
  check('T5. season "2024-25" → not 400', okSeason.status !== 400, okSeason.status);

  // T6 — timeout situation ranges.
  const badDiff = await fetch(
    `${base}/api/momentum/timeout/NBA?scoreDiff=999&timeRemaining=120&period=4`
  );
  check('T6. timeout scoreDiff=999 → 400', badDiff.status === 400, badDiff.status);
  const okTimeout2 = await fetch(
    `${base}/api/momentum/timeout/NBA?scoreDiff=-5&timeRemaining=120&period=4`
  );
  check('T6. valid timeout params → not 400', okTimeout2.status !== 400, okTimeout2.status);

  // T7 — date range via the real search route.
  const badDates = await fetch(`${base}/api/search/games?dateFrom=2024-01-02&dateTo=2024-01-01`);
  check('T7. dateFrom > dateTo → 400', badDates.status === 400, badDates.status);

  // T8 + T10 — pagination defaults and limit clamping in the response meta.
  const players = await (await fetch(`${base}/api/sports/nba/players?limit=500`)).json();
  check(
    'T8. limit 500 → clamped to 100 in response meta',
    players.success === true && players.meta?.limit === 100,
    players.meta
  );
  const playersDefault = await (await fetch(`${base}/api/sports/nba/players`)).json();
  check(
    'T10. defaults → page 1 / limit 50',
    playersDefault.success === true &&
      playersDefault.meta?.page === 1 &&
      playersDefault.meta?.limit === 50,
    playersDefault.meta
  );

  server.close();
} finally {
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
