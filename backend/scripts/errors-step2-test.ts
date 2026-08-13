// Phase 8 Step 2 — test the custom error classes (docs Test 1, expanded).
//   npx tsx scripts/errors-step2-test.ts
//
//   T1 AppError base          → timestamp, name, toResponse shape, context
//   T2 ValidationError        → 400/VALIDATION_ERROR, field errors, fromZod
//   T3 NotFoundError          → 404/NOT_FOUND, resource field
//   T4 MLServiceError         → 503/ML_SERVICE_ERROR, endpoint/status/fallback
//   T5 MLServiceUnavailable   → 503/ML_SERVICE_UNAVAILABLE, instanceof chain
//   T6 DatabaseError          → 500/DATABASE_ERROR, NOT operational, safe msg
//   T7 ExternalAPIError       → 502/EXTERNAL_API_ERROR, apiName/status/retry
//   T8 RateLimitError         → 429/RATE_LIMIT_EXCEEDED, retryAfter/limit
//   T9 CacheError             → 500/CACHE_ERROR, NOT operational, safe msg
//   T10 AuthorizationError    → 401/UNAUTHORIZED
//   T11 Response guarantee    → every toResponse has success/status/message/
//                               errorCode/timestamp, never stack or context
//   T12 ApiError compatibility→ extends AppError, helpers keep behavior
//   T13 ML client re-export   → same class identities (single definition)
//   T14 Middleware integration→ real HTTP: thrown errors serialize correctly
//
// No DB or ML service required — pure class + middleware behavior.

process.env.LOG_LEVEL = 'silent';

const {
  AppError,
  ValidationError,
  NotFoundError,
  MLServiceError,
  MLServiceUnavailableError,
  DatabaseError,
  ExternalAPIError,
  RateLimitError,
  CacheError,
  AuthorizationError,
  isAppError,
  DEFAULT_SAFE_MESSAGE,
} = await import('../src/utils/errors.js');
const { ApiError, errorHandler } = await import('../src/middleware/error.middleware.js');
const mlModule = await import('../src/ml/ml.client.js');

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

// ---------------------------------------------------------------------------
// T1 — AppError base
// ---------------------------------------------------------------------------
console.log('T1. AppError base:');
const err = new AppError('boom', { statusCode: 500, errorCode: 'X', isOperational: false });
check('extends Error', err instanceof Error);
check('name is AppError', err.name === 'AppError', err.name);
check('timestamp is ISO', !Number.isNaN(Date.parse(err.timestamp)), err.timestamp);
check('statusCode + errorCode set', err.statusCode === 500 && err.errorCode === 'X');
check('isOperational=false', err.isOperational === false);
check('non-operational message hidden in response', err.toResponse().message === DEFAULT_SAFE_MESSAGE);
const operational = new AppError('expected', { statusCode: 400, errorCode: 'X', isOperational: true });
check('operational message exposed', operational.toResponse().message === 'expected');
const withContext = new AppError('c', {
  statusCode: 500,
  errorCode: 'X',
  isOperational: false,
  context: { playerId: 7 },
});
check('context kept in log context', (withContext.getLogContext().context as { playerId: number }).playerId === 7);
check('context NEVER in response', withContext.toResponse().context === undefined);

// ---------------------------------------------------------------------------
// T2 — ValidationError
// ---------------------------------------------------------------------------
console.log('T2. ValidationError:');
const v = new ValidationError('Invalid sport parameter', [
  { field: 'sport', message: 'must be one of: NBA, NFL, MLB, NHL', value: 'FOOTBALL' },
]);
check('status 400', v.statusCode === 400);
check('errorCode VALIDATION_ERROR', v.errorCode === 'VALIDATION_ERROR');
check('isOperational', v.isOperational === true);
check('validationErrors carried', v.validationErrors.length === 1 && v.validationErrors[0]?.field === 'sport');
const vResp = v.toResponse();
check('response includes validationErrors', Array.isArray(vResp.validationErrors) && vResp.validationErrors.length === 1);
const zodLike = ValidationError.fromZod({
  issues: [
    { path: ['sport'], message: 'Invalid enum value' },
    { path: ['page'], message: 'Expected number' },
  ],
});
check('fromZod maps issues to fields', zodLike.validationErrors.length === 2 && zodLike.validationErrors[0]?.field === 'sport');
check('fromZod errorCode VALIDATION_ERROR', zodLike.errorCode === 'VALIDATION_ERROR');

// ---------------------------------------------------------------------------
// T3 — NotFoundError
// ---------------------------------------------------------------------------
console.log('T3. NotFoundError:');
const nf = new NotFoundError('Player 999 not found', 'player');
check('status 404', nf.statusCode === 404);
check('errorCode NOT_FOUND', nf.errorCode === 'NOT_FOUND');
check('isOperational', nf.isOperational === true);
check('resource carried', nf.resource === 'player');
check('message exposed', nf.toResponse().message === 'Player 999 not found');

// ---------------------------------------------------------------------------
// T4 — MLServiceError
// ---------------------------------------------------------------------------
console.log('T4. MLServiceError:');
const ml = new MLServiceError('model failed', { mlEndpoint: '/injury/compute-risk', mlStatusCode: 500 });
check('status 503', ml.statusCode === 503);
check('errorCode ML_SERVICE_ERROR', ml.errorCode === 'ML_SERVICE_ERROR');
check('isOperational', ml.isOperational === true);
check('mlEndpoint carried', ml.mlEndpoint === '/injury/compute-risk');
check('mlStatusCode carried', ml.mlStatusCode === 500);
check('fallbackUsed defaults false', ml.fallbackUsed === false);
const mlFallback = new MLServiceError('model failed', { fallbackUsed: true });
check('fallbackUsed true when passed', mlFallback.fallbackUsed === true);

// ---------------------------------------------------------------------------
// T5 — MLServiceUnavailableError
// ---------------------------------------------------------------------------
console.log('T5. MLServiceUnavailableError:');
const mlu = new MLServiceUnavailableError('cannot connect', {
  lastAvailableAt: '2024-01-15T10:00:00.000Z',
  mlEndpoint: '/injury/compute-risk',
});
check('status 503', mlu.statusCode === 503);
check('errorCode ML_SERVICE_UNAVAILABLE', mlu.errorCode === 'ML_SERVICE_UNAVAILABLE');
check('isOperational', mlu.isOperational === true);
check('is instance of MLServiceError', mlu instanceof MLServiceError);
check('is instance of AppError', mlu instanceof AppError);
check('lastAvailableAt carried', mlu.lastAvailableAt === '2024-01-15T10:00:00.000Z');
check('name is MLServiceUnavailableError', mlu.name === 'MLServiceUnavailableError', mlu.name);

// ---------------------------------------------------------------------------
// T6 — DatabaseError
// ---------------------------------------------------------------------------
console.log('T6. DatabaseError:');
const db = new DatabaseError('SQLITE_BUSY: database is locked', { operation: 'findMany', table: 'players' });
check('status 500', db.statusCode === 500);
check('errorCode DATABASE_ERROR', db.errorCode === 'DATABASE_ERROR');
check('NOT operational', db.isOperational === false);
check('operation/table carried', db.operation === 'findMany' && db.table === 'players');
check('internal message NOT exposed', db.toResponse().message === DEFAULT_SAFE_MESSAGE);
check('log context keeps operation', (db.getLogContext().context as { operation: string }).operation === 'findMany');

// ---------------------------------------------------------------------------
// T7 — ExternalAPIError
// ---------------------------------------------------------------------------
console.log('T7. ExternalAPIError:');
const api = new ExternalAPIError('BallDontLie rate limited', { apiName: 'BallDontLie', apiStatus: 429, retryAfter: 60 });
check('status 502', api.statusCode === 502);
check('errorCode EXTERNAL_API_ERROR', api.errorCode === 'EXTERNAL_API_ERROR');
check('isOperational', api.isOperational === true);
check('apiName/apiStatus/retryAfter carried', api.apiName === 'BallDontLie' && api.apiStatus === 429 && api.retryAfter === 60);

// ---------------------------------------------------------------------------
// T8 — RateLimitError
// ---------------------------------------------------------------------------
console.log('T8. RateLimitError:');
const rl = new RateLimitError('Too many requests', { retryAfter: 30, limit: 100 });
check('status 429', rl.statusCode === 429);
check('errorCode RATE_LIMIT_EXCEEDED', rl.errorCode === 'RATE_LIMIT_EXCEEDED');
check('isOperational', rl.isOperational === true);
check('retryAfter/limit carried', rl.retryAfter === 30 && rl.limit === 100);

// ---------------------------------------------------------------------------
// T9 — CacheError
// ---------------------------------------------------------------------------
console.log('T9. CacheError:');
const ce = new CacheError('cache write failed');
check('status 500', ce.statusCode === 500);
check('errorCode CACHE_ERROR', ce.errorCode === 'CACHE_ERROR');
check('NOT operational', ce.isOperational === false);
check('safe message', ce.toResponse().message === DEFAULT_SAFE_MESSAGE);

// ---------------------------------------------------------------------------
// T10 — AuthorizationError
// ---------------------------------------------------------------------------
console.log('T10. AuthorizationError:');
const auth = new AuthorizationError('Missing or invalid X-Admin-Key header');
check('status 401', auth.statusCode === 401);
check('errorCode UNAUTHORIZED', auth.errorCode === 'UNAUTHORIZED');
check('isOperational', auth.isOperational === true);

// ---------------------------------------------------------------------------
// T11 — Response guarantee (Step 1) for EVERY class
// ---------------------------------------------------------------------------
console.log('T11. Response guarantee:');
const all = [err, operational, v, zodLike, nf, ml, mlu, db, api, rl, ce, auth];
let guaranteeOk = true;
for (const e of all) {
  const resp = e.toResponse();
  const json = JSON.stringify(resp);
  if (
    resp.success !== false ||
    typeof resp.status !== 'number' ||
    typeof resp.message !== 'string' ||
    typeof resp.errorCode !== 'string' ||
    typeof resp.timestamp !== 'string'
  ) {
    guaranteeOk = false;
    console.error('  bad shape:', resp);
  }
  if (json.includes('stack') || json.includes('context')) guaranteeOk = false;
}
check('all 12 errors serialize to the guaranteed shape', guaranteeOk);

// ---------------------------------------------------------------------------
// T12 — ApiError compatibility (89 existing call sites must keep working)
// ---------------------------------------------------------------------------
console.log('T12. ApiError compatibility:');
check('ApiError extends AppError', ApiError.prototype instanceof AppError);
const a404 = ApiError.notFound('Player 1 not found');
check('notFound → 404/NOT_FOUND', a404.statusCode === 404 && a404.errorCode === 'NOT_FOUND');
check('notFound is AppError', a404 instanceof AppError);
const a400 = ApiError.badRequest('bad input', { field: 'x' });
check('badRequest → 400/BAD_REQUEST', a400.statusCode === 400 && a400.errorCode === 'BAD_REQUEST');
check('details carried', (a400.details as { field: string }).field === 'x');
check('conflict → 409/CONFLICT', ApiError.conflict('dup').statusCode === 409 && ApiError.conflict('dup').errorCode === 'CONFLICT');
check('internal → 500/API_ERROR', ApiError.internal().statusCode === 500 && ApiError.internal().errorCode === 'API_ERROR');
const raw = new ApiError(503, 'ml down');
check('raw 503 constructor works', raw.statusCode === 503);
check('isAppError guard works', isAppError(a404) && !isAppError(new Error('plain')) && !isAppError(null));

// ---------------------------------------------------------------------------
// T13 — ML client re-export identity (single definition)
// ---------------------------------------------------------------------------
console.log('T13. ML client re-export:');
check(
  'MLServiceError identity matches utils/errors',
  mlModule.MLServiceError === MLServiceError
);
check(
  'MLServiceUnavailableError identity matches utils/errors',
  mlModule.MLServiceUnavailableError === MLServiceUnavailableError
);

// ---------------------------------------------------------------------------
// T14 — Middleware integration (real HTTP round trip)
// ---------------------------------------------------------------------------
console.log('T14. Middleware integration:');
import express from 'express';

const app = express();
app.get('/validation', () => {
  throw new ValidationError('Invalid sport parameter', [{ field: 'sport', message: 'must be NBA/NFL/MLB/NHL', value: 'FOOTBALL' }]);
});
app.get('/not-found', () => {
  throw new NotFoundError('Player 999 not found', 'player');
});
app.get('/ml-down', () => {
  throw new MLServiceUnavailableError('ML unreachable', { mlEndpoint: '/injury/compute-risk', lastAvailableAt: '2024-01-15T10:00:00.000Z' });
});
app.get('/db-error', () => {
  throw new DatabaseError('SQLITE_BUSY', { operation: 'findMany', table: 'players' });
});
app.get('/plain-error', () => {
  throw new Error('kaboom internal detail');
});
app.use(errorHandler);

const server = await new Promise<import('node:http').Server>(resolve => {
  const srv = app.listen(0, () => resolve(srv));
});
const addr = server.address();
const port = typeof addr === 'object' && addr ? addr.port : 0;
const base = `http://127.0.0.1:${port}`;

const vRes = await (await fetch(`${base}/validation`)).json();
check('validation → 400 + VALIDATION_ERROR + field errors', vRes.status === 400 && vRes.errorCode === 'VALIDATION_ERROR' && Array.isArray(vRes.validationErrors));
const nfRes = await (await fetch(`${base}/not-found`)).json();
check('not found → 404 + NOT_FOUND + message', nfRes.status === 404 && nfRes.errorCode === 'NOT_FOUND' && nfRes.message === 'Player 999 not found');
const mlRes = await (await fetch(`${base}/ml-down`)).json();
check('ml down → 503 + ML_SERVICE_UNAVAILABLE', mlRes.status === 503 && mlRes.errorCode === 'ML_SERVICE_UNAVAILABLE');
const dbRes = await (await fetch(`${base}/db-error`)).json();
check('db error → 500 + DATABASE_ERROR + safe message (no internal detail)', dbRes.status === 500 && dbRes.errorCode === 'DATABASE_ERROR' && dbRes.message === DEFAULT_SAFE_MESSAGE && !JSON.stringify(dbRes).includes('SQLITE_BUSY'));
const plainRes = await (await fetch(`${base}/plain-error`)).json();
check('unknown error → 500 + safe message (no leak)', plainRes.status === 500 && plainRes.message === 'An internal error occurred' && !JSON.stringify(plainRes).includes('kaboom'));
server.close();

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
