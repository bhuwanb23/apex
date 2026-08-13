// Phase 8 Step 6 — test the logger setup (custom levels, transports, child
// loggers, process handlers).
//   npx tsx scripts/logger-step6-test.ts
//
//   T1  custom levels exist (http, silly, critical alias)
//   T2  critical → logs/error.log (critical ≡ fatal)
//   T3  info → logs/combined.log
//   T4  debug → logs/combined.log (LOG_LEVEL=debug)
//   T5  silly → filtered out at LOG_LEVEL=debug (below the threshold)
//   T6  httpLogger → logs/http.log (request lines only)
//   T7  child loggers add context (jobs / ml-client / database)
//   T8  uncaughtException + unhandledRejection handlers registered
//   T9  fatal → logs/error.log
//   T10 JSON lines carry service + environment fields
//   T11 logger.http (request level) → logs/combined.log

// Env before any src import — explicit LOG_LEVEL so the filter assertions
// (T5) are deterministic.
process.env.LOG_LEVEL = 'debug';
process.env.PYTHON_ML_URL = 'http://127.0.0.1:1';

import { readFileSync } from 'node:fs';

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

const { logger, httpLogger, jobLogger, mlLogger, dbLogger } =
  await import('../src/config/logger.js');

const RUN = Date.now();
const marker = (s: string): string => `${s}-${RUN}`;

function readTail(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

const combined = (): string => readTail('logs/combined.log');
const errorLog = (): string => readTail('logs/error.log');
const httpLog = (): string => readTail('logs/http.log');

try {
  // -------------------------------------------------------------------------
  // T1 — custom levels present
  // -------------------------------------------------------------------------
  console.log('T1. Custom levels:');
  check('logger.http is a function', typeof logger.http === 'function');
  check('logger.silly is a function', typeof logger.silly === 'function');
  check('logger.critical is a function (fatal alias)', typeof logger.critical === 'function');
  check(
    'standard levels still present',
    typeof logger.info === 'function' &&
      typeof logger.error === 'function' &&
      typeof logger.debug === 'function'
  );

  // -------------------------------------------------------------------------
  // T2 — critical → error.log
  // -------------------------------------------------------------------------
  console.log('T2. critical → error.log:');
  const critMarker = marker('CRIT');
  logger.critical({ test: 1 }, critMarker);
  check('critical line written to error.log', errorLog().includes(critMarker));

  // -------------------------------------------------------------------------
  // T3/T4 — info + debug → combined.log
  // -------------------------------------------------------------------------
  console.log('T3/T4. info + debug → combined.log:');
  const infoMarker = marker('INFO');
  logger.info({ test: 2 }, infoMarker);
  check('info written to combined.log', combined().includes(infoMarker));
  const debugMarker = marker('DBG');
  logger.debug({ test: 3 }, debugMarker);
  check('debug written to combined.log (LOG_LEVEL=debug)', combined().includes(debugMarker));

  // -------------------------------------------------------------------------
  // T5 — silly filtered at LOG_LEVEL=debug (silly = 5 < debug = 20)
  // -------------------------------------------------------------------------
  console.log('T5. level filtering:');
  const sillyMarker = marker('SILLY');
  logger.silly({}, sillyMarker);
  check('silly filtered out at LOG_LEVEL=debug', !combined().includes(sillyMarker));

  // -------------------------------------------------------------------------
  // T6 — httpLogger → http.log
  // -------------------------------------------------------------------------
  console.log('T6. httpLogger → http.log:');
  const httpMarker = marker('HTTP');
  httpLogger.http({ method: 'GET', url: '/api/health', status: 200, durationMs: 1 }, httpMarker);
  check('request line written to http.log', httpLog().includes(httpMarker));

  // -------------------------------------------------------------------------
  // T7 — child loggers add context
  // -------------------------------------------------------------------------
  console.log('T7. child loggers:');
  const jobMarker = marker('JOBCTX');
  jobLogger.info({ run: 1 }, jobMarker);
  const jobLine =
    combined()
      .split('\n')
      .filter(l => l.includes(jobMarker))
      .at(-1) ?? '';
  check(
    'jobLogger line carries "context":"jobs"',
    jobLine.includes('"context":"jobs"'),
    jobLine.slice(0, 200)
  );

  const mlMarker = marker('MLCTX');
  mlLogger.warn({ attempt: 2 }, mlMarker);
  const mlLine =
    combined()
      .split('\n')
      .filter(l => l.includes(mlMarker))
      .at(-1) ?? '';
  check(
    'mlLogger line carries "context":"ml-client"',
    mlLine.includes('"context":"ml-client"'),
    mlLine.slice(0, 200)
  );

  const dbMarker = marker('DBCTX');
  dbLogger.error({ op: 'query' }, dbMarker);
  const dbLine =
    combined()
      .split('\n')
      .filter(l => l.includes(dbMarker))
      .at(-1) ?? '';
  check(
    'dbLogger line carries "context":"database"',
    dbLine.includes('"context":"database"'),
    dbLine.slice(0, 200)
  );

  // -------------------------------------------------------------------------
  // T8 — process-level handlers registered
  // -------------------------------------------------------------------------
  console.log('T8. process handlers:');
  check('uncaughtException handler registered', process.listeners('uncaughtException').length > 0);
  check(
    'unhandledRejection handler registered',
    process.listeners('unhandledRejection').length > 0
  );

  // -------------------------------------------------------------------------
  // T9 — fatal → error.log
  // -------------------------------------------------------------------------
  console.log('T9. fatal → error.log:');
  const fatalMarker = marker('FATAL');
  logger.fatal({ test: 9 }, fatalMarker);
  check('fatal line written to error.log', errorLog().includes(fatalMarker));

  // -------------------------------------------------------------------------
  // T10 — JSON structure carries service + environment
  // -------------------------------------------------------------------------
  console.log('T10. JSON structure:');
  const structMarker = marker('STRUCT');
  logger.info({ depth: 1 }, structMarker);
  const structLine =
    combined()
      .split('\n')
      .filter(l => l.includes(structMarker))
      .at(-1) ?? '';
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(structLine) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  check(
    'line is valid JSON with service + environment',
    parsed !== null && typeof parsed.service === 'string' && typeof parsed.environment === 'string',
    structLine.slice(0, 200)
  );

  // -------------------------------------------------------------------------
  // T11 — logger.http (request level) → combined.log
  // -------------------------------------------------------------------------
  console.log('T11. request level via main logger:');
  const httpMainMarker = marker('HTTPMAIN');
  logger.http({ method: 'GET', url: '/api/health', status: 200 }, httpMainMarker);
  check('http-level line written to combined.log', combined().includes(httpMainMarker));
} finally {
  // no-op cleanup (file logs are append-only by design)
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
