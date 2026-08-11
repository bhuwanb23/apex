// Writes normalized records into SQLite and updates CacheMetadata.
// The record types below are the contract every sport transformer produces;
// the write functions are filled in one phase step at a time.

import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import type { Prisma } from '../generated/prisma/client.js';

// ---------------------------------------------------------------------------
// Normalized record DTOs (mirror the Prisma models; externalId is the API id)
// ---------------------------------------------------------------------------
// Transformers emit records with *external* ids (the sports API's ids) plus the
// sportId scope. The writer resolves those to real SQLite ids (teamId, gameId,
// playerId) via lookup tables, so the transformers never touch the database.

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
  /** API team id (or abbreviation for nfl_data_py sources) — resolved by the writer. */
  externalTeamId: string | null;
  injuryStatus?: string | null;
}

export interface CoachRecord {
  sportId: number;
  name: string;
  firstName: string;
  lastName: string;
  role: string;
  externalId: string;
  /** API team id — resolved by the writer. */
  externalTeamId: string | null;
  hireDate: Date | null;
}

export interface GameRecord {
  sportId: number;
  date: Date;
  season: string;
  gameType: string;
  week: number | null;
  homeScore: number | null;
  awayScore: number | null;
  winner: string | null;
  status: string;
  externalId: string;
  venue: string | null;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
}

export interface PlayerGameLogRecord {
  sportId: number;
  playerExternalId: string;
  gameExternalId: string;
  teamExternalId: string | null;
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

export interface PlayByPlayRecord {
  sportId: number;
  eventNumber: number;
  period: number;
  clock: string | null;
  eventTimeSeconds: number | null;
  teamExternalId: string | null;
  playerExternalId: string | null;
  eventType: string;
  eventSubtype: string | null;
  description: string;
  homeScore: number;
  awayScore: number;
  scoreDiff: number;
  isScoring: boolean;
  rawEvent: Record<string, unknown>;
}

export interface CoachDecisionRecord {
  sportId: number;
  gameExternalId: string;
  /** Team making the decision — resolved to the team's head coach by the writer. */
  teamExternalId: string | null;
  decisionType: string; // "4th_down" / "timeout" / "2pt_conversion"
  period: number;
  clock: string | null;
  gameTimeSeconds: number | null;
  scoreDiff: number;
  gameContext: Record<string, unknown>;
  chosenAction: string;
  outcome: string | null;
  outcomeSuccess: boolean | null;
}

// ---------------------------------------------------------------------------
// Batching + id resolution helpers
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Runs one Prisma `$transaction` per batch of records.
 * Prisma has no `upsertMany`, so each record becomes one upsert op and the
 * whole batch commits atomically (this is the "batch into groups of 100"
 * strategy from the spec — one transaction per 100 records, not one per record).
 */
async function runChunked<T>(
  records: T[],
  buildOps: (record: T) => Prisma.PrismaPromise<unknown> | null,
  label: string
): Promise<number> {
  let written = 0;
  const batches = chunk(records, BATCH_SIZE);
  for (const batch of batches) {
    // Prisma's array-form $transaction needs the raw (un-awaited) promises.
    const ops = batch.map(buildOps).filter((op): op is NonNullable<typeof op> => op != null);
    if (ops.length === 0) continue;
    await prisma.$transaction(ops);
    written += ops.length;
  }
  logger.debug({ label, records: records.length, written }, 'db.writer batch complete');
  return written;
}

/** Resolves external team ids (or abbreviations) → real team ids, scoped by sport. */
async function resolveTeamIds(
  sportId: number,
  externalIds: Array<string | null | undefined>
): Promise<Map<string, number>> {
  const unique = [...new Set(externalIds.filter((v): v is string => v != null && v !== ''))];
  const map = new Map<string, number>();
  if (unique.length === 0) return map;
  const rows = await prisma.teams.findMany({
    where: {
      sportId,
      OR: unique.flatMap(id => [{ externalId: id }, { abbreviation: id }]),
    },
    select: { id: true, externalId: true, abbreviation: true },
  });
  for (const row of rows) {
    map.set(row.externalId, row.id);
    if (row.abbreviation) map.set(row.abbreviation, row.id);
  }
  return map;
}

/** Resolves external player ids → real player ids, scoped by sport. */
async function resolvePlayerIds(
  sportId: number,
  externalIds: Array<string | null | undefined>
): Promise<Map<string, number>> {
  const unique = [...new Set(externalIds.filter((v): v is string => v != null && v !== ''))];
  const map = new Map<string, number>();
  if (unique.length === 0) return map;
  const rows = await prisma.players.findMany({
    where: { sportId, externalId: { in: unique } },
    select: { id: true, externalId: true },
  });
  for (const row of rows) map.set(row.externalId, row.id);
  return map;
}

/** Resolves external game ids → real game ids, scoped by sport. */
async function resolveGameIds(
  sportId: number,
  externalIds: Array<string | null | undefined>
): Promise<Map<string, number>> {
  const unique = [...new Set(externalIds.filter((v): v is string => v != null && v !== ''))];
  const map = new Map<string, number>();
  if (unique.length === 0) return map;
  const rows = await prisma.games.findMany({
    where: { sportId, externalId: { in: unique } },
    select: { id: true, externalId: true },
  });
  for (const row of rows) map.set(row.externalId, row.id);
  return map;
}

// ---------------------------------------------------------------------------
// Write functions (upsert by externalId per sport)
// ---------------------------------------------------------------------------

/** Upserts teams by [externalId, sportId]. Returns the number of records written. */
export async function writeTeams(teams: TeamRecord[], sportId: number): Promise<number> {
  return runChunked(
    teams,
    t =>
      prisma.teams.upsert({
        where: { externalId_sportId: { externalId: t.externalId, sportId } },
        create: { ...t, sportId },
        update: { ...t, sportId },
      }),
    'teams'
  );
}

/**
 * Upserts players by [externalId, sportId]. Resolves externalTeamId → teamId;
 * players without a resolvable team are skipped (logged) and not counted.
 */
export async function writePlayers(players: PlayerRecord[], sportId: number): Promise<number> {
  const teamIds = await resolveTeamIds(
    sportId,
    players.map(p => p.externalTeamId)
  );
  const skipped: string[] = [];
  const written = await runChunked(
    players,
    p => {
      const teamId = p.externalTeamId ? teamIds.get(p.externalTeamId) : undefined;
      if (teamId === undefined) {
        skipped.push(p.externalId);
        return null;
      }
      const payload = {
        name: p.name,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        jerseyNumber: p.jerseyNumber,
        age: p.age,
        heightInches: p.heightInches,
        weightLbs: p.weightLbs,
        injuryStatus: p.injuryStatus ?? null,
      };
      return prisma.players.upsert({
        where: { externalId_sportId: { externalId: p.externalId, sportId } },
        create: { ...payload, sportId, teamId, externalId: p.externalId },
        update: { ...payload, teamId },
      });
    },
    'players'
  );
  if (skipped.length > 0) {
    logger.warn({ sportId, skipped }, 'writePlayers skipped rows with no resolvable team');
  }
  return written;
}

/** Upserts coaches by [externalId, sportId]. Resolves externalTeamId → teamId. */
export async function writeCoaches(coaches: CoachRecord[], sportId: number): Promise<number> {
  const teamIds = await resolveTeamIds(
    sportId,
    coaches.map(c => c.externalTeamId)
  );
  const skipped: string[] = [];
  const written = await runChunked(
    coaches,
    c => {
      const teamId = c.externalTeamId ? teamIds.get(c.externalTeamId) : undefined;
      if (teamId === undefined) {
        skipped.push(c.externalId);
        return null;
      }
      const payload = {
        name: c.name,
        firstName: c.firstName,
        lastName: c.lastName,
        role: c.role,
        hireDate: c.hireDate,
      };
      return prisma.coaches.upsert({
        where: { externalId_sportId: { externalId: c.externalId, sportId } },
        create: { ...payload, sportId, teamId, externalId: c.externalId },
        update: { ...payload, teamId },
      });
    },
    'coaches'
  );
  if (skipped.length > 0) {
    logger.warn({ sportId, skipped }, 'writeCoaches skipped rows with no resolvable team');
  }
  return written;
}

/** Upserts games by [externalId, sportId]. Resolves home/away external team ids. */
export async function writeGames(games: GameRecord[], sportId: number): Promise<number> {
  const teamIds = await resolveTeamIds(
    sportId,
    games.flatMap(g => [g.homeTeamExternalId, g.awayTeamExternalId])
  );
  const skipped: string[] = [];
  const written = await runChunked(
    games,
    g => {
      const homeTeamId = teamIds.get(g.homeTeamExternalId);
      const awayTeamId = teamIds.get(g.awayTeamExternalId);
      if (homeTeamId === undefined || awayTeamId === undefined) {
        skipped.push(g.externalId);
        return null;
      }
      const payload = {
        date: g.date,
        season: g.season,
        gameType: g.gameType,
        week: g.week,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        winner: g.winner,
        status: g.status,
        venue: g.venue,
      };
      return prisma.games.upsert({
        where: { externalId_sportId: { externalId: g.externalId, sportId } },
        create: { ...payload, sportId, homeTeamId, awayTeamId, externalId: g.externalId },
        update: { ...payload, homeTeamId, awayTeamId },
      });
    },
    'games'
  );
  if (skipped.length > 0) {
    logger.warn({ sportId, skipped }, 'writeGames skipped rows with no resolvable teams');
  }
  return written;
}

/**
 * Upserts player game logs by [playerId, gameId].
 * Resolves player/game/team external ids; logs with no player or game are skipped.
 */
export async function writePlayerGameLogs(logs: PlayerGameLogRecord[]): Promise<number> {
  if (logs.length === 0) return 0;
  const playerIds = await resolvePlayerIds(
    logs[0]?.sportId ?? 0,
    logs.map(l => l.playerExternalId)
  );
  const gameIds = await resolveGameIds(
    logs[0]?.sportId ?? 0,
    logs.map(l => l.gameExternalId)
  );
  const teamIds = await resolveTeamIds(
    logs[0]?.sportId ?? 0,
    logs.map(l => l.teamExternalId)
  );
  const skipped: string[] = [];
  const written = await runChunked(
    logs,
    l => {
      const playerId = playerIds.get(l.playerExternalId);
      const gameId = gameIds.get(l.gameExternalId);
      if (playerId === undefined || gameId === undefined) {
        skipped.push(`${l.playerExternalId}:${l.gameExternalId}`);
        return null;
      }
      const teamId = l.teamExternalId ? teamIds.get(l.teamExternalId) : undefined;
      if (teamId === undefined) {
        skipped.push(`${l.playerExternalId}:${l.gameExternalId}`);
        return null; // no team on the log — drop it
      }
      const payload = {
        date: l.date,
        minutesPlayed: l.minutesPlayed,
        distanceCovered: l.distanceCovered,
        highIntensityEvents: l.highIntensityEvents,
        backToBack: l.backToBack,
        daysRestBefore: l.daysRestBefore,
        gamesLast7Days: l.gamesLast7Days,
        gamesLast14Days: l.gamesLast14Days,
        gamesLast21Days: l.gamesLast21Days,
        points: l.points,
        assists: l.assists,
        rebounds: l.rebounds,
        rawBoxScore: l.rawBoxScore as Prisma.InputJsonValue,
      };
      return prisma.playerGameLogs.upsert({
        where: { playerId_gameId: { playerId, gameId } },
        create: { ...payload, playerId, gameId, teamId },
        update: { ...payload, teamId },
      });
    },
    'playerGameLogs'
  );
  if (skipped.length > 0) {
    logger.warn({ skipped }, 'writePlayerGameLogs skipped rows with no player/game/team');
  }
  return written;
}

/**
 * Full-replace play-by-play for one game: deletes existing plays then inserts
 * fresh. Play-by-play rows are immutable and a re-sync of the same game should
 * be idempotent — delete+insert is safer than keyed upserts (no natural key).
 */
export async function writePlayByPlay(plays: PlayByPlayRecord[], gameId: number): Promise<number> {
  if (plays.length === 0) return 0;
  const sportId = plays[0]?.sportId ?? 0;
  const teamIds = await resolveTeamIds(
    sportId,
    plays.map(p => p.teamExternalId)
  );
  const playerIds = await resolvePlayerIds(
    sportId,
    plays.map(p => p.playerExternalId)
  );

  await prisma.playByPlay.deleteMany({ where: { gameId } });
  let written = 0;
  for (const batch of chunk(plays, BATCH_SIZE)) {
    await prisma.playByPlay.createMany({
      data: batch.map(p => ({
        gameId,
        sportId,
        eventNumber: p.eventNumber,
        period: p.period,
        clock: p.clock,
        eventTimeSeconds: p.eventTimeSeconds,
        teamId: p.teamExternalId ? (teamIds.get(p.teamExternalId) ?? null) : null,
        playerId: p.playerExternalId ? (playerIds.get(p.playerExternalId) ?? null) : null,
        eventType: p.eventType,
        eventSubtype: p.eventSubtype,
        description: p.description,
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        scoreDiff: p.scoreDiff,
        isScoring: p.isScoring,
        rawEvent: p.rawEvent as Prisma.InputJsonValue,
      })),
    });
    written += batch.length;
  }
  logger.debug({ gameId, written }, 'writePlayByPlay complete');
  return written;
}

/**
 * Writes extracted coaching decisions.
 * Resolves gameExternalId → gameId and teamExternalId → the team's head coach,
 * then deletes the game's existing decisions and inserts fresh ones.
 *
 * Decisions are immutable rows (no updatedAt, per spec) and a game can hold
 * several decisions of the same type in one period (e.g. two 4th-down calls in
 * the 4th quarter), so a keyed upsert would silently drop real decisions.
 * Delete+insert keeps re-syncs idempotent without losing data — the same
 * strategy writePlayByPlay uses.
 *
 * Decisions without a resolvable game or head coach are skipped.
 * EV fields are zero-filled until the Python EV/win-probability model fills them.
 */
export async function writeCoachDecisions(decisions: CoachDecisionRecord[]): Promise<number> {
  if (decisions.length === 0) return 0;
  const sportId = decisions[0]?.sportId ?? 0;
  const gameIds = await resolveGameIds(
    sportId,
    decisions.map(d => d.gameExternalId)
  );
  const teamIds = await resolveTeamIds(
    sportId,
    decisions.map(d => d.teamExternalId)
  );
  // Resolve each team's head coach once (per unique team) for the batch.
  const coachByTeam = new Map<number, number>();
  for (const teamId of teamIds.values()) {
    const coach = await prisma.coaches.findFirst({
      where: { teamId, role: 'head_coach', isActive: true },
      select: { id: true },
      orderBy: { hireDate: 'desc' },
    });
    if (coach) coachByTeam.set(teamId, coach.id);
  }

  // Replace per game in ONE transaction each, so a crash can't leave a game
  // with its old decisions deleted but the new ones half-inserted.
  const byGame = new Map<number, typeof decisions>();
  for (const d of decisions) {
    const gameId = gameIds.get(d.gameExternalId);
    const teamId = d.teamExternalId ? teamIds.get(d.teamExternalId) : undefined;
    const coachId = teamId !== undefined ? coachByTeam.get(teamId) : undefined;
    if (gameId === undefined || coachId === undefined) continue; // skip, logged below
    byGame.set(gameId, [...(byGame.get(gameId) ?? []), d]);
  }

  const skipped: string[] = [];
  let written = 0;
  for (const [gameId, gameDecisions] of byGame) {
    const rows = gameDecisions
      .map(d => {
        const teamId = d.teamExternalId ? teamIds.get(d.teamExternalId) : undefined;
        const coachId = teamId !== undefined ? coachByTeam.get(teamId) : undefined;
        if (coachId === undefined) {
          skipped.push(`${d.gameExternalId}:${d.teamExternalId ?? '?'}`);
          return null;
        }
        return {
          gameId,
          coachId,
          sportId,
          decisionType: d.decisionType,
          period: d.period,
          clock: d.clock,
          gameTimeSeconds: d.gameTimeSeconds,
          scoreDiff: d.scoreDiff,
          gameContext: d.gameContext as Prisma.InputJsonValue,
          chosenAction: d.chosenAction,
          // Zero-filled until the Python EV model fills real expected values.
          evChosen: 0,
          evBest: 0,
          evDifference: 0,
          isOptimal: false,
          alternativeActions: {} as Prisma.InputJsonValue,
          outcome: d.outcome,
          outcomeSuccess: d.outcomeSuccess,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
    if (rows.length === 0) continue;
    await prisma.$transaction([
      prisma.coachDecisions.deleteMany({ where: { gameId } }),
      ...rows.map(row => prisma.coachDecisions.create({ data: row })),
    ]);
    written += rows.length;
  }
  if (skipped.length > 0) {
    logger.warn({ sportId, skipped }, 'writeCoachDecisions skipped rows without game/coach');
  }
  logger.debug({ sportId, written }, 'writeCoachDecisions complete');
  return written;
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
