// Phase 8 Step 7 — test the request logging middleware.
//   npx tsx scripts/request-logger-step7-test.ts
//
//   T1  X-Response-Time header on every response
//   T2  incoming + response logs share the same requestId (matchable)
//   T3  each request gets a unique requestId
//   T4  request context propagation — a handler reads getRequestId() via
//       AsyncLocalStorage and returns the same UUID the logs carry
//   T5  4xx responses logged at warn level
//   T6  5xx responses logged at error level
//   T7  slow request (> 2s) logs "Slow request detected" with threshold
//   T8  response log carries statusCode + responseTimeMs + cacheStatus

// Env first — debug so http/warn/error levels all reach combined.log.
process.env.LOG_LEVEL = 'debug';
process.env.PYTHON_ML_URL = 'http://127.0.0.1:1';

import { readFileSync, writeFileSync } from 'node:fs';
import express from 'express';

// Fresh log file — combined.log is append-only across runs, which would
// otherwise pollute count-based assertions.
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

const { requestLogger } = await import('../src/middleware/request.logger.js');
const { errorHandler, notFound } = await import('../src/middleware/error.middleware.js');
const { getRequestId } = await import('../src/utils/request.context.js');

function readLog(): string {
  try {
    return readFileSync('logs/combined.log', 'utf8');
  } catch {
    return '';
  }
}

/** All JSON log lines that reference a requestId (or every line when none). */
function linesForRequest(log: string, requestId?: string): Array<Record<string, unknown>> {
  return log
    .split('\n')
    .filter(l => (requestId ? l.includes(requestId) : true))
    .map(l => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((l): l is Record<string, unknown> => l !== null);
}

try {
  const app = express();
  app.use(requestLogger);
  app.get('/ok', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/ctx', (_req, res) => {
    // Runs inside the request's AsyncLocalStorage context → same requestId.
    res.json({ requestId: getRequestId() });
  });
  app.get('/boom', () => {
    throw new Error('intentional test 500');
  });
  app.get('/slow', async (_req, res) => {
    await new Promise(resolve => {
      setTimeout(resolve, 2100);
    });
    res.json({ slow: true });
  });
  app.use(notFound);
  app.use(errorHandler);

  const server = await new Promise<import('node:http').Server>(resolve => {
    const srv = app.listen(0, () => resolve(srv));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  // -------------------------------------------------------------------------
  // T1 + T2 — 200 route
  // -------------------------------------------------------------------------
  console.log('T1/T2. 200 route:');
  const okRes = await fetch(`${base}/ok`);
  await okRes.json();
  const respTime = okRes.headers.get('x-response-time');
  check('T1. X-Response-Time header present', respTime !== null && Number(respTime) >= 0, respTime);

  // Re-read the log AFTER the response completed (finish listener fires before
  // fetch resolves, but be safe).
  await new Promise(resolve => {
    setTimeout(resolve, 100);
  });
  const okLines = linesForRequest(readLog()).filter(l => l.url === '/ok');
  // Find the request-in and request-done pair by their shared requestId.
  const inLines = okLines.filter(l => l.msg === 'request in');
  const doneLines = okLines.filter(l => l.msg === 'request done');
  check('T2. incoming log present', inLines.length === 1, inLines.length);
  check('T2. response log present', doneLines.length === 1, doneLines.length);
  const okRequestId = String(inLines[0]?.requestId ?? '');
  check(
    'T2. request/response share the same requestId',
    okRequestId.length > 0 && okRequestId === String(doneLines[0]?.requestId ?? ''),
    { in: inLines[0]?.requestId, done: doneLines[0]?.requestId }
  );
  check(
    'T8. response log has statusCode 200 + responseTimeMs + cacheStatus field',
    doneLines[0]?.statusCode === 200 &&
      typeof doneLines[0]?.responseTimeMs === 'number' &&
      'cacheStatus' in (doneLines[0] ?? {}),
    doneLines[0]
  );

  // -------------------------------------------------------------------------
  // T3 — unique requestIds
  // -------------------------------------------------------------------------
  console.log('T3. unique requestIds:');
  const r1 = await (await fetch(`${base}/ctx`)).json();
  const r2 = await (await fetch(`${base}/ctx`)).json();
  check('T3. two requests → different requestIds', r1.requestId !== r2.requestId, { r1, r2 });

  // -------------------------------------------------------------------------
  // T4 — context propagation: handler's getRequestId() matches the log
  // -------------------------------------------------------------------------
  console.log('T4. context propagation:');
  await new Promise(resolve => {
    setTimeout(resolve, 100);
  });
  const ctxLines = linesForRequest(readLog(), r1.requestId);
  const ctxIn = ctxLines.find(l => l.msg === 'request in');
  check(
    'T4. handler read the same requestId via AsyncLocalStorage',
    ctxIn !== undefined && ctxIn.requestId === r1.requestId,
    { handler: r1.requestId, log: ctxIn?.requestId }
  );

  // -------------------------------------------------------------------------
  // T5 — 404 → warn level (pino numeric: warn = 40)
  // -------------------------------------------------------------------------
  console.log('T5. 4xx → warn:');
  await fetch(`${base}/nope`);
  await new Promise(resolve => {
    setTimeout(resolve, 100);
  });
  const notFoundLines = linesForRequest(readLog()).filter(
    l => l.msg === 'request done' && l.statusCode === 404
  );
  const notFoundLine = notFoundLines.at(-1) as Record<string, unknown> | undefined;
  check('T5. 404 response logged at warn level (40)', notFoundLine?.level === 40, notFoundLine);

  // -------------------------------------------------------------------------
  // T6 — 500 → error level (pino numeric: error = 50)
  // -------------------------------------------------------------------------
  console.log('T6. 5xx → error:');
  await fetch(`${base}/boom`);
  await new Promise(resolve => {
    setTimeout(resolve, 100);
  });
  const boomLines = linesForRequest(readLog()).filter(
    l => l.msg === 'request done' && l.statusCode === 500
  );
  const boomLine = boomLines.at(-1) as Record<string, unknown> | undefined;
  check('T6. 500 response logged at error level (50)', boomLine?.level === 50, boomLine);

  // -------------------------------------------------------------------------
  // T7 — slow request (> 2s) → warn "Slow request detected"
  // -------------------------------------------------------------------------
  console.log('T7. slow request:');
  const slowStart = Date.now();
  await fetch(`${base}/slow`);
  const slowMs = Date.now() - slowStart;
  await new Promise(resolve => {
    setTimeout(resolve, 100);
  });
  const slowLines = readLog()
    .split('\n')
    .filter(l => l.includes('Slow request detected'))
    .map(l => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((l): l is Record<string, unknown> => l !== null);
  const slowLine = slowLines.at(-1);
  check(
    'T7. "Slow request detected" logged at warn',
    slowLine?.level === 40 && slowLine?.slowThresholdMs === 2000,
    slowLine
  );
  check('T7. slow request actually took > 2s', slowMs >= 2000, slowMs);

  server.close();
} catch (err) {
  failed += 1;
  console.error('  ✗ suite crashed', err);
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
