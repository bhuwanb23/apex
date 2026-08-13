// Phase 8 Step 8 — test the ML call logging + performance tracking.
//   npx tsx scripts/ml-logger-step8-test.ts
//
//   T1  performance rolling stats — avg / P95 / slowest per endpoint
//   T2  timeout streaks → 3 consecutive = "stuck" + error log; a successful
//      call resets the streak
//   T3  success path — fake Python server: request/response logs with
//      payloadSize, responseTimeMs, responseSize, modelUsed
//   T4  requestId propagation — ML logs carry the parent request's UUID
//   T5  failure path — unreachable Python → "ML call failed" at error level
//      with errorType; retries logged per attempt
//   T6  timeout path — slow server → "ML call timed out" warn + counter

// Env first — debug so all levels reach combined.log.
process.env.LOG_LEVEL = 'debug';
process.env.PYTHON_ML_URL = 'http://127.0.0.1:1';

import { createServer, type Server } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';

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

const { createMLClient } = await import('../src/ml/ml.client.js');
const { getMLPerformance, recordMLTiming, recordMLTimeout } =
  await import('../src/ml/ml.logger.js');
const { requestContext } = await import('../src/utils/request.context.js');

function readLog(): string {
  try {
    return readFileSync('logs/combined.log', 'utf8');
  } catch {
    return '';
  }
}

/** JSON lines whose msg matches (unique by marker where needed). */
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

/** Tiny fake Python service. */
function fakePython(handler: (path: string, body: unknown) => void): Promise<Server> {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
    });
    req.on('end', () => {
      handler(req.url ?? '/', raw ? (JSON.parse(raw) as unknown) : undefined);
      res.end(JSON.stringify({ riskScore: 71, model: 'zscore-v2' }));
    });
  });
  return new Promise(resolve => {
    server.listen(0, () => resolve(server));
  });
}

function portOf(server: Server): number {
  return (server.address() as { port: number }).port;
}

const servers: Server[] = [];

try {
  // -------------------------------------------------------------------------
  // T1 — rolling performance stats
  // -------------------------------------------------------------------------
  console.log('T1. performance stats:');
  for (const v of [10, 20, 30, 40, 50]) recordMLTiming('/risk', v);
  const perf = getMLPerformance();
  const risk = perf.endpoints['/risk'];
  check('count = 5', risk?.count === 5, risk);
  check('avg = 30', risk?.avgResponseMs === 30, risk?.avgResponseMs);
  check('p95 = 50 (ceil(0.95*5)-1 → index 4)', risk?.p95ResponseMs === 50, risk?.p95ResponseMs);
  check('slowest = 50', risk?.slowestMs === 50, risk?.slowestMs);
  check('totals.calls = 5', perf.totals.calls === 5, perf.totals);

  // -------------------------------------------------------------------------
  // T2 — timeout streaks → stuck, reset on success
  // -------------------------------------------------------------------------
  console.log('T2. timeout streaks:');
  recordMLTimeout('/risk', 30000);
  recordMLTimeout('/risk', 30000);
  check('1-2 timeouts → not stuck yet', getMLPerformance().stuckEndpoints.length === 0);
  recordMLTimeout('/risk', 30000);
  const stuckPerf = getMLPerformance();
  check(
    '3 consecutive timeouts → endpoint stuck',
    stuckPerf.stuckEndpoints.includes('/risk'),
    stuckPerf.stuckEndpoints
  );
  check(
    '"ML endpoint appears stuck" logged at error',
    linesForMsg('ML endpoint appears stuck').length >= 1
  );
  check('"ML call timed out" logged at warn', linesForMsg('ML call timed out').length >= 3);
  recordMLTiming('/risk', 25); // success breaks the streak
  check(
    'success resets the streak → no longer stuck',
    !getMLPerformance().stuckEndpoints.includes('/risk')
  );
  check('timeouts counter kept', (getMLPerformance().endpoints['/risk']?.timeouts ?? 0) === 3);

  // -------------------------------------------------------------------------
  // T3 — success path against a fake Python server
  // -------------------------------------------------------------------------
  console.log('T3. success path:');
  const good = await fakePython((_path, body) => {
    check('T3. fake server received a JSON body', body !== undefined, body);
  });
  servers.push(good);
  const goodClient = createMLClient(`http://127.0.0.1:${portOf(good)}`, 5000);
  const result = await goodClient.post<{ riskScore: number; model: string }>('/risk', {
    playerId: 7,
    window: 14,
  });
  check('T3. response parsed', result.riskScore === 71, result);
  const starts = linesForMsg('ML call start');
  const oks = linesForMsg('ML call ok');
  const okLine = oks.at(-1) as Record<string, unknown> | undefined;
  check(
    'T3. "ML call start" logged with mlEndpoint + payloadSize',
    starts.at(-1)?.mlEndpoint === '/risk' && typeof starts.at(-1)?.payloadSize === 'number',
    starts.at(-1)
  );
  check(
    'T3. "ML call ok" logged with responseTimeMs/responseSize/modelUsed',
    okLine?.mlEndpoint === '/risk' &&
      typeof okLine?.responseTimeMs === 'number' &&
      typeof okLine?.responseSize === 'number' &&
      okLine?.modelUsed === 'zscore-v2',
    okLine
  );

  // -------------------------------------------------------------------------
  // T4 — requestId propagation via AsyncLocalStorage
  // -------------------------------------------------------------------------
  console.log('T4. requestId propagation:');
  await requestContext.run(
    { requestId: 'REQ-STEP8-1234', startTime: process.hrtime.bigint() },
    async () => {
      await goodClient.post('/risk', { playerId: 8 });
    }
  );
  const lastOk = linesForMsg('ML call ok').at(-1) as Record<string, unknown> | undefined;
  check(
    'ML log carries the parent requestId',
    lastOk?.requestId === 'REQ-STEP8-1234',
    lastOk?.requestId
  );

  // -------------------------------------------------------------------------
  // T5 — failure path: unreachable Python
  // -------------------------------------------------------------------------
  console.log('T5. failure path:');
  const deadClient = createMLClient('http://127.0.0.1:1', 2000);
  let failedPost = false;
  try {
    await deadClient.post('/compute', { x: 1 });
  } catch {
    failedPost = true;
  }
  check('T5. post rejected when Python unreachable', failedPost);
  const fails = linesForMsg('ML call failed');
  const failLine = fails.at(-1) as Record<string, unknown> | undefined;
  check(
    'T5. "ML call failed" at error level (50) with errorType + fallbackUsed',
    failLine?.level === 50 &&
      typeof failLine?.errorType === 'string' &&
      failLine?.fallbackUsed === false &&
      typeof failLine?.errorMessage === 'string',
    failLine
  );
  // Connect failures are retried twice → 3 attempts, 3 start + 3 failed logs.
  check(
    'T5. every attempt logged (3)',
    linesForMsg('ML call start').length >= 3 && fails.length >= 3,
    { starts: linesForMsg('ML call start').length, fails: fails.length }
  );

  // -------------------------------------------------------------------------
  // T6 — timeout path: server never responds
  // -------------------------------------------------------------------------
  console.log('T6. timeout path:');
  const slow = createServer(() => {
    /* never respond */
  });
  await new Promise<void>(resolve => {
    slow.listen(0, () => resolve());
  });
  servers.push(slow);
  const slowClient = createMLClient(`http://127.0.0.1:${portOf(slow)}`, 300);
  let slowFailed = false;
  try {
    await slowClient.post('/slow', { x: 1 });
  } catch {
    slowFailed = true;
  }
  check('T6. timed-out post rejected', slowFailed);
  const timeouts = linesForMsg('ML call timed out');
  check(
    'T6. "ML call timed out" logged at warn',
    timeouts.length >= 1 && timeouts.at(-1)?.level === 40,
    timeouts.at(-1)
  );
  check(
    'T6. timeout counter incremented',
    (getMLPerformance().endpoints['/slow']?.timeouts ?? 0) >= 1,
    getMLPerformance().endpoints['/slow']
  );
} finally {
  for (const s of servers) s.close();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
