/**
 * Momentum module service (Phase 5, Step 7).
 *
 * Cox-model analytics for Module 3:
 *   analysis   → MomentumAnalysis row fresh within 24h, else compute from
 *                PlayByPlay via Python /momentum/compute-season and store
 *   game       → MomentumGameData row, else compute via /momentum/compute-game
 *   comparison → per-sport analysis summaries, missing sports computed in the
 *                background, sorted by effect size
 *   timeout    → precomputed TimeoutRecommendations row keyed on the Python
 *                scenario hash, else a live /timeout/recommend call
 *
 * The Python scenario key is a sha1 hash — replicated here so Node can look up
 * rows the precompute job wrote (Python timeout_model.scenario_key).
 */
import { createHash } from 'node:crypto';
import { CACHE_TTL } from '../cache/memoryCache.js';
import { prisma } from '../db/client.js';
import { ApiError } from '../middleware/error.middleware.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MLServiceError, MLServiceUnavailableError } from '../ml/ml.client.js';
import {
  momentumML,
  type GameMomentumResult,
  type MomentumPlayInput,
  type SeasonMomentumResult,
} from '../ml/momentum.ml.js';
import type {
  GameMomentumResponse,
  MomentumAnalysisResponse,
  SportComparison,
  SportMomentumSummary,
  TimeoutRecommendationResponse,
} from '../types/momentum.types.js';
import type { SportAbbreviation } from '../types/shared.types.js';
import { logger } from '../utils/logger.util.js';
import { buildFallbackMeta } from '../middleware/fallback.handlers.js';
import { getSport } from './shared.service.js';

/** A stored analysis is "fresh" for 24 hours (CACHE_TTL_MEDIUM). */
const ANALYSIS_TTL_MS = CACHE_TTL.MEDIUM * 1000;

/** sport:season keys whose background analysis compute is already running. */
const pendingSeasonComputes = new Set<string>();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Replicates Python timeout_model.scenario_key (sha1 of the canonical tuple). */
function buildScenarioKey(
  sport: SportAbbreviation,
  consecutiveScores: number,
  scoreDiff: number,
  timeRemaining: number,
  period: number,
  timeoutsAvailable: number
): string {
  const canonical = `${sport.toLowerCase()}|${consecutiveScores}|${scoreDiff}|${Math.round(
    timeRemaining
  )}|${period}|${timeoutsAvailable}`;
  return createHash('sha1').update(canonical).digest('hex').slice(0, 12);
}

/** PlayByPlay row → the shape the Python momentum models expect. */
function toMomentumPlayInput(play: PlayRow): MomentumPlayInput {
  return {
    gameId: play.game.externalId,
    eventTimeSeconds: play.eventTimeSeconds ?? 0,
    teamId: play.team?.externalId ?? null,
    isScoring: play.isScoring,
    homeScore: play.homeScore,
    awayScore: play.awayScore,
    period: play.period,
    description: play.description,
  };
}

const PLAY_SELECT = {
  eventTimeSeconds: true,
  isScoring: true,
  homeScore: true,
  awayScore: true,
  period: true,
  description: true,
  clock: true,
  teamId: true,
  game: { select: { externalId: true } },
  team: { select: { externalId: true, name: true } },
} as const;

type PlayRow = {
  eventTimeSeconds: number | null;
  isScoring: boolean;
  homeScore: number | null;
  awayScore: number | null;
  period: number;
  description: string | null;
  clock: string | null;
  teamId: number | null;
  game: { externalId: string };
  team: { externalId: string; name: string } | null;
};

async function loadSeasonPlays(sportId: number, season: string): Promise<PlayRow[]> {
  return prisma.playByPlay.findMany({
    where: { game: { sportId, season } },
    select: PLAY_SELECT,
    orderBy: [{ gameId: 'asc' }, { eventNumber: 'asc' }],
  }) as Promise<PlayRow[]>;
}

/**
 * Resolves the season that actually has play-by-play for a sport. The Sports
 * row's `season` is a seed (e.g. NBA "2024-25") that goes stale as real games
 * carry newer seasons ("2026-27") — a stale filter would silently return no
 * plays and the analysis would report insufficient_data forever. Prefer the
 * requested season, but fall back to the newest season present in the games
 * table when it has no plays yet.
 */
async function resolveEffectiveSeason(
  sportId: number,
  preferred: string
): Promise<string> {
  const hasPlays = await prisma.playByPlay.count({
    where: { game: { sportId, season: preferred } },
  });
  if (hasPlays > 0) return preferred;

  // Preferred season has no plays (stale Sports-row seed, e.g. NBA
  // "2024-25" while real games are "2026-27"). Fall back to the NEWEST
  // season that actually has play-by-play for this sport — season strings
  // are "2024-25" / "2025" / "2026-27" style, so a numeric-aware descending
  // sort puts the newest on top.
  const newestWithPlays = await prisma.games.findFirst({
    where: { sportId, playByPlay: { some: {} } },
    orderBy: { season: 'desc' },
    select: { season: true },
  });
  if (!newestWithPlays || !newestWithPlays.season) return preferred;
  const resolved = newestWithPlays.season;
  if (resolved !== preferred) {
    logger.info(
      { sportId, preferred, resolved },
      'Momentum: Sports-row season has no plays — resolved effective season from games table'
    );
  }
  return resolved;
}

async function loadGamePlays(gameId: number): Promise<PlayRow[]> {
  return prisma.playByPlay.findMany({
    where: { gameId },
    select: PLAY_SELECT,
    // Chronological — Python's stable sort keeps input order among plays that
    // share an eventTimeSeconds, so an unordered query scrambles the score
    // tracking and empties/garbles the timeline.
    orderBy: { eventNumber: 'asc' },
  }) as Promise<PlayRow[]>;
}

/**
 * Longest run of consecutive scoring events by the same team, with the team
 * name and the game clock at the start of the run (for the replay scrubber).
 *
 * Derivation is intentionally Node-side rather than reading the model's
 * `longestStreak` — the MomentumGameData table doesn't persist it, so deriving
 * here keeps cached and fresh responses identical. Note it keys streaks on
 * teamId, so scoring events without a team attribution (teamId null) count as
 * length-1 runs, whereas Python can infer the scorer from score deltas.
 */
function deriveLongestStreak(plays: PlayRow[]): {
  length: number;
  teamName: string | null;
  startTime: string | null;
} {
  // Chronological order; plays without a time sink last.
  const scoring = plays
    .filter(p => p.isScoring)
    .sort((a, b) => (a.eventTimeSeconds ?? Infinity) - (b.eventTimeSeconds ?? Infinity));

  let best = { length: 0, teamName: null as string | null, startTime: null as string | null };
  let current: { teamId: number | null; length: number; startTime: string | null } | null = null;

  for (const p of scoring) {
    if (current !== null && current.teamId !== null && p.teamId === current.teamId) {
      current.length += 1;
    } else {
      // Unknown team (null) can't be attributed — it starts a fresh 1-score run.
      current = { teamId: p.teamId, length: 1, startTime: p.clock };
    }
    if (current.length > best.length) {
      best = {
        length: current.length,
        teamName: p.team?.name ?? null,
        startTime: current.startTime,
      };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Season analysis
// ---------------------------------------------------------------------------

/**
 * Runs the Cox model for a sport/season and persists the result. Insufficient
 * results (null statistics) are returned but NOT stored — the schema's stats
 * columns are non-nullable, and an un-stored insufficient run just recomputes.
 * Exported for the momentum background job (Step 7 Task B — daily refresh).
 */
export async function computeAndStoreSeasonAnalysis(
  sport: SportAbbreviation,
  sportId: number,
  season: string
): Promise<{ stats: SeasonMomentumResult; computedAt: string; season: string }> {
  const resolvedSeason = await resolveEffectiveSeason(sportId, season);
  const plays = await loadSeasonPlays(sportId, resolvedSeason);
  const result = await momentumML.computeSeasonMomentum({
    sport,
    // Pass the resolved season so the explanation text and the stored row
    // agree (a stale Sports-row season would label real data as a past season).
    season: resolvedSeason,
    plays: plays.map(toMomentumPlayInput),
  });
  const computedAt = new Date().toISOString();

  if (result.verdictLabel !== 'insufficient_data') {
    await prisma.momentumAnalysis.upsert({
      where: { sportId_season: { sportId, season: resolvedSeason } },
      update: {
        gamesAnalyzed: result.gamesAnalyzed,
        hazardCoefficient: result.hazardCoefficient ?? 0,
        pValue: result.pValue ?? 1,
        confidenceIntervalLow: result.confidenceIntervalLow ?? 0,
        confidenceIntervalHigh: result.confidenceIntervalHigh ?? 0,
        isSignificant: result.isSignificant,
        effectSize: result.effectSize,
        hazardRateChange: result.hazardRateChange,
        plainExplanation: result.plainExplanation,
        shortExplanation: result.shortExplanation,
        computedAt: new Date(computedAt),
      },
      create: {
        sportId,
        season: resolvedSeason,
        gamesAnalyzed: result.gamesAnalyzed,
        hazardCoefficient: result.hazardCoefficient ?? 0,
        pValue: result.pValue ?? 1,
        confidenceIntervalLow: result.confidenceIntervalLow ?? 0,
        confidenceIntervalHigh: result.confidenceIntervalHigh ?? 0,
        isSignificant: result.isSignificant,
        effectSize: result.effectSize,
        hazardRateChange: result.hazardRateChange,
        plainExplanation: result.plainExplanation,
        shortExplanation: result.shortExplanation,
        computedAt: new Date(computedAt),
      },
    });
  }

  return { stats: result, computedAt, season: resolvedSeason };
}

/** Flat ML/DB result → the nested API response shape. */
function toAnalysisResponse(
  sport: SportAbbreviation,
  season: string,
  r: {
    hazardCoefficient: number | null;
    pValue: number | null;
    confidenceIntervalLow: number | null;
    confidenceIntervalHigh: number | null;
    isSignificant: boolean;
    effectSize: number | null;
    hazardRateChange?: number | null;
    gamesAnalyzed: number;
    /** Only present on fresh Python results — the column isn't stored in SQLite. */
    playsAnalyzed?: number;
    /** Only present on fresh Python results — derived from isSignificant on DB rows. */
    verdictLabel?: string;
    plainExplanation: string;
    shortExplanation: string;
    computedAt: string;
    streakThreshold?: number | null;
  },
  warning?: string
): MomentumAnalysisResponse {
  return {
    sport,
    season,
    verdict: {
      verdictLabel: (r.verdictLabel ??
        (r.isSignificant
          ? 'significant'
          : 'not_significant')) as MomentumAnalysisResponse['verdict']['verdictLabel'],
      isSignificant: r.isSignificant,
      shortExplanation: r.shortExplanation,
    },
    statistics: {
      hazardCoefficient: r.hazardCoefficient,
      pValue: r.pValue,
      confidenceIntervalLow: r.confidenceIntervalLow,
      confidenceIntervalHigh: r.confidenceIntervalHigh,
      effectSize: r.effectSize,
      hazardRateChange: r.hazardRateChange ?? null,
    },
    context: {
      gamesAnalyzed: r.gamesAnalyzed,
      playsAnalyzed: r.playsAnalyzed ?? 0,
      streakThreshold: r.streakThreshold ?? null,
    },
    plainExplanation: r.plainExplanation,
    computedAt: r.computedAt,
    ...(warning ? { warning } : {}),
  };
}

/** Fallback metadata → the same response shape toAnalysisResponse produces. */
function withFallbackMeta<T extends object>(
  resp: T,
  meta: ReturnType<typeof buildFallbackMeta>
): T & ReturnType<typeof buildFallbackMeta> {
  return { ...resp, ...meta };
}

/** GET /api/momentum/analysis/:sport — cached Cox findings (24h freshness). */
export async function getMomentumAnalysis(
  sport: SportAbbreviation,
  season?: string
): Promise<MomentumAnalysisResponse> {
  const sportRow = await getSport(sport);
  const resolvedSeason = await resolveEffectiveSeason(sportRow.id, season ?? sportRow.season);

  const row = await prisma.momentumAnalysis.findUnique({
    where: { sportId_season: { sportId: sportRow.id, season: resolvedSeason } },
  });
  const isFresh = row != null && Date.now() - row.computedAt.getTime() <= ANALYSIS_TTL_MS;
  if (isFresh) {
    return toAnalysisResponse(sport, resolvedSeason, {
      ...row,
      hazardCoefficient: row.hazardCoefficient,
      computedAt: row.computedAt.toISOString(),
    });
  }

  try {
    const { stats, computedAt } = await computeAndStoreSeasonAnalysis(
      sport,
      sportRow.id,
      resolvedSeason
    );
    return toAnalysisResponse(sport, resolvedSeason, { ...stats, computedAt });
  } catch (err) {
    if (err instanceof MLServiceUnavailableError) {
      logger.warn(
        { sport, error: err.message },
        'Momentum ML unavailable — serving stale analysis'
      );
      if (row) {
        const warning =
          'ML service unavailable — showing last computed analysis, which may be stale';
        return withFallbackMeta(
          toAnalysisResponse(
            sport,
            resolvedSeason,
            { ...row, computedAt: row.computedAt.toISOString() },
            warning
          ),
          buildFallbackMeta(row.computedAt, warning)
        );
      }
      const warning = 'ML service unavailable — no cached analysis available';
      return withFallbackMeta(
        toAnalysisResponse(
          sport,
          resolvedSeason,
          {
            hazardCoefficient: null,
            pValue: null,
            confidenceIntervalLow: null,
            confidenceIntervalHigh: null,
            isSignificant: false,
            effectSize: null,
            gamesAnalyzed: 0,
            playsAnalyzed: 0,
            verdictLabel: 'insufficient_data',
            plainExplanation: warning,
            shortExplanation: warning,
            computedAt: new Date().toISOString(),
          },
          warning
        ),
        buildFallbackMeta(null, warning)
      );
    }
    if (err instanceof MLServiceError) {
      logger.error({ sport, err }, 'Momentum ML computation failed');
      throw new ApiError(502, `ML service error: ${err.message}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Game timeline
// ---------------------------------------------------------------------------

/** Persists a computed timeline into MomentumGameData (upsert by gameId). */
async function storeGameTimeline(
  gameId: number,
  result: GameMomentumResult,
  computedAt: Date
): Promise<void> {
  await prisma.momentumGameData.upsert({
    where: { gameId },
    update: {
      homeTeamMomentum: result.homeTeamMomentum,
      awayTeamMomentum: result.awayTeamMomentum,
      timelineEvents: result.timelineEvents as unknown as Prisma.InputJsonValue,
      peakHomeMomentum: result.peakHomeMomentum,
      peakAwayMomentum: result.peakAwayMomentum,
      momentumShifts: result.momentumShifts,
      computedAt,
    },
    create: {
      gameId,
      homeTeamMomentum: result.homeTeamMomentum,
      awayTeamMomentum: result.awayTeamMomentum,
      timelineEvents: result.timelineEvents as unknown as Prisma.InputJsonValue,
      peakHomeMomentum: result.peakHomeMomentum,
      peakAwayMomentum: result.peakAwayMomentum,
      momentumShifts: result.momentumShifts,
      computedAt,
    },
  });
}

/**
 * Computes and stores the momentum timeline for one game (Step 7 Task A).
 *
 * Returns `true` when a timeline was written. Plays are filtered to scoring
 * events only (per spec — the momentum model only reacts to score changes;
 * chronological ORDER BY is handled inside the Python model, which sorts by
 * eventTimeSeconds). Throws on ML failure so the job can log it and keep any
 * existing data (Step 7.4: never delete old data on failure).
 */
export async function computeAndStoreGameTimeline(gameId: number): Promise<boolean> {
  const game = await prisma.games.findUnique({
    where: { id: gameId },
    select: { externalId: true, sportId: true },
  });
  if (!game) return false;

  const plays = await loadGamePlays(gameId);
  const scoringPlays = plays.filter(p => p.isScoring);
  if (scoringPlays.length === 0) return false;

  const result = await momentumML.computeGameMomentum({
    gameId: game.externalId,
    plays: scoringPlays.map(toMomentumPlayInput),
    sport: (await getSportName(game.sportId)) ?? undefined,
  });
  await storeGameTimeline(gameId, result, new Date());
  return true;
}

/** GET /api/momentum/game/:gameId — cached per-game momentum timeline. */
export async function getGameMomentum(gameId: number): Promise<GameMomentumResponse> {
  const game = await prisma.games.findUnique({
    where: { id: gameId },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (!game) throw ApiError.notFound(`Game ${gameId} not found`);

  const existing = await prisma.momentumGameData.findUnique({ where: { gameId } });

  const gameCtx = {
    gameId,
    date: game.date.toISOString(),
    homeTeam: game.homeTeam.name,
    awayTeam: game.awayTeam.name,
    finalScore:
      game.homeScore != null && game.awayScore != null
        ? `${game.homeScore}-${game.awayScore}`
        : null,
  };

  if (existing) {
    const plays = await loadGamePlays(gameId);
    const streak = deriveLongestStreak(plays);
    return {
      game: gameCtx,
      timeline: {
        homeTeamMomentum: existing.homeTeamMomentum as number[],
        awayTeamMomentum: existing.awayTeamMomentum as number[],
        events: existing.timelineEvents as unknown as GameMomentumResponse['timeline']['events'],
      },
      summary: {
        peakHomeMomentum: existing.peakHomeMomentum ?? 0,
        peakAwayMomentum: existing.peakAwayMomentum ?? 0,
        momentumShifts: existing.momentumShifts ?? 0,
        longestStreak: streak,
      },
      computedAt: existing.computedAt.toISOString(),
    };
  }

  try {
    const plays = await loadGamePlays(gameId);
    const streak = deriveLongestStreak(plays);
    const result = await momentumML.computeGameMomentum({
      gameId: game.externalId,
      plays: plays.map(toMomentumPlayInput),
      sport: (await getSportName(game.sportId)) ?? undefined,
    });
    const computedAt = new Date();
    await storeGameTimeline(gameId, result, computedAt);

    return {
      game: gameCtx,
      timeline: {
        homeTeamMomentum: result.homeTeamMomentum,
        awayTeamMomentum: result.awayTeamMomentum,
        events: result.timelineEvents,
      },
      summary: {
        peakHomeMomentum: result.peakHomeMomentum,
        peakAwayMomentum: result.peakAwayMomentum,
        momentumShifts: result.momentumShifts,
        longestStreak: streak,
      },
      computedAt: computedAt.toISOString(),
    };
  } catch (err) {
    if (err instanceof MLServiceUnavailableError) {
      logger.warn({ gameId, error: err.message }, 'Momentum ML unavailable — empty timeline');
      return {
        game: gameCtx,
        timeline: { homeTeamMomentum: [], awayTeamMomentum: [], events: [] },
        summary: {
          peakHomeMomentum: 0,
          peakAwayMomentum: 0,
          momentumShifts: 0,
          longestStreak: { length: 0, teamName: null, startTime: null },
        },
        computedAt: new Date().toISOString(),
        ...buildFallbackMeta(null, 'ML service unavailable — timeline could not be computed'),
      };
    }
    if (err instanceof MLServiceError) {
      logger.error({ gameId, err }, 'Momentum game computation failed');
      throw new ApiError(502, `ML service error: ${err.message}`);
    }
    throw err;
  }
}

/** sportId → 'NBA' | 'NFL' | ... (uppercase name column). */
async function getSportName(sportId: number): Promise<SportAbbreviation | null> {
  const row = await prisma.sports.findUnique({
    where: { id: sportId },
    select: { name: true },
  });
  return row ? (row.name as SportAbbreviation) : null;
}

// ---------------------------------------------------------------------------
// Sport comparison
// ---------------------------------------------------------------------------

/** GET /api/momentum/comparison — all sports side by side, strongest first. */
export async function getSportComparison(season?: string): Promise<SportComparison> {
  const sports = await prisma.sports.findMany({
    where: { isActive: true },
    select: { id: true, name: true, season: true },
    orderBy: { name: 'asc' },
  });
  const resolvedSeason = season ?? sports[0]?.season ?? '';
  const sportIds = sports.map(s => s.id);

  const rows = await prisma.momentumAnalysis.findMany({
    where: { season: resolvedSeason, sportId: { in: sportIds } },
  });
  const bySport = new Map(rows.map(r => [r.sportId, r]));

  // Seasons differ across sports (NBA 2024-25 vs NFL 2025 vs MLB 2026), so a
  // single requested season never matches them all. When a sport has no row
  // for it, fall back to that sport's own current-season row — the plan's
  // "current season for all sports" — so the panel shows live data per sport.
  const missingSports = sports.filter(s => !bySport.has(s.id));
  for (const s of missingSports) {
    const ownRow = await prisma.momentumAnalysis.findUnique({
      where: { sportId_season: { sportId: s.id, season: s.season } },
    });
    if (ownRow) bySport.set(s.id, ownRow);
  }

  const summaries: SportMomentumSummary[] = [];
  for (const s of sports) {
    const row = bySport.get(s.id);
    if (row) {
      summaries.push({
        sport: s.name as SportAbbreviation,
        // The table stores no verdict column — significant rows imply the verdict.
        verdictLabel: (row.isSignificant
          ? 'significant'
          : 'not_significant') as SportMomentumSummary['verdictLabel'],
        hazardCoefficient: row.hazardCoefficient,
        pValue: row.pValue,
        effectSize: row.effectSize,
        isSignificant: row.isSignificant,
        shortExplanation: row.shortExplanation,
      });
    } else {
      // Missing analysis → compute in the background, don't block the panel.
      // Guarded by an in-flight set so repeated comparison requests (e.g. while
      // ML is down) don't each re-trigger a full-season plays fetch + model run.
      const computeKey = `${s.name}:${resolvedSeason}`;
      if (!pendingSeasonComputes.has(computeKey)) {
        pendingSeasonComputes.add(computeKey);
        logger.info(
          { sport: s.name, season: resolvedSeason },
          'Background momentum compute triggered'
        );
        void computeAndStoreSeasonAnalysis(s.name as SportAbbreviation, s.id, resolvedSeason)
          .catch(err => logger.error({ sport: s.name, err }, 'Background momentum compute failed'))
          .finally(() => pendingSeasonComputes.delete(computeKey));
      }
      // Include the sport now so the comparison panel always shows every
      // active league (the plan's "all four sports") — an insufficient-data
      // placeholder until the background compute lands, instead of dropping
      // NBA/NHL from the panel entirely.
      summaries.push({
        sport: s.name as SportAbbreviation,
        verdictLabel: 'insufficient_data',
        hazardCoefficient: null,
        pValue: null,
        effectSize: null,
        isSignificant: false,
        shortExplanation:
          'Not enough play-by-play data for this sport yet — momentum cannot be evaluated.',
      });
    }
  }

  summaries.sort((a, b) => (b.effectSize ?? -Infinity) - (a.effectSize ?? -Infinity));

  return { season: resolvedSeason, sports: summaries, generatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Timeout optimizer
// ---------------------------------------------------------------------------

/** GET /api/momentum/timeout/:sport — precomputed or live recommendation. */
export async function getTimeoutRecommendation(
  sport: SportAbbreviation,
  situation: {
    consecutiveScores: number;
    scoreDiff: number;
    timeRemaining: number;
    period: number;
    timeoutsAvailable: number;
  }
): Promise<TimeoutRecommendationResponse> {
  const sportRow = await getSport(sport);
  const scenarioKey = buildScenarioKey(
    sport,
    situation.consecutiveScores,
    situation.scoreDiff,
    situation.timeRemaining,
    situation.period,
    situation.timeoutsAvailable
  );

  const existing = await prisma.timeoutRecommendations.findUnique({
    where: { sportId_scenarioKey: { sportId: sportRow.id, scenarioKey } },
  });

  if (existing) {
    const basedOnSampleSize = await prisma.timeoutRecommendations.count({
      where: { sportId: sportRow.id },
    });
    return {
      situation,
      recommendation: {
        shouldCallTimeout: existing.shouldCallTimeout,
        stopProbabilityWith: existing.stopProbabilityWith,
        stopProbabilityWithout: existing.stopProbabilityWithout,
        probabilityDiff: existing.probabilityDiff,
        confidenceLevel: existing.confidenceLevel,
        recommendationText: existing.recommendationText,
      },
      basedOnSampleSize,
    };
  }

  // Not precomputed (edge case) — compute live and store it.
  try {
    const rec = await momentumML.recommendTimeout({
      sport: sport.toLowerCase(),
      consecutiveScores: situation.consecutiveScores,
      scoreDiff: situation.scoreDiff,
      timeRemaining: situation.timeRemaining,
      period: situation.period,
      timeoutsAvailable: situation.timeoutsAvailable,
    });
    const computedAt = new Date();
    await prisma.timeoutRecommendations.upsert({
      where: { sportId_scenarioKey: { sportId: sportRow.id, scenarioKey } },
      update: {
        consecutiveScores: situation.consecutiveScores,
        scoreDiff: situation.scoreDiff,
        timeRemaining: situation.timeRemaining,
        period: situation.period,
        shouldCallTimeout: rec.shouldCallTimeout,
        stopProbabilityWith: rec.stopProbabilityWith,
        stopProbabilityWithout: rec.stopProbabilityWithout,
        probabilityDiff: rec.probabilityDiff,
        recommendationText: rec.recommendationText,
        confidenceLevel: rec.confidenceLevel,
        computedAt,
      },
      create: {
        sportId: sportRow.id,
        scenarioKey,
        consecutiveScores: situation.consecutiveScores,
        scoreDiff: situation.scoreDiff,
        timeRemaining: situation.timeRemaining,
        period: situation.period,
        shouldCallTimeout: rec.shouldCallTimeout,
        stopProbabilityWith: rec.stopProbabilityWith,
        stopProbabilityWithout: rec.stopProbabilityWithout,
        probabilityDiff: rec.probabilityDiff,
        recommendationText: rec.recommendationText,
        confidenceLevel: rec.confidenceLevel,
        computedAt,
      },
    });

    const basedOnSampleSize = await prisma.timeoutRecommendations.count({
      where: { sportId: sportRow.id },
    });
    return {
      situation,
      recommendation: rec,
      basedOnSampleSize,
    };
  } catch (err) {
    if (err instanceof MLServiceUnavailableError) {
      throw new ApiError(502, 'ML service unavailable — no cached timeout recommendation exists');
    }
    if (err instanceof MLServiceError) {
      throw new ApiError(502, `ML service error: ${err.message}`);
    }
    throw err;
  }
}
