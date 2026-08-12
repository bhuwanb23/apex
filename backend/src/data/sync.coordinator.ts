// Sync coordinator — orchestrates the full data sync for a sport.
// Order matters: teams before players, games before play-by-play, and the
// writer resolves external ids to real FKs, so a stage can depend on the
// rows the previous stage just wrote. Every stage is error-isolated: one
// failure is logged and the sync continues (partial success).

import { logger } from '../config/logger.js';
import { prisma } from '../db/client.js';
import {
  writeCoachDecisions,
  writeCoaches,
  writeGames,
  writePlayByPlay,
  writePlayerGameLogs,
  writePlayers,
  writeTeams,
  type CoachDecisionRecord,
  type CoachRecord,
  type GameRecord,
  type PlayByPlayRecord,
  type PlayerGameLogRecord,
  type PlayerRecord,
  type TeamRecord,
} from './db.writer.js';
import type { DateRange, FetcherManager } from './fetcher.manager.js';
import { fetcherManager } from './fetcher.manager.js';
import {
  transformGame as transformNbaGame,
  transformPlayer as transformNbaPlayer,
  transformPlayerGameLogs as transformNbaGameLogs,
  transformTeam as transformNbaTeam,
} from './nba/nba.transformer.js';
import type { NBAGame, NBAPlayer, NBAStats, NBATeam } from './nba/nba.types.js';
import {
  transformGame as transformNflGame,
  transformPlays as transformNflPlays,
  transformDecision as transformNflDecision,
  transformTeam as transformNflTeam,
} from './nfl/nfl.transformer.js';
import { extractCoachDecisions } from './nfl/nfl.decisions.js';
import type { EspnEvent, EspnTeam, NflPlay } from './nfl/nfl.types.js';
import {
  transformCoach as transformMlbCoach,
  transformGame as transformMlbGame,
  transformPlayer as transformMlbPlayer,
  transformPlayerGameLogs as transformMlbGameLogs,
  transformPlays as transformMlbPlays,
  transformTeam as transformMlbTeam,
} from './mlb/mlb.transformer.js';
import type {
  MlbCoachRosterEntry,
  MlbGameLogSplit,
  MlbPlay,
  MlbRosterEntry,
  MlbScheduleGame,
  MlbTeam,
} from './mlb/mlb.types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncCounts {
  teams: number;
  coaches: number;
  players: number;
  games: number;
  gameLogs: number;
  playByPlay: number;
  decisions: number;
}

export interface SyncResult {
  sport: string;
  season: string;
  startedAt: Date;
  completedAt: Date;
  durationSeconds: number;
  counts: SyncCounts;
  /** Any errors that occurred — the sync continues past them (partial success). */
  errors: string[];
  status: 'complete' | 'partial' | 'failed';
}

export interface SyncOptions {
  /** Inject a manager (tests swap in mock fetchers) — defaults to the shared one. */
  manager?: FetcherManager;
  /** Cap the per-game play-by-play loop (tests / quick syncs). Undefined = all completed games. */
  maxPlayByPlayGames?: number;
  /** Cap the per-player game-log loop. Undefined = all players. */
  maxGameLogPlayers?: number;
  /** Restrict games to a date range (used by syncRecentGames). */
  dateRange?: DateRange;
}

/** Per-sport transform dispatch. Capability flags avoid error spam for known gaps. */
interface SportSyncAdapter {
  transformTeams(data: unknown): TeamRecord[];
  transformCoaches(data: unknown, teamExternalId?: string | null): CoachRecord[];
  transformPlayers(data: unknown, teamExternalId?: string | null): PlayerRecord[];
  transformGames(data: unknown): GameRecord[];
  transformGameLogs(data: unknown, playerExternalId: string): PlayerGameLogRecord[];
  transformPlays(data: unknown): PlayByPlayRecord[];
  transformDecisions?(data: unknown): CoachDecisionRecord[];
  /** Known gaps (logged once, not counted as sync errors). */
  coachesPending: boolean;
  playersPending: boolean;
  gameLogsPending: boolean;
  playByPlayPending: boolean;
  decisionsPending: boolean;
}

const ADAPTERS: Record<string, SportSyncAdapter> = {
  nba: {
    transformTeams: data => (data as NBATeam[]).map(transformNbaTeam),
    transformCoaches: () => {
      throw new Error('NBA coaches pending a data source');
    },
    transformPlayers: data => (data as NBAPlayer[]).map(transformNbaPlayer),
    transformGames: data => (data as NBAGame[]).map(transformNbaGame),
    transformGameLogs: data => transformNbaGameLogs(data as NBAStats[]),
    transformPlays: () => {
      throw new Error('NBA play-by-play is unavailable on the BallDontLie free tier');
    },
    coachesPending: true,
    playersPending: false,
    gameLogsPending: false,
    playByPlayPending: true,
    decisionsPending: true,
  },
  nfl: {
    transformTeams: data => (data as EspnTeam[]).map(transformNflTeam),
    transformCoaches: () => {
      throw new Error('NFL coaches pending the Python microservice');
    },
    transformPlayers: () => {
      throw new Error('NFL players pending the Python microservice');
    },
    transformGames: data => (data as EspnEvent[]).map(transformNflGame),
    transformGameLogs: () => {
      throw new Error('NFL game logs pending the Python microservice');
    },
    transformPlays: data => transformNflPlays(data as NflPlay[]),
    transformDecisions: data => extractCoachDecisions(data as NflPlay[]).map(transformNflDecision),
    coachesPending: true,
    playersPending: true,
    gameLogsPending: true,
    playByPlayPending: false,
    decisionsPending: false,
  },
  mlb: {
    transformTeams: data => (data as MlbTeam[]).map(transformMlbTeam),
    transformCoaches: (data, teamExternalId) =>
      (data as MlbCoachRosterEntry[])
        .map(coach => transformMlbCoach(coach, teamExternalId))
        .filter((c): c is NonNullable<typeof c> => c != null),
    transformPlayers: (data, teamExternalId) =>
      (data as MlbRosterEntry[]).map(roster => transformMlbPlayer(roster, teamExternalId)),
    transformGames: data => (data as MlbScheduleGame[]).map(transformMlbGame),
    transformGameLogs: (data, playerExternalId) =>
      transformMlbGameLogs(data as MlbGameLogSplit[], playerExternalId),
    transformPlays: data => transformMlbPlays(data as MlbPlay[]),
    coachesPending: false,
    playersPending: false,
    gameLogsPending: false,
    playByPlayPending: false,
    decisionsPending: true,
  },
};

function emptyCounts(): SyncCounts {
  return {
    teams: 0,
    coaches: 0,
    players: 0,
    games: 0,
    gameLogs: 0,
    playByPlay: 0,
    decisions: 0,
  };
}

/** Wraps a stage so a failure logs and never breaks the rest of the sync. */
async function runStage<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ ok: boolean; value?: T; error?: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ stage: name, error: message }, 'Sync stage failed — continuing');
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// syncSport — the main entry point
// ---------------------------------------------------------------------------

export async function syncSport(
  sportAbbreviation: string,
  season?: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const sport = sportAbbreviation.toLowerCase();
  const manager = options.manager ?? fetcherManager;
  const startedAt = new Date();
  const counts = emptyCounts();
  const errors: string[] = [];

  // Resolve the sport row (id + current season) — nothing works without it.
  const sportRow = await prisma.sports.findUnique({
    where: { abbreviation: sport },
  });
  if (!sportRow) {
    logger.error({ sport }, 'Sport not seeded in the Sports table — cannot sync');
    return {
      sport,
      season: season ?? '',
      startedAt,
      completedAt: new Date(),
      durationSeconds: 0,
      counts,
      errors: [`Sport '${sport}' is not seeded in the Sports table`],
      status: 'failed',
    };
  }
  const sportId = sportRow.id;
  const resolvedSeason = season ?? sportRow.season;
  const adapter = ADAPTERS[sport];
  if (!adapter) {
    return {
      sport,
      season: resolvedSeason,
      startedAt,
      completedAt: new Date(),
      durationSeconds: 0,
      counts,
      errors: [`No sync adapter for sport: ${sport}`],
      status: 'failed',
    };
  }

  logger.info({ sport, season: resolvedSeason }, 'Starting full data sync');

  // Stage 1 — teams (must exist before players/games).
  {
    const stage = await runStage('teams', async () => {
      const res = await manager.fetchTeams(sport);
      if (res.cached || res.data == null) return; // cache hit — rows already written
      counts.teams = await writeTeams(adapter.transformTeams(res.data), sportId);
    });
    if (!stage.ok) errors.push(`teams: ${stage.error}`);
  }

  // Stage 2 — coaches (MLB: rosterType=coach per team; other sports have no
  // live coach source yet — logged as a known gap, not a sync error).
  {
    const stage = await runStage('coaches', async () => {
      if (adapter.coachesPending) {
        logger.info({ sport }, 'Coach ingestion not wired for this sport — skipping');
        return;
      }
      const teams = await prisma.teams.findMany({
        where: { sportId },
        select: { externalId: true },
      });
      let written = 0;
      for (const team of teams) {
        const res = await manager.fetchCoaches(sport, team.externalId);
        if (res.cached || res.data == null) continue;
        written += await writeCoaches(adapter.transformCoaches(res.data, team.externalId), sportId);
      }
      counts.coaches = written;
    });
    if (!stage.ok) errors.push(`coaches: ${stage.error}`);
  }

  // Stage 3 — players. NBA fetches the whole league; MLB fetches per-team
  // rosters (the roster payload needs the team id the coordinator knows).
  {
    const stage = await runStage('players', async () => {
      if (adapter.playersPending) return; // known gap — logged above
      if (sport === 'nba') {
        const res = await manager.fetchPlayers(sport);
        if (res.cached || res.data == null) return;
        counts.players = await writePlayers(adapter.transformPlayers(res.data), sportId);
        return;
      }
      // MLB: one roster fetch per team, accumulating players.
      const teams = await prisma.teams.findMany({
        where: { sportId },
        select: { externalId: true },
      });
      let written = 0;
      for (const team of teams) {
        const res = await manager.fetchPlayers(sport, team.externalId);
        if (res.cached || res.data == null) continue;
        written += await writePlayers(adapter.transformPlayers(res.data, team.externalId), sportId);
      }
      counts.players = written;
    });
    if (!stage.ok) errors.push(`players: ${stage.error}`);
  }

  // Stage 4 — games (schedule).
  {
    const stage = await runStage('games', async () => {
      const res = await manager.fetchGames(sport, resolvedSeason, options.dateRange);
      if (res.cached || res.data == null) return;
      counts.games = await writeGames(adapter.transformGames(res.data), sportId);
    });
    if (!stage.ok) errors.push(`games: ${stage.error}`);
  }

  // Stage 5 — per completed game: play-by-play + player game logs.
  {
    const stage = await runStage('playByPlay', async () => {
      if (adapter.playByPlayPending) return; // NBA free tier has no pbp — known gap
      // Respect the sync window (syncRecentGames only touches the last N days).
      const dateFilter = options.dateRange ? { gte: options.dateRange.startDate } : undefined;
      const games = await prisma.games.findMany({
        where: { sportId, status: 'final', ...(dateFilter ? { date: dateFilter } : {}) },
        orderBy: { date: 'desc' },
        ...(options.maxPlayByPlayGames ? { take: options.maxPlayByPlayGames } : {}),
      });
      let written = 0;
      for (const game of games) {
        const res = await manager.fetchPlayByPlay(sport, game.externalId);
        if (res.cached || res.data == null) continue;
        written += await writePlayByPlay(adapter.transformPlays(res.data), game.id);
      }
      counts.playByPlay = written;
    });
    if (!stage.ok) errors.push(`playByPlay: ${stage.error}`);

    const logsStage = await runStage('playerGameLogs', async () => {
      if (adapter.gameLogsPending) return; // NFL logs pending Python — known gap
      const players = await prisma.players.findMany({
        where: { sportId },
        orderBy: { id: 'asc' },
        ...(options.maxGameLogPlayers ? { take: options.maxGameLogPlayers } : {}),
      });
      let written = 0;
      for (const player of players) {
        const res = await manager.fetchPlayerGameLogs(sport, player.externalId, resolvedSeason);
        if (res.cached || res.data == null) continue;
        written += await writePlayerGameLogs(
          adapter.transformGameLogs(res.data, player.externalId)
        );
      }
      counts.gameLogs = written;
    });
    if (!logsStage.ok) errors.push(`playerGameLogs: ${logsStage.error}`);
  }

  // Stage 6 — coach decisions (NFL: extracted from season-scoped play-by-play).
  {
    const stage = await runStage('coachDecisions', async () => {
      if (adapter.decisionsPending) return; // NFL-only stage — known gap
      const res = await manager.fetchSeasonPlays(sport, resolvedSeason);
      if (res.cached || res.data == null) return;
      const records = adapter.transformDecisions!(res.data);
      counts.decisions = await writeCoachDecisions(records);
    });
    if (!stage.ok) errors.push(`coachDecisions: ${stage.error}`);
  }

  // Cache metadata is refreshed inside every manager fetch (updateCacheMetadata),
  // so no separate stage is needed here.

  const completedAt = new Date();
  const durationSeconds = (completedAt.getTime() - startedAt.getTime()) / 1000;
  const totalWritten =
    counts.teams +
    counts.coaches +
    counts.players +
    counts.games +
    counts.gameLogs +
    counts.playByPlay +
    counts.decisions;
  const status: SyncResult['status'] =
    errors.length === 0 ? 'complete' : totalWritten > 0 ? 'partial' : 'failed';

  logger.info(
    { sport, season: resolvedSeason, status, counts, errors: errors.length, durationSeconds },
    'Full sync finished'
  );

  return {
    sport,
    season: resolvedSeason,
    startedAt,
    completedAt,
    durationSeconds,
    counts,
    errors,
    status,
  };
}

// ---------------------------------------------------------------------------
// syncRecentGames — incremental sync for background jobs (runs every ~6h)
// ---------------------------------------------------------------------------

/**
 * Only syncs the last `daysBack` days of games (much faster than a full sync):
 * games for the window get fetched/written, then play-by-play + game logs run
 * for those completed games. Teams/players are assumed already synced.
 */
export async function syncRecentGames(
  sportAbbreviation: string,
  daysBack = 7,
  options: Omit<SyncOptions, 'dateRange'> = {}
): Promise<SyncResult> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - daysBack * 24 * 60 * 60 * 1000);
  logger.info({ sport: sportAbbreviation, daysBack, startDate, endDate }, 'Recent-games sync');
  return syncSport(sportAbbreviation, undefined, {
    ...options,
    dateRange: { startDate, endDate },
  });
}
