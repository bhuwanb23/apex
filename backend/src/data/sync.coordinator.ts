// Sync coordinator — orchestrates the full data sync for a sport.
// Order matters: teams before players, games before play-by-play, and the
// writer resolves external ids to real FKs, so a stage can depend on the
// rows the previous stage just wrote. Every stage is error-isolated: one
// failure is logged and the sync continues (partial success).

import { logger } from '../config/logger.js';
import { prisma } from '../db/client.js';
import { invalidateSportCache } from '../services/cache.invalidation.js';
import { logSyncComplete, logSyncSection, logSyncStart } from './fetch.logger.js';
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
  isActiveNbaTeam,
  transformGame as transformNbaGame,
  transformPlayer as transformNbaPlayer,
  transformPlayerGameLogs as transformNbaGameLogs,
  transformPlays as transformNbaPlays,
  transformTeam as transformNbaTeam,
} from './nba/nba.transformer.js';
import type { NBAGame, NBAPlayer, NBAStats, NBATeam, NbaPlay } from './nba/nba.types.js';
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
  /** True when the sport was skipped (seeded but no sync adapter — e.g. NHL). */
  skipped?: boolean;
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
  /** Who triggered the sync (scheduler / manual) — appears in the Step 9.4 log. */
  triggeredBy?: string;
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
    // BallDontLie /teams also returns historical teams (blank conference,
    // duplicate abbreviations) — only active NBA teams have a real conference.
    transformTeams: data =>
      (data as NBATeam[]).filter(isActiveNbaTeam).map(transformNbaTeam),
    transformCoaches: () => {
      throw new Error('NBA coaches pending a data source');
    },
    transformPlayers: data => (data as NBAPlayer[]).map(transformNbaPlayer),
    transformGames: data => (data as NBAGame[]).map(transformNbaGame),
    transformGameLogs: data => transformNbaGameLogs(data as NBAStats[]),
    // Play-by-play comes from the ESPN NBA summary API (the NBA fetcher
    // resolves BallDontLie game ids to ESPN event ids internally).
    transformPlays: data => transformNbaPlays(data as NbaPlay[]),
    coachesPending: true,
    playersPending: false,
    gameLogsPending: false,
    playByPlayPending: false,
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
): Promise<{ ok: boolean; value?: T; error?: string; durationMs: number }> {
  const started = Date.now();
  try {
    return { ok: true, value: await fn(), durationMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ stage: name, error: message }, 'Sync stage failed — continuing');
    return { ok: false, error: message, durationMs: Date.now() - started };
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
    // Seeded-but-unsupported sports (e.g. NHL with no data source yet) are a
    // known gap, not an error — skipping keeps the all-sports scheduler run
    // green while the sport still shows up in the momentum comparison panel.
    return {
      sport,
      season: resolvedSeason,
      startedAt,
      completedAt: new Date(),
      durationSeconds: 0,
      counts,
      errors: [`No sync adapter for sport: ${sport} — skipped (known gap)`],
      status: 'complete',
      skipped: true,
    };
  }

  // Step 9.4a — sync start.
  logSyncStart({
    sport,
    sections: [
      'teams',
      'coaches',
      'players',
      'games',
      'playByPlay',
      'playerGameLogs',
      'coachDecisions',
    ],
    triggeredBy: options.triggeredBy ?? 'scheduler',
  });

  // Stage 1 — teams (must exist before players/games).
  {
    const stage = await runStage('teams', async () => {
      const res = await manager.fetchTeams(sport);
      if (res.cached || res.data == null) return; // cache hit — rows already written
      counts.teams = await writeTeams(adapter.transformTeams(res.data), sportId);
    });
    if (!stage.ok) errors.push(`teams: ${stage.error}`);
    logSyncSection({
      section: 'teams',
      recordCount: counts.teams,
      durationMs: stage.durationMs,
      upsertCount: counts.teams,
      skipCount: 0,
    });
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
    logSyncSection({
      section: 'coaches',
      recordCount: counts.coaches,
      durationMs: stage.durationMs,
      upsertCount: counts.coaches,
      skipCount: 0,
    });
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
    logSyncSection({
      section: 'players',
      recordCount: counts.players,
      durationMs: stage.durationMs,
      upsertCount: counts.players,
      skipCount: 0,
    });
  }

  // Stage 4 — games (schedule).
  {
    const stage = await runStage('games', async () => {
      const res = await manager.fetchGames(sport, resolvedSeason, options.dateRange);
      if (res.cached || res.data == null) return;
      counts.games = await writeGames(adapter.transformGames(res.data), sportId);
    });
    if (!stage.ok) errors.push(`games: ${stage.error}`);
    logSyncSection({
      section: 'games',
      recordCount: counts.games,
      durationMs: stage.durationMs,
      upsertCount: counts.games,
      skipCount: 0,
    });
  }

  // Self-heal the Sports row's current season: the seed (e.g. NBA
  // "2024-25") goes stale as real games carry newer seasons ("2026-27"), and
  // every downstream season filter (momentum analysis, leaderboards) reads
  // this column — a stale value silently returns nothing. Align it with the
  // newest season actually present in the games table after each sync.
  {
    const newest = await prisma.games.findFirst({
      where: { sportId },
      orderBy: { season: 'desc' },
      select: { season: true },
    });
    if (newest && newest.season && newest.season !== sportRow.season) {
      await prisma.sports.update({
        where: { id: sportId },
        data: { season: newest.season },
      });
      logger.info(
        { sport, from: sportRow.season, to: newest.season },
        'Sports row season advanced to newest synced games'
      );
    }
  }

  // Stage 5 — per completed game: play-by-play + player game logs.
  {
    const stage = await runStage('playByPlay', async () => {
      if (adapter.playByPlayPending) return; // known gap (none today — NBA uses ESPN pbp)
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
    logSyncSection({
      section: 'playByPlay',
      recordCount: counts.playByPlay,
      durationMs: stage.durationMs,
      upsertCount: counts.playByPlay,
      skipCount: 0,
    });

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
    logSyncSection({
      section: 'playerGameLogs',
      recordCount: counts.gameLogs,
      durationMs: logsStage.durationMs,
      upsertCount: counts.gameLogs,
      skipCount: 0,
    });
  }

  // Stage 6 — coach decisions (NFL only). Per the spec these are extracted
  // FROM THE PLAY-BY-PLAY DATA — the raw NflPlay payload is preserved in
  // PlayByPlay.rawEvent (see transformPlays), so decisions are derived from
  // the rows Stage 5 just wrote. This is fully offline: no dependency on the
  // Python nfl_data_py feed (which 503s when nfl_data_py isn't installed).
  {
    const stage = await runStage('coachDecisions', async () => {
      if (adapter.decisionsPending) return; // NFL-only stage — known gap
      // Same game window Stage 5 used, so decisions cover the same games.
      const dateFilter = options.dateRange ? { gte: options.dateRange.startDate } : undefined;
      const games = await prisma.games.findMany({
        where: { sportId, status: 'final', ...(dateFilter ? { date: dateFilter } : {}) },
        select: { id: true },
      });
      if (games.length === 0) return;
      const rows = await prisma.playByPlay.findMany({
        where: { gameId: { in: games.map(g => g.id) } },
        orderBy: [{ gameId: 'asc' }, { eventNumber: 'asc' }],
      });
      if (rows.length === 0) return;
      // Reconstruct NflPlay[] from the preserved raw payloads.
      const plays = rows
        .filter(
          r => r.rawEvent != null && typeof r.rawEvent === 'object' && !Array.isArray(r.rawEvent)
        )
        .map(r => r.rawEvent as unknown as NflPlay);
      const records = adapter.transformDecisions!(plays);
      counts.decisions = await writeCoachDecisions(records);
    });
    if (!stage.ok) errors.push(`coachDecisions: ${stage.error}`);
    logSyncSection({
      section: 'coachDecisions',
      recordCount: counts.decisions,
      durationMs: stage.durationMs,
      upsertCount: counts.decisions,
      skipCount: 0,
    });
  }

  // Cache metadata is refreshed inside every manager fetch (updateCacheMetadata),
  // so no separate stage is needed here.

  // A partial/failed sync must not leave the fetch-layer cache marked fresh:
  // updateCacheMetadata runs on FETCH success, before the DB write — if the
  // write then fails (e.g. unique-constraint collision), the cache would tell
  // the next sync to skip the stage forever. Invalidate so the next run
  // re-fetches and retries the failed stages (the data_sync job also
  // invalidates after a run, but direct syncSport callers rely on this).
  if (errors.length > 0) {
    await invalidateSportCache(sport);
  }

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

  // Step 9.4c — sync completion.
  logSyncComplete({
    sport,
    totalDurationMs: Math.round(durationSeconds * 1000),
    recordsProcessed: totalWritten,
    errors: errors.length,
    nextSyncAt: null,
    status,
  });

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
