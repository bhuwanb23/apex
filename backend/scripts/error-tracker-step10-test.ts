// Phase 8 Step 10 — test the error tracker + GET /api/health/errors.
//   npx tsx scripts/error-tracker-step10-test.ts
//
//   T1  counters increment per category; rates = count / 60
//   T2  recentErrors keeps the last 5, newest first
//   T3  critical threshold (db > 1/min) → status critical + ONE critical log
//   T4  degraded threshold (validation > 50/min) → status degraded
//   T5  healthy when nothing crosses a threshold
//   T6  HTTP — GET /api/health/errors returns the summary shape
//   T7  HTTP — a 404 feeds notFoundErrors, invalid params feed validationErrors

// Env first.
process.env.LOG_LEVEL = 'debug';
process.env.PYTHON_ML_URL = 'http://127.0.0.1:1';
process.env.JOB_CONTROL_ADMIN_KEY = 'unused-in-this-suite';

import { readFileSync, writeFileSync } from 'node:fs';
import type { ErrorCategory } from '../src/utils/error.tracker.js';

// Fresh log file for the critical-log assertions.
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

const { categoryForError, ERROR_CATEGORIES, getErrorSummary, resetErrorTracker, trackError } =
  await import('../src/utils/error.tracker.js');
const { NotFoundError, ValidationError, MLServiceError, DatabaseError } =
  await import('../src/utils/errors.js');
const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/db/client.js');

function countLines(msg: string): number {
  return readFileSync('logs/combined.log', 'utf8')
    .split('\n')
    .filter(l => l.includes(`"msg":"${msg}"`)).length;
}

try {
  // -------------------------------------------------------------------------
  // T5 — healthy baseline
  // -------------------------------------------------------------------------
  console.log('T1/T5. counters + healthy:');
  resetErrorTracker();
  const empty = getErrorSummary();
  check(
    'T5. empty tracker → healthy + zero counts',
    empty.status === 'healthy' &&
      empty.counts.validationErrors === 0 &&
      empty.rates.errorsPerMinute.validationErrors === 0
  );
  check('T5. period is "last 1 hour"', empty.period === 'last 1 hour');

  // -------------------------------------------------------------------------
  // T1 — counters + rates
  // -------------------------------------------------------------------------
  trackError('validationErrors', {
    message: 'bad sport',
    errorCode: 'VALIDATION_ERROR',
    statusCode: 400,
  });
  trackError('validationErrors', {
    message: 'bad id',
    errorCode: 'VALIDATION_ERROR',
    statusCode: 400,
  });
  trackError('notFoundErrors', {
    message: 'player missing',
    errorCode: 'NOT_FOUND',
    statusCode: 404,
  });
  trackError('mlServiceErrors', {
    message: 'python down',
    errorCode: 'ML_SERVICE_UNAVAILABLE',
    statusCode: 503,
  });
  const summary1 = getErrorSummary();
  check('T1. validationErrors count 2', summary1.counts.validationErrors === 2);
  check('T1. notFoundErrors count 1', summary1.counts.notFoundErrors === 1);
  check('T1. mlServiceErrors count 1', summary1.counts.mlServiceErrors === 1);
  check(
    'T1. rate = count / 60 (rounded to 3 decimals)',
    Math.abs(summary1.rates.errorsPerMinute.validationErrors - 2 / 60) < 0.001,
    summary1.rates
  );

  // -------------------------------------------------------------------------
  // T2 — recentErrors: last 5, newest first
  // -------------------------------------------------------------------------
  console.log('T2. recentErrors:');
  const recent = getErrorSummary().recentErrors;
  // 2 validation + 1 notFound + 1 ml = 4 tracked so far.
  check('T2. recentErrors has 4 entries', recent.length === 4, recent);
  check(
    'T2. newest first (ml last-tracked is first)',
    recent[0]?.errorCode === 'ML_SERVICE_UNAVAILABLE',
    recent
  );
  check(
    'T2. entries carry timestamp/message/category',
    typeof recent[0]?.timestamp === 'string' &&
      recent[0]?.category === 'mlServiceErrors' &&
      typeof recent[0]?.message === 'string',
    recent[0]
  );

  // -------------------------------------------------------------------------
  // T3 — critical: DB rate > 1/min
  // -------------------------------------------------------------------------
  console.log('T3. critical threshold:');
  resetErrorTracker();
  // 61 database errors → 61/60 > 1 per minute.
  for (let i = 0; i < 61; i++) {
    trackError('databaseErrors', {
      message: 'query failed',
      errorCode: 'DATABASE_ERROR',
      statusCode: 500,
    });
  }
  const critical = getErrorSummary();
  check('T3. status critical', critical.status === 'critical', critical.status);
  check('T3. db rate reflects the count', critical.rates.errorsPerMinute.databaseErrors > 1);
  check(
    'T3. critical log fired exactly once',
    countLines('Error rate threshold exceeded — critical') === 1
  );

  // -------------------------------------------------------------------------
  // T4 — degraded: validation rate > 50/min
  // -------------------------------------------------------------------------
  console.log('T4. degraded threshold:');
  resetErrorTracker();
  // 3001 validation errors → 3001/60 > 50 per minute.
  for (let i = 0; i < 3001; i++) {
    trackError('validationErrors', {
      message: 'spam',
      errorCode: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  }
  const degraded = getErrorSummary();
  check('T4. status degraded (not critical)', degraded.status === 'degraded', degraded.status);

  // -------------------------------------------------------------------------
  // T5b — categoryForError mapping (Step 10.1 classification)
  // -------------------------------------------------------------------------
  console.log('T5. category mapping:');
  check(
    'T5. ValidationError → validationErrors',
    categoryForError(new ValidationError('x')) === 'validationErrors'
  );
  check(
    'T5. NotFoundError → notFoundErrors',
    categoryForError(new NotFoundError('x')) === 'notFoundErrors'
  );
  check(
    'T5. MLServiceError → mlServiceErrors',
    categoryForError(new MLServiceError('x')) === 'mlServiceErrors'
  );
  check(
    'T5. DatabaseError → databaseErrors',
    categoryForError(new DatabaseError('x')) === 'databaseErrors'
  );
  check(
    'T5. 4xx ApiError → validationErrors',
    categoryForError({ errorCode: 'BAD_REQUEST', statusCode: 400 }) === 'validationErrors'
  );
  check(
    'T5. 5xx unknown → unknownErrors',
    categoryForError({ errorCode: 'API_ERROR', statusCode: 500 }) === 'unknownErrors'
  );
  check(
    'T5. every category has a counter',
    ERROR_CATEGORIES.every(c => typeof getErrorSummary().counts[c as ErrorCategory] === 'number')
  );

  // -------------------------------------------------------------------------
  // T6/T7 — HTTP integration
  // -------------------------------------------------------------------------
  console.log('T6/T7. HTTP integration:');
  resetErrorTracker();
  const app = createApp();
  const server = await new Promise<import('node:http').Server>(resolve => {
    const srv = app.listen(0, () => resolve(srv));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const errorsRes = await fetch(`${base}/api/health/errors`);
  const errorsBody = (await errorsRes.json()) as {
    success: boolean;
    data: {
      counts: Record<string, number>;
      rates: { errorsPerMinute: Record<string, number> };
      recentErrors: unknown[];
      status: string;
    };
  };
  check(
    'T6. GET /api/health/errors → summary shape',
    errorsRes.status === 200 &&
      errorsBody.data.counts.validationErrors === 0 &&
      typeof errorsBody.data.rates.errorsPerMinute.databaseErrors === 'number' &&
      Array.isArray(errorsBody.data.recentErrors) &&
      ['healthy', 'degraded', 'critical'].includes(errorsBody.data.status),
    errorsBody
  );

  // A 404 route miss → notFoundErrors; invalid params → validationErrors.
  await fetch(`${base}/api/definitely-not-a-route`);
  await fetch(`${base}/api/injury/player/abc`);
  const after = getErrorSummary();
  check('T7. 404 fed notFoundErrors', after.counts.notFoundErrors >= 1, after.counts);
  check(
    'T7. invalid params fed validationErrors',
    after.counts.validationErrors >= 1,
    after.counts
  );

  server.close();
} finally {
  resetErrorTracker();
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
