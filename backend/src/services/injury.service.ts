/**
 * Injury module service (Phase 5, Step 5).
 *
 * Cache-first risk profiles:
 *   fresh DB score (isLatest + < 6h old)  → return immediately
 *   stale/missing (or recalculate=true)   → send the last 35 days of game logs
 *                                            to the Python injury model, store
 *                                            the new score, return it
 *   ML unreachable                        → serve the last known score with a
 *                                            staleness warning (never 500 on a
 *                                            degraded ML service)
 */
import { logger } from '../utils/logger.util.js';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { ApiError } from '../middleware/error.middleware.js';
import { buildFallbackMeta } from '../middleware/fallback.handlers.js';
import { MLServiceError, MLServiceUnavailableError } from '../ml/ml.client.js';
import { injuryML, type InjuryGameLogInput, type InjuryRiskScore } from '../ml/injury.ml.js';
import { getSport } from './shared.service.js';
import type {
  AlertZone,
  GameLogSummary,
  PlayerRiskProfile,
  PlayerRiskResponse,
  RiskAlert,
  RiskHistoryEntry,
  RiskZone,
  TeamRiskSummary,
} from '../types/injury.types.js';
import type { SportAbbreviation } from '../types/shared.types.js';

/** A score is "fresh" for 6 hours (CACHE_TTL_SHORT). */
const RISK_TTL_MS = env.CACHE_TTL_SHORT * 1000;
/** Logs needed for the model's non-overlapping windows: baseline(21) + window(7) + slack. */
const ANALYSIS_LOOKBACK_DAYS = 35;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Player context + profile builders
// ---------------------------------------------------------------------------

/** The player fields every profile needs — derived from DB rows or joins. */
interface PlayerCtx {
  externalId: string;
  name: string;
  teamId: number;
  teamName: string;
  sportName: string;
  position?: string | null;
}

async function getPlayerContext(playerId: number): Promise<PlayerCtx> {
  const player = await prisma.players.findUnique({
    where: { id: playerId },
    include: {
      team: { select: { id: true, name: true } },
      sport: { select: { name: true } },
    },
  });
  if (!player) throw ApiError.notFound(`Player ${playerId} not found`);
  return {
    externalId: player.externalId,
    name: player.name,
    teamId: player.teamId,
    teamName: player.team.name,
    sportName: player.sport.name,
    position: player.position,
  };
}

/** DB InjuryRiskScores row → PlayerRiskProfile. */
function profileFromRow(player: PlayerCtx, row: DbRiskRow): PlayerRiskProfile {
  return {
    playerId: player.externalId,
    playerName: player.name,
    teamId: player.teamId,
    teamName: player.teamName,
    position: player.position,
    sport: player.sportName as SportAbbreviation,
    riskScore: row.riskScore,
    zone: row.zone as RiskZone,
    triggerMetric: row.triggerMetric,
    minutesZScore: row.minutesZScore,
    distanceZScore: row.distanceZScore,
    intensityZScore: row.intensityZScore,
    backToBackFlag: row.backToBackFlag,
    baselineMeanMinutes: row.baselineMeanMinutes,
    baselineStdMinutes: row.baselineStdMinutes,
    explanation: row.explanation,
    windowStart: row.windowStart.toISOString(),
    windowEnd: row.windowEnd.toISOString(),
    computedAt: row.computedAt.toISOString(),
  };
}

/** Python InjuryRiskScore → PlayerRiskProfile. */
function profileFromScore(player: PlayerCtx, score: InjuryRiskScore): PlayerRiskProfile {
  return {
    playerId: score.playerId,
    playerName: player.name,
    teamId: player.teamId,
    teamName: player.teamName,
    position: player.position,
    sport: player.sportName as SportAbbreviation,
    riskScore: score.riskScore,
    zone: (score.zone as RiskZone) ?? 'insufficient_data',
    triggerMetric: score.triggerMetric,
    minutesZScore: score.minutesZScore,
    distanceZScore: score.distanceZScore,
    intensityZScore: score.intensityZScore,
    backToBackFlag: score.backToBackFlag,
    baselineMeanMinutes: score.baselineMeanMinutes,
    baselineStdMinutes: score.baselineStdMinutes,
    explanation: score.explanation,
    windowStart: score.windowStart,
    windowEnd: score.windowEnd,
    dataPointsUsed: score.dataPointsUsed,
    computedAt: score.computedAt,
  };
}

/** Minimal profile for a player with no usable score (no logs / no data). */
function noScoreProfile(
  player: PlayerCtx,
  explanation: string,
  computedAt: string
): PlayerRiskProfile {
  return {
    playerId: player.externalId,
    playerName: player.name,
    teamId: player.teamId,
    teamName: player.teamName,
    position: player.position,
    sport: player.sportName as SportAbbreviation,
    riskScore: null,
    zone: 'insufficient_data',
    triggerMetric: null,
    minutesZScore: null,
    distanceZScore: null,
    intensityZScore: null,
    backToBackFlag: false,
    baselineMeanMinutes: null,
    baselineStdMinutes: null,
    explanation,
    windowStart: null,
    windowEnd: null,
    computedAt,
  };
}

/** Shape of an InjuryRiskScores row as read by this service. */
interface DbRiskRow {
  riskScore: number;
  zone: string;
  triggerMetric: string | null;
  minutesZScore: number | null;
  distanceZScore: number | null;
  intensityZScore: number | null;
  backToBackFlag: boolean;
  baselineMeanMinutes: number | null;
  baselineStdMinutes: number | null;
  explanation: string;
  windowStart: Date;
  windowEnd: Date;
  computedAt: Date;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function toGameLogInput(log: {
  date: Date;
  minutesPlayed: number | null;
  distanceCovered: number | null;
  highIntensityEvents: number | null;
  backToBack: boolean;
  daysRestBefore: number | null;
}): InjuryGameLogInput {
  return {
    date: log.date.toISOString().slice(0, 10),
    minutesPlayed: log.minutesPlayed,
    distanceCovered: log.distanceCovered,
    highIntensityEvents: log.highIntensityEvents,
    backToBack: log.backToBack,
    daysRestBefore: log.daysRestBefore,
  };
}

async function loadGameLogSummary(playerId: number): Promise<GameLogSummary> {
  const [games7, games21, avg] = await prisma.$transaction([
    prisma.playerGameLogs.count({
      where: { playerId, date: { gte: new Date(Date.now() - 7 * DAY_MS) } },
    }),
    prisma.playerGameLogs.count({
      where: { playerId, date: { gte: new Date(Date.now() - 21 * DAY_MS) } },
    }),
    prisma.playerGameLogs.aggregate({
      where: { playerId, date: { gte: new Date(Date.now() - 21 * DAY_MS) } },
      _avg: { minutesPlayed: true },
    }),
  ]);
  return {
    gamesLast7Days: games7,
    gamesLast21Days: games21,
    avgMinutesLast21Days: avg._avg.minutesPlayed,
  };
}

async function loadHistory(
  playerId: number,
  days: number,
  limit?: number
): Promise<RiskHistoryEntry[]> {
  const rows = await prisma.injuryRiskScores.findMany({
    where: { playerId, computedAt: { gte: new Date(Date.now() - days * DAY_MS) } },
    orderBy: { computedAt: 'asc' },
    select: { computedAt: true, riskScore: true, zone: true, triggerMetric: true },
  });
  const entries = rows.map(r => ({
    computedAt: r.computedAt.toISOString(),
    riskScore: r.riskScore,
    zone: r.zone,
    triggerMetric: r.triggerMetric,
  }));
  // Trend charts want the most recent N, still drawn oldest→newest.
  return limit !== undefined ? entries.slice(-limit) : entries;
}

/**
 * Persists a new score atomically: first de-lists the previous latest row,
 * then inserts the new one as isLatest. Exactly one latest per player.
 */
async function saveRiskScore(
  playerId: number,
  score: InjuryRiskScore
): Promise<{ computedAt: Date }> {
  // Order matters: de-list the old latest first, then insert the new one.
  const [, created] = await prisma.$transaction([
    prisma.injuryRiskScores.updateMany({
      where: { playerId, isLatest: true },
      data: { isLatest: false },
    }),
    prisma.injuryRiskScores.create({
      data: {
        playerId,
        computedAt: new Date(score.computedAt),
        windowStart: score.windowStart ? new Date(score.windowStart) : new Date(),
        windowEnd: score.windowEnd ? new Date(score.windowEnd) : new Date(),
        riskScore: score.riskScore!,
        zone: score.zone,
        minutesZScore: score.minutesZScore,
        distanceZScore: score.distanceZScore,
        intensityZScore: score.intensityZScore,
        backToBackFlag: score.backToBackFlag,
        triggerMetric: score.triggerMetric,
        baselineMeanMinutes: score.baselineMeanMinutes,
        baselineStdMinutes: score.baselineStdMinutes,
        explanation: score.explanation,
        isLatest: true,
      },
    }),
  ]);
  return { computedAt: created.computedAt };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** GET /api/injury/player/:playerId — full risk profile + context + trend. */
export async function getPlayerRisk(
  playerId: number,
  forceRecalculate = false
): Promise<PlayerRiskResponse> {
  const player = await getPlayerContext(playerId);
  const latest = await prisma.injuryRiskScores.findFirst({
    where: { playerId, isLatest: true },
    orderBy: { computedAt: 'desc' },
  });

  const isFresh = latest != null && Date.now() - latest.computedAt.getTime() <= RISK_TTL_MS;

  if (isFresh && !forceRecalculate) {
    return {
      ...profileFromRow(player, latest),
      gameLogSummary: await loadGameLogSummary(playerId),
      history: await loadHistory(playerId, 60, 10),
    };
  }

  try {
    const logs = await prisma.playerGameLogs.findMany({
      where: { playerId, date: { gte: new Date(Date.now() - ANALYSIS_LOOKBACK_DAYS * DAY_MS) } },
      orderBy: { date: 'desc' },
    });

    if (logs.length === 0) {
      return {
        ...noScoreProfile(
          player,
          'No game log data available — risk cannot be computed.',
          new Date().toISOString()
        ),
        gameLogSummary: { gamesLast7Days: 0, gamesLast21Days: 0, avgMinutesLast21Days: null },
        history: await loadHistory(playerId, 60, 10),
      };
    }

    const score = await injuryML.computePlayerRisk({
      playerId: player.externalId,
      playerName: player.name,
      sport: player.sportName,
      gameLogs: logs.map(toGameLogInput),
    });

    if (score.riskScore != null && score.zone !== 'insufficient_data') {
      await saveRiskScore(playerId, score);
    }

    return {
      ...profileFromScore(player, score),
      gameLogSummary: await loadGameLogSummary(playerId),
      history: await loadHistory(playerId, 60, 10),
    };
  } catch (err) {
    if (err instanceof MLServiceUnavailableError) {
      logger.warn({ playerId, error: err.message }, 'Injury ML unavailable — serving stale score');
      if (latest) {
        return {
          ...profileFromRow(player, latest),
          gameLogSummary: await loadGameLogSummary(playerId),
          history: await loadHistory(playerId, 60, 10),
          ...buildFallbackMeta(
            latest.computedAt,
            'ML service unavailable — showing last computed score, which may be stale'
          ),
        };
      }
      return {
        ...noScoreProfile(
          player,
          'ML service unavailable and no cached score exists.',
          new Date().toISOString()
        ),
        gameLogSummary: { gamesLast7Days: 0, gamesLast21Days: 0, avgMinutesLast21Days: null },
        history: await loadHistory(playerId, 60, 10),
        ...buildFallbackMeta(null, 'ML service unavailable — no cached score available'),
      };
    }
    if (err instanceof MLServiceError) {
      logger.error({ playerId, err }, 'Injury ML computation failed');
      throw new ApiError(502, `ML service error: ${err.message}`);
    }
    throw err;
  }
}

/** GET /api/injury/team/:teamId — roster-wide risk summary. */
export async function getTeamRisk(teamId: number): Promise<TeamRiskSummary> {
  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    include: { sport: { select: { name: true } } },
  });
  if (!team) throw ApiError.notFound(`Team ${teamId} not found`);

  const players = await prisma.players.findMany({
    where: { teamId, isActive: true },
    select: { id: true, name: true, position: true, externalId: true },
    orderBy: { lastName: 'asc' },
  });
  const playerIds = players.map(p => p.id);

  // One batched query for every player's latest score (no N+1).
  const scores =
    playerIds.length > 0
      ? await prisma.injuryRiskScores.findMany({
          where: { playerId: { in: playerIds }, isLatest: true },
        })
      : [];
  const scoreByPlayer = new Map(scores.map(s => [s.playerId, s]));

  const ctx: PlayerCtx = {
    externalId: '',
    name: '',
    teamId,
    teamName: team.name,
    sportName: team.sport.name,
  };

  const profiles: PlayerRiskProfile[] = players.map(p => {
    const row = scoreByPlayer.get(p.id);
    const playerCtx = { ...ctx, externalId: p.externalId, name: p.name, position: p.position };
    if (!row) {
      return noScoreProfile(playerCtx, 'No risk score computed yet.', new Date(0).toISOString());
    }
    return profileFromRow(playerCtx, row);
  });

  // Highest risk first; players without a score sink to the bottom.
  profiles.sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1));

  return {
    teamId,
    teamName: team.name,
    sport: team.sport.name as SportAbbreviation,
    summary: {
      redCount: scores.filter(s => s.zone === 'red').length,
      yellowCount: scores.filter(s => s.zone === 'yellow').length,
      greenCount: scores.filter(s => s.zone === 'green').length,
    },
    players: profiles,
    lastUpdated:
      scores.length > 0
        ? new Date(Math.max(...scores.map(s => s.computedAt.getTime()))).toISOString()
        : new Date().toISOString(),
  };
}

/** GET /api/injury/alerts/:sport — league-wide players in a zone. */
export async function getLeagueAlerts(
  sport: SportAbbreviation,
  zone: AlertZone,
  limit: number
): Promise<{
  sport: SportAbbreviation;
  zone: AlertZone;
  alerts: RiskAlert[];
  totalAlerts: number;
  generatedAt: string;
}> {
  const sportRow = await getSport(sport);
  const where = { zone, isLatest: true, player: { sportId: sportRow.id } };

  const [rows, total] = await prisma.$transaction([
    prisma.injuryRiskScores.findMany({
      where,
      include: {
        player: {
          select: {
            name: true,
            position: true,
            externalId: true,
            team: { select: { name: true } },
          },
        },
      },
      orderBy: { riskScore: 'desc' },
      take: limit,
    }),
    prisma.injuryRiskScores.count({ where }),
  ]);

  return {
    sport,
    zone,
    alerts: rows.map(a => ({
      playerId: a.player.externalId,
      playerName: a.player.name,
      teamName: a.player.team.name,
      position: a.player.position,
      riskScore: a.riskScore,
      zone: a.zone as AlertZone,
      triggerMetric: a.triggerMetric,
      explanation: a.explanation,
    })),
    totalAlerts: total,
    generatedAt: new Date().toISOString(),
  };
}

/** GET /api/injury/player/:playerId/history — risk trend for the chart. */
export async function getPlayerRiskHistory(
  playerId: number,
  days: number
): Promise<{ playerId: string; playerName: string; history: RiskHistoryEntry[] }> {
  const player = await getPlayerContext(playerId);
  return {
    playerId: player.externalId,
    playerName: player.name,
    history: await loadHistory(playerId, days),
  };
}
