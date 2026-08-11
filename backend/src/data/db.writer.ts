// Writes normalized records into SQLite and updates CacheMetadata.
// The record types below are the contract every sport transformer produces;
// the write functions are filled in one phase step at a time.

import { env } from '../config/env.js';
import { prisma } from '../db/client.js';

// ---------------------------------------------------------------------------
// Normalized record DTOs (mirror the Prisma models; externalId is the API id)
// ---------------------------------------------------------------------------

export interface TeamRecord {
  sportId: number;
  name: string;
  abbreviation: string;
  city: string;
  conference: string | null;
  division: string | null;
  externalId: string;
  logoUrl: string | null;
}

export interface PlayerRecord {
  teamId: number;
  sportId: number;
  name: string;
  firstName: string;
  lastName: string;
  position: string;
  jerseyNumber: string | null;
  age: number | null;
  heightInches: number | null;
  weightLbs: number | null;
  externalId: string;
  injuryStatus?: string | null;
}

export interface CoachRecord {
  teamId: number;
  sportId: number;
  name: string;
  firstName: string;
  lastName: string;
  role: string;
  externalId: string;
  hireDate: Date | null;
}

export interface GameRecord {
  sportId: number;
  homeTeamId: number;
  awayTeamId: number;
  date: Date;
  season: string;
  gameType: string;
  week: number | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  externalId: string;
  venue: string | null;
}

export interface PlayerGameLogRecord {
  playerId: number;
  gameId: number;
  teamId: number;
  date: Date;
  minutesPlayed: number | null;
  distanceCovered: number | null;
  highIntensityEvents: number | null;
  backToBack: boolean;
  daysRestBefore: number | null;
  gamesLast7Days: number | null;
  gamesLast14Days: number | null;
  gamesLast21Days: number | null;
  points: number | null;
  assists: number | null;
  rebounds: number | null;
  rawBoxScore: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Write functions (upsert by externalId per sport)
// ---------------------------------------------------------------------------

// TODO(phase-3): prisma.teams.upsert per record, keyed on [externalId, sportId]
export async function writeTeams(_teams: TeamRecord[]): Promise<void> {
  throw new Error('Not implemented: writeTeams');
}

// TODO(phase-3): prisma.players.upsert per record, keyed on [externalId, sportId]
export async function writePlayers(_players: PlayerRecord[]): Promise<void> {
  throw new Error('Not implemented: writePlayers');
}

// TODO(phase-3): prisma.coaches.upsert per record, keyed on [externalId, sportId]
export async function writeCoaches(_coaches: CoachRecord[]): Promise<void> {
  throw new Error('Not implemented: writeCoaches');
}

// TODO(phase-3): prisma.games.upsert per record, keyed on [externalId, sportId]
export async function writeGames(_games: GameRecord[]): Promise<void> {
  throw new Error('Not implemented: writeGames');
}

// TODO(phase-3): prisma.playerGameLogs.upsert per record, keyed on [playerId, gameId]
export async function writePlayerGameLogs(_logs: PlayerGameLogRecord[]): Promise<void> {
  throw new Error('Not implemented: writePlayerGameLogs');
}

// Cache freshness tier per data type (seconds): teams are stable (long TTL),
// schedules and play-by-play change daily (short TTL).
const TTL_BY_DATA_TYPE: Record<string, number> = {
  teams: env.CACHE_TTL_LONG,
  players: env.CACHE_TTL_MEDIUM, // rosters share this (fetchRosters → fetchPlayers)
  games: env.CACHE_TTL_SHORT,
  player_logs: env.CACHE_TTL_MEDIUM,
  play_by_play: env.CACHE_TTL_SHORT,
};

/**
 * Records/refreshes the CacheMetadata row for a fetch.
 * A failed fetch is stored with isValid=false + lastError so the next cache
 * check knows to retry instead of trusting stale data.
 */
export async function updateCacheMetadata(data: {
  cacheKey: string;
  dataType: string;
  sportId?: number | null;
  entityId?: string | null;
  season?: string | null;
  recordCount: number;
  fetchDurationMs: number;
  lastError?: string | null;
}): Promise<void> {
  const ttlSeconds = TTL_BY_DATA_TYPE[data.dataType] ?? env.CACHE_TTL_MEDIUM;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const payload = {
    dataType: data.dataType,
    sportId: data.sportId ?? null,
    entityId: data.entityId ?? null,
    season: data.season ?? null,
    cachedAt: now,
    expiresAt,
    recordCount: data.recordCount,
    isValid: data.lastError == null,
    lastError: data.lastError ?? null,
    fetchDurationMs: data.fetchDurationMs,
  };

  await prisma.cacheMetadata.upsert({
    where: { cacheKey: data.cacheKey },
    create: { cacheKey: data.cacheKey, ...payload },
    update: payload,
  });
}
