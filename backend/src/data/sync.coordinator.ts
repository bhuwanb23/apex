import type { SportFetcher } from './fetcher.manager.js';
import { fetcherManager } from './fetcher.manager.js';

export interface SyncResult {
  sport: string;
  teams: number;
  players: number;
  games: number;
  playerGameLogs: number;
  durationMs: number;
  error?: string;
}

/**
 * Orchestrates a full data sync for one sport:
 *   External API → fetcher (raw) → transformer (normalize) → db.writer (SQLite)
 *   → CacheMetadata updated (see db.writer.ts).
 *
 * TODO(phase-3): implemented step by step — fills each stage as the
 * fetchers/transformers/writers land.
 */
export async function syncSport(sportAbbreviation: string): Promise<SyncResult> {
  const fetcher: SportFetcher = fetcherManager.getFetcher(sportAbbreviation);

  // Stage 1 — fetch raw data (fetcher.fetchTeams / fetchPlayers / fetchGames)
  // Stage 2 — transform into DB records (per-sport transformers)
  // Stage 3 — write to SQLite (writeTeams / writePlayers / writeGames / ...)
  // Stage 4 — record the fetch in CacheMetadata (updateCacheMetadata)

  throw new Error(`Not implemented: syncSport (${fetcher.sport})`);
}
