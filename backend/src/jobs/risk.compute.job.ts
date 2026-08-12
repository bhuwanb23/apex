/**
 * Risk compute job (Phase 6, Step 6 — 6.2).
 *
 * Recomputes injury risk scores for every active player, one sport at a
 * time. Per the spec:
 *   - batches of 25 players: one DB query loads all 25 players' game logs,
 *     one Python call (`/injury/compute-risk/batch`) evaluates all 25
 *   - logs older than 35 days are excluded (baseline 21 + window 7 + slack,
 *     matching the injury service); players with < 3 logs are skipped
 *   - each score is written transactionally (old isLatest → false, insert
 *     new isLatest) so a player never has two latest rows
 *   - 200ms pacing between batches so Python isn't overwhelmed
 *   - red-zone transitions (green/yellow → red) and recoveries (red → not)
 *     are logged prominently — the MVP signal for future notifications
 *   - ML down → abort remaining players (old scores stay, job fails);
 *     a failed DB batch is retried once
 */
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MLServiceUnavailableError } from '../ml/ml.client.js';
import {
  injuryML,
  type InjuryGameLogInput,
  type InjuryRiskInput,
  type InjuryRiskScore,
} from '../ml/injury.ml.js';
import { logger } from '../utils/logger.util.js';
import type { JobDefinition } from './job.runner.js';
import { queueManager } from './queue.manager.js';

/** Players per Python batch call. */
const BATCH_SIZE = 25;
/** Pause between batches (spec: don't overwhelm Python). */
const BATCH_DELAY_MS = 200;
/** Game logs lookback (baseline + window + slack — same as the service). */
const LOOKBACK_DAYS = 35;
/** Spec: skip players with fewer than 3 games. */
const MIN_GAMES = 3;
/** Cap on per-run error strings — an ML outage must not bloat the JobLogs row. */
const MAX_ERRORS = 50;
const DAY_MS = 86_400_000;

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/** Game logs for the batch, grouped by player (most recent first). */
async function loadBatchLogs(
  playerIds: number[],
  lookback: Date
): Promise<Map<number, InjuryGameLogInput[]>> {
  const rows = await prisma.playerGameLogs.findMany({
    where: { playerId: { in: playerIds }, date: { gte: lookback } },
    orderBy: { date: 'desc' },
    select: {
      playerId: true,
      date: true,
      minutesPlayed: true,
      distanceCovered: true,
      highIntensityEvents: true,
      backToBack: true,
      daysRestBefore: true,
    },
  });
  const byPlayer = new Map<number, InjuryGameLogInput[]>();
  for (const row of rows) {
    const list = byPlayer.get(row.playerId) ?? [];
    list.push({
      date: row.date.toISOString().slice(0, 10),
      minutesPlayed: row.minutesPlayed,
      distanceCovered: row.distanceCovered,
      highIntensityEvents: row.highIntensityEvents,
      backToBack: row.backToBack,
      daysRestBefore: row.daysRestBefore,
    });
    byPlayer.set(row.playerId, list);
  }
  return byPlayer;
}

interface SaveResult {
  written: number;
  /** Eligible players whose write failed after the one retry (spec 6.6). */
  failed: number;
}

/**
 * Writes a batch of scores: every eligible player's old latest is de-listed
 * and the new score inserted in ONE transaction — a player can never have
 * two isLatest rows, and SQLite gets 2 ops instead of ~50. Retries the whole
 * batch once on failure (spec 6.6), then logs and continues — a failing
 * batch never aborts the rest of the players in it.
 */
async function saveBatchScores(
  scores: InjuryRiskScore[],
  playerByExternal: Map<string, number>
): Promise<SaveResult> {
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  let eligible = 0;

  for (const score of scores) {
    const playerId = playerByExternal.get(score.playerId);
    if (playerId === undefined || score.riskScore == null || score.zone === 'insufficient_data') {
      continue;
    }
    eligible += 1;
    const computedAt = new Date(score.computedAt);
    ops.push(
      prisma.injuryRiskScores.updateMany({
        where: { playerId, isLatest: true },
        data: { isLatest: false },
      }),
      prisma.injuryRiskScores.create({
        data: {
          playerId,
          computedAt,
          windowStart: score.windowStart ? new Date(score.windowStart) : computedAt,
          windowEnd: score.windowEnd ? new Date(score.windowEnd) : computedAt,
          riskScore: score.riskScore,
          zone: score.zone,
          triggerMetric: score.triggerMetric,
          minutesZScore: score.minutesZScore,
          distanceZScore: score.distanceZScore,
          intensityZScore: score.intensityZScore,
          backToBackFlag: score.backToBackFlag,
          baselineMeanMinutes: score.baselineMeanMinutes,
          baselineStdMinutes: score.baselineStdMinutes,
          explanation: score.explanation,
          isLatest: true,
        },
      })
    );
  }

  if (ops.length === 0) return { written: 0, failed: 0 };

  try {
    await prisma.$transaction(ops);
    return { written: eligible, failed: 0 };
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'risk_compute: batch write failed — retrying once'
    );
    try {
      await prisma.$transaction(ops);
      return { written: eligible, failed: 0 };
    } catch {
      return { written: 0, failed: eligible };
    }
  }
}

const riskComputeJob: JobDefinition = {
  name: 'risk_compute',
  schedule: env.JOB_CRON_RISK_COMPUTE, // every 6h — 1:00/7:00/13:00/19:00
  description: 'Recomputes injury risk scores for every active player (25-player batches)',
  run: async () => {
    const sports = await prisma.sports.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const errors: string[] = [];
    const perSport: Record<string, unknown> = {};
    const newRedZonePlayers: string[] = [];
    const leftRedZonePlayers: string[] = [];
    const riskScores: number[] = [];
    let recordsProcessed = 0;
    let mlDown = false;

    const pushError = (message: string): void => {
      if (errors.length < MAX_ERRORS) errors.push(message);
    };

    for (const sport of sports) {
      if (mlDown) {
        pushError(`${sport.name}: skipped — ML service unavailable (scores unchanged)`);
        continue;
      }

      const players = await prisma.players.findMany({
        where: { sportId: sport.id, isActive: true },
        select: { id: true, externalId: true, name: true },
        orderBy: { id: 'asc' },
      });
      if (players.length === 0) {
        perSport[sport.name] = { players: 0, note: 'no players synced' };
        continue;
      }

      const playerByExternal = new Map(players.map(p => [p.externalId, p.id]));
      const lookback = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
      let scored = 0;
      let insufficient = 0;
      let skippedFewGames = 0;
      const sportNewRed: string[] = [];
      const sportLeftRed: string[] = [];

      for (let i = 0; i < players.length; i += BATCH_SIZE) {
        const batch = players.slice(i, i + BATCH_SIZE);
        try {
          const logsByPlayer = await loadBatchLogs(
            batch.map(p => p.id),
            lookback
          );
          const inputs: InjuryRiskInput[] = [];
          for (const player of batch) {
            const logs = logsByPlayer.get(player.id) ?? [];
            if (logs.length < MIN_GAMES) {
              skippedFewGames += 1;
              continue; // spec: skip players with too little data
            }
            inputs.push({
              playerId: player.externalId,
              playerName: player.name,
              sport: sport.name,
              gameLogs: logs,
            });
          }
          if (inputs.length === 0) continue;

          // Previous zones, captured BEFORE the batch so red-zone transitions
          // can be detected against the pre-run state.
          const prev = await prisma.injuryRiskScores.findMany({
            where: { playerId: { in: batch.map(p => p.id) }, isLatest: true },
            select: { playerId: true, zone: true },
          });
          const prevZone = new Map(prev.map(p => [p.playerId, p.zone]));

          const results = await injuryML.computePlayerRiskBatch(inputs);

          // One transaction for the whole batch, retried once per spec 6.6.
          const save = await saveBatchScores(results, playerByExternal);
          if (save.failed > 0) {
            pushError(
              `${sport.name}: batch write failed for ${save.failed} players after retry — continuing`
            );
          }

          for (const result of results) {
            recordsProcessed += 1;
            if (result.riskScore != null && result.zone !== 'insufficient_data') {
              scored += 1;
              riskScores.push(result.riskScore);
            } else {
              insufficient += 1;
            }
            const playerId = playerByExternal.get(result.playerId);
            const old = playerId !== undefined ? prevZone.get(playerId) : undefined;
            if (result.zone === 'red' && old !== undefined && old !== 'red') {
              sportNewRed.push(result.playerId);
            }
            if (old === 'red' && result.zone !== 'red') {
              sportLeftRed.push(result.playerId);
            }
          }
        } catch (err) {
          if (err instanceof MLServiceUnavailableError) {
            mlDown = true; // top-of-loop guard skips remaining sports
            pushError(
              `${sport.name}: ML service unavailable — risk computation skipped (old scores kept)`
            );
            break; // abort the rest of this sport
          }
          pushError(
            `${sport.name}: batch failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        await sleep(BATCH_DELAY_MS); // pacing (spec 6.2) — even after a failed batch
      }

      newRedZonePlayers.push(...sportNewRed);
      leftRedZonePlayers.push(...sportLeftRed);
      perSport[sport.name] = {
        players: players.length,
        scored,
        insufficient,
        skippedFewGames,
        newRedZonePlayers: sportNewRed,
        leftRedZonePlayers: sportLeftRed,
      };
      logger.info(
        { sport: sport.name, players: players.length, scored, insufficient, skippedFewGames },
        'risk_compute: sport pass complete'
      );
      if (sportNewRed.length > 0) {
        logger.warn({ sport: sport.name, players: sportNewRed }, 'NEW RED ZONE PLAYERS');
      }
      if (sportLeftRed.length > 0) {
        logger.info({ sport: sport.name, players: sportLeftRed }, 'PLAYERS LEFT RED ZONE (recovery)');
      }
    }

    const averageRiskScore =
      riskScores.length > 0
        ? Math.round((riskScores.reduce((a, b) => a + b, 0) / riskScores.length) * 100) / 100
        : null;

    return {
      status: errors.length === 0 ? 'completed' : mlDown ? 'failed' : 'partial',
      recordsProcessed,
      errors,
      summary: {
        playersProcessed: recordsProcessed,
        newRedZonePlayers,
        leftRedZonePlayers,
        averageRiskScore,
        errorsCount: errors.length,
        perSport,
      },
    };
  },
};

queueManager.register(riskComputeJob);
