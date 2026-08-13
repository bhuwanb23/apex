/**
 * Story module service (Phase 5, Step 9).
 *
 * Cache-first narratives: a StoryLogs row whose expiresAt is still in the
 * future is returned as-is; otherwise the module's real data (injury profile /
 * coach scorecard / momentum analysis) is gathered into a metrics object and
 * sent to Python /story/generate, then stored with a 1 hour expiry.
 *
 * The StoryLogs table stores storyText / keyMetrics / generatedBy but not
 * headlineText or toneLabel — those ride inside the keyMetrics JSON so cached
 * and fresh responses are identical.
 */
import { prisma } from '../db/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../middleware/error.middleware.js';
import {
  MLServiceError,
  MLServiceUnavailableError,
} from '../ml/ml.client.js';
import { storyML } from '../ml/story.ml.js';
import type { SportAbbreviation, UserRole } from '../types/shared.types.js';
import type { StoryViewResponse } from '../types/story.types.js';
import { storyKey as buildStoryKey } from '../utils/cache.keys.js';
import { logger } from '../utils/logger.util.js';
import { buildFallbackMeta } from '../middleware/fallback.handlers.js';
import { getCoachDecisions, getCoachLeaderboard } from './decisions.service.js';
import { getPlayerRisk } from './injury.service.js';
import type { PlayerRiskProfile } from '../types/injury.types.js';
import { getMomentumAnalysis } from './momentum.service.js';

/** Cached stories expire after 1 hour (spec). */
const STORY_TTL_MS = 60 * 60 * 1000;

export type StoryModule = 'injury' | 'decisions' | 'momentum';

/** Internal keys stored alongside the public metrics for cache reads. The
 * underscore prefix mirrors the Python generator's convention — internal
 * keys never cross the API boundary as public metrics. */
interface StoredStoryMeta {
  _entityName?: unknown;
  _headlineText?: unknown;
  _toneLabel?: unknown;
}

/** StoryLogs row → the API view (internal _-prefixed keys stay internal). */
function storyFromRow(row: {
  module: string;
  sport: string;
  role: string;
  entityId: string | null;
  storyText: string;
  keyMetrics: unknown;
  generatedBy: string;
  createdAt: Date;
}): StoryViewResponse {
  const meta = (row.keyMetrics ?? {}) as StoredStoryMeta;
  const raw = (row.keyMetrics ?? {}) as Record<string, unknown>;
  const publicMetrics = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !key.startsWith('_'))
  );
  return {
    module: row.module,
    sport: row.sport as SportAbbreviation,
    role: row.role as UserRole,
    entityId: row.entityId,
    entityName: typeof meta._entityName === 'string' ? meta._entityName : null,
    storyText: row.storyText,
    headlineText: typeof meta._headlineText === 'string' ? meta._headlineText : '',
    toneLabel: typeof meta._toneLabel === 'string' ? meta._toneLabel : 'neutral',
    generatedBy: row.generatedBy,
    keyMetrics: publicMetrics,
    generatedAt: row.createdAt.toISOString(),
  };
}

function parseEntityId(entityId: string | undefined, label: string): number {
  const id = Number(entityId);
  if (entityId === undefined || !Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest(`entityId (${label} id) must be a positive integer`);
  }
  return id;
}

/**
 * Gathers the module's current data into the metrics object the Python
 * generator narrates. Reuses the module services, so the story always speaks
 * to the same numbers the view shows.
 */
async function loadEntityContext(
  module: StoryModule,
  sport: SportAbbreviation,
  entityId: string | undefined,
  season: string | undefined
): Promise<{ entityName: string | null; metrics: Record<string, unknown> }> {
  switch (module) {
    case 'injury': {
      const playerId = parseEntityId(entityId, 'player');
      const profile = await getPlayerRisk(playerId);
      return {
        entityName: profile.playerName,
        metrics: {
          playerName: profile.playerName,
          position: profile.position,
          teamName: profile.teamName,
          riskScore: profile.riskScore,
          zone: profile.zone,
          triggerMetric: profile.triggerMetric,
          minutesZScore: profile.minutesZScore,
          distanceZScore: profile.distanceZScore,
          intensityZScore: profile.intensityZScore,
          backToBackFlag: profile.backToBackFlag,
          baselineMeanMinutes: profile.baselineMeanMinutes,
          baselineStdMinutes: profile.baselineStdMinutes,
          explanation: profile.explanation,
          computedAt: profile.computedAt,
          // The narrative spike metric: how far the recent workload sits above
          // the player's baseline (zScore × std / mean). Null when there is no
          // positive spike — the template omits the sentence then.
          windowDays: 21,
          percentageAbove: computeSpikePercent(profile),
        },
      };
    }
    case 'decisions': {
      const coachId = parseEntityId(entityId, 'coach');
      const drillDown = await getCoachDecisions(coachId, {
        decisionType: 'all',
        page: 1,
        limit: 1,
      });
      const board = await getCoachLeaderboard(sport, {
        decisionType: 'all',
        gameType: 'all',
        page: 1,
        limit: 1,
      });
      const recent = drillDown.decisions[0];
      return {
        entityName: drillDown.coach.coachName,
        metrics: {
          coachName: drillDown.coach.coachName,
          teamName: drillDown.coach.teamName,
          sport,
          season: board.season,
          evRate: drillDown.summary.evRate,
          rank: drillDown.summary.rank,
          totalCoaches: board.meta.total,
          totalDecisions: drillDown.summary.totalDecisions,
          bestGameDate: recent?.gameDateFormatted ?? null,
          bestDecisionDesc: recent?.chosenAction ?? null,
        },
      };
    }
    case 'momentum': {
      const analysis = await getMomentumAnalysis(sport, season);
      return {
        entityName: null,
        metrics: {
          season: analysis.season,
          verdictLabel: analysis.verdict.verdictLabel,
          isSignificant: analysis.verdict.isSignificant,
          hazardCoefficient: analysis.statistics.hazardCoefficient,
          pValue: analysis.statistics.pValue,
          effectSize: analysis.statistics.effectSize,
          hazardRateChange: analysis.statistics.hazardRateChange,
          gamesAnalyzed: analysis.context.gamesAnalyzed,
          playsAnalyzed: analysis.context.playsAnalyzed,
          shortExplanation: analysis.verdict.shortExplanation,
          plainExplanation: analysis.plainExplanation,
        },
      };
    }
    default:
      throw ApiError.badRequest(`Unsupported story module: ${module satisfies never}`);
  }
}

/**
 * Recent-vs-baseline workload spike as a percent (positive only).
 * zScore = (recentMean − baselineMean) / baselineStd, so the recent mean can
 * be recovered and expressed relative to the baseline mean.
 */
function computeSpikePercent(profile: PlayerRiskProfile): number | null {
  const { minutesZScore, baselineMeanMinutes, baselineStdMinutes } = profile;
  if (
    minutesZScore == null ||
    baselineMeanMinutes == null ||
    baselineStdMinutes == null ||
    baselineMeanMinutes <= 0
  ) {
    return null;
  }
  const recentMean = baselineMeanMinutes + minutesZScore * baselineStdMinutes;
  const pct = Math.round(((recentMean - baselineMeanMinutes) / baselineMeanMinutes) * 100);
  return pct > 0 ? pct : null;
}

/** GET /api/story/:module/:sport — cached (1h) or freshly generated narrative. */
export async function getStory(
  module: StoryModule,
  sport: SportAbbreviation,
  role: UserRole,
  entityId?: string,
  season?: string
): Promise<StoryViewResponse> {
  const storyKey = buildStoryKey(module, sport, role, entityId, season);

  const existing = await prisma.storyLogs.findUnique({ where: { storyKey } });
  const isValid = existing != null && existing.expiresAt.getTime() > Date.now();
  if (isValid) {
    return storyFromRow(existing);
  }

  try {
    const { entityName, metrics } = await loadEntityContext(module, sport, entityId, season);
    const response = await storyML.generateStory({
      module,
      sport,
      role,
      entityId: entityId ?? null,
      entityName,
      metrics,
    });

    const keyMetrics = {
      ...response.keyMetrics,
      _entityName: entityName ?? null,
      _headlineText: response.headlineText,
      _toneLabel: response.toneLabel,
    } as unknown as Prisma.InputJsonValue;
    const expiresAt = new Date(Date.now() + STORY_TTL_MS);
    // Upsert (not create): the row for this storyKey may exist from a previous
    // generation that has since expired — a plain create would hit the unique
    // constraint on storyKey and 500.
    await prisma.storyLogs.upsert({
      where: { storyKey },
      update: {
        module,
        sport,
        role,
        entityId: entityId ?? null,
        storyText: response.storyText,
        keyMetrics,
        generatedBy: response.generatedBy,
        expiresAt,
      },
      create: {
        storyKey,
        module,
        sport,
        role,
        entityId: entityId ?? null,
        storyText: response.storyText,
        keyMetrics,
        generatedBy: response.generatedBy,
        expiresAt,
      },
    });

    return {
      module,
      sport,
      role,
      entityId: entityId ?? null,
      entityName: entityName ?? null,
      storyText: response.storyText,
      headlineText: response.headlineText,
      toneLabel: response.toneLabel,
      generatedBy: response.generatedBy,
      keyMetrics: response.keyMetrics,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof MLServiceUnavailableError) {
      logger.warn({ storyKey, error: err.message }, 'Story ML unavailable — serving previous story');
      if (existing) {
        return {
          ...storyFromRow(existing),
          ...buildFallbackMeta(
            existing.createdAt,
            'ML service unavailable — showing the previous story, which may be stale'
          ),
        };
      }
      throw new ApiError(502, 'ML service unavailable and no cached story exists');
    }
    if (err instanceof MLServiceError) {
      logger.error({ storyKey, err }, 'Story generation failed');
      throw new ApiError(502, `ML service error: ${err.message}`);
    }
    throw err;
  }
}
