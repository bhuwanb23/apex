/**
 * Phase 8 Step 11 — log management (11.1–11.3).
 *
 *   11.1 — rotation. pino's file destinations don't rotate (Winston does),
 *         so this module implements the same policy manually: when a log file
 *         passes maxSizeBytes (20 MB) it rotates — combined.log.1 holds the
 *         previous file, combined.log.2.gz onward are gzipped, up to maxFiles.
 *         rotateAllLogFiles() runs at startup; rotateLogFile() is exported
 *         for the log-viewer route / tests.
 *
 *   11.2 — the log viewer. readRecentLogs() reads logs/combined.log, parses
 *         each JSON line and filters by level (>= severity), context, since
 *         and limit. GET /api/logs/recent (X-Admin-Key protected) exposes it.
 *
 *   11.3 — the startup banner. logStartupBanner() prints the boot summary
 *         (version, environment, port, database, ML service, node version,
 *         routes, scheduled jobs, cache status) — wired in src/index.ts.
 */
import { existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { logger } from './logger.util.js';

/** Files the rotation policy manages (all written by src/config/logger.ts). */
export const MANAGED_LOG_FILES = [
  'logs/combined.log',
  'logs/error.log',
  'logs/http.log',
  'logs/exceptions.log',
  'logs/rejections.log',
] as const;

/** 11.1 — rotate at 20 MB, keep 10 files (older ones gzipped). */
export const MAX_LOG_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_LOG_FILES = 10;

/** The file paths that already exist on disk. */
function existingLogFiles(): string[] {
  return MANAGED_LOG_FILES.filter(f => existsSync(f));
}

/**
 * Rotates one file: file → file.1, file.1 → file.2.gz, shifting the chain.
 * Older generations beyond 2 are gzipped (the plan's .1 / .2.gz naming).
 */
export function rotateLogFile(
  filePath: string,
  options: { maxSizeBytes?: number; maxFiles?: number } = {}
): boolean {
  const maxSizeBytes = options.maxSizeBytes ?? MAX_LOG_SIZE_BYTES;
  const maxFiles = options.maxFiles ?? MAX_LOG_FILES;
  if (!existsSync(filePath)) return false;
  const size = statSync(filePath).size;
  if (size <= maxSizeBytes) return false;

  // Drop the oldest generation.
  const oldestGz = `${filePath}.${maxFiles}.gz`;
  if (existsSync(oldestGz)) unlinkSync(oldestGz);
  // Shift the gzipped generations up (file.3.gz → file.4.gz, …).
  for (let i = maxFiles - 1; i >= 2; i--) {
    const src = `${filePath}.${i}.gz`;
    if (existsSync(src)) renameSync(src, `${filePath}.${i + 1}.gz`);
  }
  // Compress the previous raw generation (file.1 → file.2.gz).
  const prev = `${filePath}.1`;
  if (existsSync(prev)) {
    writeFileSync(`${filePath}.2.gz`, gzipSync(readFileSync(prev)));
    unlinkSync(prev);
  }
  // Current file → file.1.
  renameSync(filePath, prev);
  logger.warn({ filePath, sizeBytes: size, maxFiles }, 'Log file rotated');
  return true;
}

/** Rotates every managed log file that exceeded the size limit. */
export function rotateAllLogFiles(): void {
  for (const file of existingLogFiles()) rotateLogFile(file);
}

// ---------------------------------------------------------------------------
// 11.2 — log viewer
// ---------------------------------------------------------------------------

/** pino numeric level for a level name (custom http/silly included). */
const LEVEL_NUMBERS: Record<string, number> = {
  silly: 5,
  trace: 10,
  debug: 20,
  http: 25,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export interface LogViewerOptions {
  /** Include lines AT this level or more severe (e.g. 'error' → error+fatal). */
  level?: string;
  /** Only lines whose context field matches (jobs / ml-client / database). */
  context?: string;
  /** Only lines at/after this ISO timestamp. */
  since?: string;
  /** Number of lines to return (default 50, max 200). */
  limit?: number;
  /** Which file to read (default logs/combined.log). */
  file?: string;
}

/** Parses one JSON line; returns null for garbage/empty lines. */
function parseLine(line: string): Record<string, unknown> | null {
  if (line.trim() === '') return null;
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** Reads combined.log and returns matching entries, newest first. */
export function readRecentLogs(options: LogViewerOptions = {}): Record<string, unknown>[] {
  const file = options.file ?? 'logs/combined.log';
  if (!existsSync(file)) return [];

  // Hoist to a local const so TS narrows the index expression properly.
  const level = options.level;
  const levelNumber =
    level !== undefined ? (LEVEL_NUMBERS[level] as number | undefined) : undefined;
  const since = options.since;
  const sinceMs = since !== undefined ? Date.parse(since) : undefined;
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

  const matched: Record<string, unknown>[] = [];
  const lines = readFileSync(file, 'utf8').split('\n');
  // Iterate newest-first so we can stop after `limit` matches.
  for (let i = lines.length - 1; i >= 0 && matched.length < limit; i--) {
    // i is guarded to a valid index; ?? '' keeps noUncheckedIndexedAccess happy.
    const entry = parseLine(lines[i] ?? '');
    if (!entry) continue;
    if (levelNumber !== undefined && typeof entry.level === 'number' && entry.level < levelNumber) {
      continue;
    }
    if (options.context !== undefined && entry.context !== options.context) continue;
    if (sinceMs !== undefined && typeof entry.time === 'number' && entry.time < sinceMs) continue;
    matched.push(entry);
  }
  return matched;
}

// ---------------------------------------------------------------------------
// 11.3 — startup banner
// ---------------------------------------------------------------------------

export interface StartupBannerInfo {
  appName: string;
  version: string;
  environment: string;
  port: number;
  database: string;
  mlService: string;
  nodeVersion: string;
  startedAt: string;
  routes: string[];
  jobs: Array<{ name: string; schedule: string }>;
  cache: { memoryKeys: number; sqliteEntries: number };
}

/** Logs the boot summary — the Step 11.3 banner. */
export function logStartupBanner(info: StartupBannerInfo): void {
  logger.info(
    {
      version: info.version,
      environment: info.environment,
      port: info.port,
      database: info.database,
      mlService: info.mlService,
      nodeVersion: info.nodeVersion,
      startedAt: info.startedAt,
    },
    `${info.appName} backend started`
  );
  if (info.routes.length > 0) {
    logger.info({ routes: info.routes }, 'Registered routes');
  }
  if (info.jobs.length > 0) {
    logger.info({ jobs: info.jobs.map(j => `${j.name} → ${j.schedule}`) }, 'Scheduled jobs');
  }
  logger.info(
    { memoryCacheKeys: info.cache.memoryKeys, sqliteCacheEntries: info.cache.sqliteEntries },
    'Cache status'
  );
  logger.info('Ready to accept requests');
}
