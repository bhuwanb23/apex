/**
 * Decision module service (Phase 5, Step 6).
 *
 * Read-side analytics for Module 2:
 *   leaderboard     → DecisionEVScores aggregated per coach, ranked by EV rate,
 *                     cached in memory for 24h keyed on sport+season+type+gameType
 *   coach drilldown → CoachDecisions with game context + process-vs-outcome 2x2
 *   game view       → both coaches' decisions for one game, chronologically
 *   decision types  → sport config from the Sports table
 *
 * No ML calls here — scorecards are precomputed by the Python service and stored
 * in DecisionEVScores (refreshCoachScorecard in Step 11 keeps them fresh).
 */
import { format } from 'date-fns';
import { CACHE_TTL, cacheGet, cacheSet } from '../cache/memoryCache.js';
import { prisma } from '../db/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../middleware/error.middleware.js';
import type {
  CoachDecisionEntry,
  CoachDrillDown,
  CoachLeaderboard,
  CoachScorecard,
  DecisionDetail,
  GameDecisions,
  ProcessVsOutcome,
} from '../types/decision.types.js';
import type { PaginatedMeta, SportAbbreviation } from '../types/shared.types.js';
import { logger } from '../utils/logger.util.js';
import { getSport } from './shared.service.js';

const DAY_MS = 86_400_000;
/** Leaderboard lives in memory for 24 hours (spec: cache TTL for scorecards). */
const LEADERBOARD_TTL_SECONDS = CACHE_TTL.MEDIUM;

/** '2pt' → '2pt_conversion'; 'all' → undefined (no filter); anything else passes through. */
function normalizeDecisionType(filter: string): string | undefined {
  if (filter === 'all') return undefined;
  return filter === '2pt' ? '2pt_conversion' : filter;
}

function paginationMeta(page: number, limit: number, total: number): PaginatedMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
  };
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/** Running totals while collapsing scorecard rows into one entry per coach. */
interface ScorecardAccumulator {
  coachId: number;
  coachName: string;
  teamName: string;
  totalDecisions: number;
  optimalDecisions: number;
  avgEvDiffWeighted: number; // Σ(avgEvDifference × totalDecisions) for a weighted mean
  totalEvLeft: number;
  computedAt: Date;
}

/**
 * Ranks every coach in a sport for the given filters. DecisionEVScores holds
 * one row per (coach, season, decisionType, gameType), so 'all' filters are
 * collapsed per coach here — no raw SQL needed, and the row set is small.
 *
 * Contract: scorecards are stored per decisionType / gameType. Stored 'all'
 * aggregate rows (if any precompute writes them) are excluded when we collapse
 * across that dimension — otherwise they'd be double counted.
 */
async function computeLeaderboard(
  sport: SportAbbreviation,
  sportId: number,
  season: string,
  decisionType: string | undefined,
  gameType: string | undefined,
  withTrends = true
): Promise<CoachScorecard[]> {
  const rows = await prisma.decisionEVScores.findMany({
    where: {
      sportId,
      season,
      ...(decisionType !== undefined
        ? { decisionType }
        : { decisionType: { not: 'all' } }),
      ...(gameType !== undefined ? { gameType } : { gameType: { not: 'all' } }),
    },
    include: { coach: { include: { team: { select: { name: true } } } } },
  });

  const byCoach = new Map<number, ScorecardAccumulator>();
  for (const row of rows) {
    const acc = byCoach.get(row.coachId) ?? {
      coachId: row.coachId,
      coachName: row.coach.name,
      teamName: row.coach.team.name,
      totalDecisions: 0,
      optimalDecisions: 0,
      avgEvDiffWeighted: 0,
      totalEvLeft: 0,
      computedAt: row.computedAt,
    };
    acc.totalDecisions += row.totalDecisions;
    acc.optimalDecisions += row.optimalDecisions;
    acc.avgEvDiffWeighted += (row.avgEvDifference ?? 0) * row.totalDecisions;
    acc.totalEvLeft += row.totalEvLeft ?? 0;
    if (row.computedAt.getTime() > acc.computedAt.getTime()) acc.computedAt = row.computedAt;
    byCoach.set(row.coachId, acc);
  }

  const scorecards: CoachScorecard[] = [...byCoach.values()].map(acc => {
    const total = acc.totalDecisions;
    return {
      coachId: acc.coachId,
      coachName: acc.coachName,
      teamName: acc.teamName,
      sport,
      season,
      decisionType: decisionType ?? 'all',
      totalDecisions: total,
      optimalDecisions: acc.optimalDecisions,
      evRate: total > 0 ? (acc.optimalDecisions / total) * 100 : 0,
      avgEvDifference: total > 0 ? acc.avgEvDiffWeighted / total : null,
      totalEvLeft: acc.totalEvLeft,
      rank: null,
      computedAt: acc.computedAt.toISOString(),
    };
  });

  // Best EV rate first; ties break by raw volume.
  scorecards.sort((a, b) => b.evRate - a.evRate || b.totalDecisions - a.totalDecisions);
  scorecards.forEach((card, i) => {
    card.rank = i + 1;
  });

  if (withTrends) {
    await attachTrends(scorecards, sportId, season);
  }

  return scorecards;
}

/**
 * Fills each card's `trend` (up/down/same) by comparing the last 30 days of
 * decisions against the 30 days before that. One batched query for the whole
 * board — never N+1.
 */
async function attachTrends(
  scorecards: CoachScorecard[],
  sportId: number,
  season: string
): Promise<void> {
  if (scorecards.length === 0) return;
  const coachIds = scorecards.map(s => s.coachId);
  const now = Date.now();
  const recentCut = now - 30 * DAY_MS;
  const priorCut = now - 60 * DAY_MS;

  const rows = await prisma.coachDecisions.findMany({
    where: { coachId: { in: coachIds }, game: { sportId, season } },
    select: { coachId: true, isOptimal: true, game: { select: { date: true } } },
  });

  const buckets = new Map<
    number,
    { recentTotal: number; recentOpt: number; priorTotal: number; priorOpt: number }
  >();
  for (const row of rows) {
    const t = row.game.date.getTime();
    const b = buckets.get(row.coachId) ?? {
      recentTotal: 0,
      recentOpt: 0,
      priorTotal: 0,
      priorOpt: 0,
    };
    if (t >= recentCut) {
      b.recentTotal += 1;
      if (row.isOptimal) b.recentOpt += 1;
    } else if (t >= priorCut) {
      b.priorTotal += 1;
      if (row.isOptimal) b.priorOpt += 1;
    }
    buckets.set(row.coachId, b);
  }

  for (const card of scorecards) {
    const b = buckets.get(card.coachId);
    // No sample in either window → no meaningful trend to report.
    if (!b || b.recentTotal === 0 || b.priorTotal === 0) {
      card.trend = 'same';
      continue;
    }
    const delta = (b.recentOpt / b.recentTotal) * 100 - (b.priorOpt / b.priorTotal) * 100;
    card.trend = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'same';
  }
}

/** GET /api/decisions/coaches/:sport — ranked leaderboard (24h cached). */
export async function getCoachLeaderboard(
  sport: SportAbbreviation,
  opts: {
    season?: string;
    decisionType: string;
    gameType: string;
    page: number;
    limit: number;
  }
): Promise<CoachLeaderboard> {
  const sportRow = await getSport(sport);
  const season = opts.season ?? sportRow.season;
  const decisionType = normalizeDecisionType(opts.decisionType);
  const gameType = opts.gameType === 'all' ? undefined : opts.gameType;

  // Cache key per spec: sport + season + decisionType + gameType (not page).
  const cacheKey = `decisions:leaderboard:${sport}:${season}:${opts.decisionType}:${opts.gameType}`;
  let scorecards = cacheGet<CoachScorecard[]>(cacheKey);
  if (!scorecards) {
    scorecards = await computeLeaderboard(sport, sportRow.id, season, decisionType, gameType);
    cacheSet(cacheKey, scorecards, LEADERBOARD_TTL_SECONDS);
    logger.debug({ cacheKey, coaches: scorecards.length }, 'Leaderboard computed + cached');
  }

  const total = scorecards.length;
  const start = (opts.page - 1) * opts.limit;
  return {
    sport,
    season,
    decisionType: opts.decisionType,
    gameType: opts.gameType,
    coaches: scorecards.slice(start, start + opts.limit),
    generatedAt: new Date().toISOString(),
    meta: paginationMeta(opts.page, opts.limit, total),
  };
}

// ---------------------------------------------------------------------------
// Coach drill-down
// ---------------------------------------------------------------------------

type DecisionRow = Prisma.CoachDecisionsGetPayload<{
  include: {
    game: {
      select: {
        date: true;
        homeTeamId: true;
        awayTeamId: true;
        homeTeam: { select: { name: true } };
        awayTeam: { select: { name: true } };
      };
    };
  };
}>;

/** DB row → drill-down entry (adds formatted date + opponent name). */
function toCoachDecisionEntry(row: DecisionRow, coachTeamId: number): CoachDecisionEntry {
  const opponentName =
    row.game.homeTeamId === coachTeamId ? row.game.awayTeam.name : row.game.homeTeam.name;
  return {
    id: row.id,
    gameId: row.gameId,
    gameDate: row.game.date.toISOString(),
    opponent: opponentName,
    decisionType: row.decisionType,
    period: row.period,
    clock: row.clock,
    scoreDiff: row.scoreDiff,
    chosenAction: row.chosenAction,
    evChosen: row.evChosen,
    evBest: row.evBest,
    evDifference: row.evDifference,
    isOptimal: row.isOptimal,
    alternativeActions: row.alternativeActions as DecisionDetail['alternativeActions'],
    outcome: row.outcome,
    outcomeSuccess: row.outcomeSuccess,
    gameDateFormatted: format(row.game.date, 'MMM d, yyyy'),
    opponentName,
  };
}

/** GET /api/decisions/coach/:coachId — one coach's decisions + summary. */
export async function getCoachDecisions(
  coachId: number,
  filters: {
    season?: string;
    decisionType: string;
    isOptimal?: boolean;
    page: number;
    limit: number;
  }
): Promise<CoachDrillDown> {
  const coach = await prisma.coaches.findUnique({
    where: { id: coachId },
    include: {
      team: { select: { name: true, id: true } },
      sport: { select: { name: true } },
    },
  });
  if (!coach) throw ApiError.notFound(`Coach ${coachId} not found`);

  const sportRow = await getSport(coach.sport.name as SportAbbreviation);
  const season = filters.season ?? sportRow.season;
  const decisionType = normalizeDecisionType(filters.decisionType);

  const where: Prisma.CoachDecisionsWhereInput = {
    coachId,
    ...(decisionType !== undefined ? { decisionType } : {}),
    ...(filters.isOptimal !== undefined ? { isOptimal: filters.isOptimal } : {}),
    game: { sportId: coach.sportId, season },
  };

  const [total, rows, outcomeRows] = await prisma.$transaction([
    prisma.coachDecisions.count({ where }),
    prisma.coachDecisions.findMany({
      where,
      include: {
        game: {
          select: {
            date: true,
            homeTeamId: true,
            awayTeamId: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
      orderBy: { game: { date: 'desc' } }, // most recent first
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    // The full filtered set (not just the page) drives the summary counts.
    prisma.coachDecisions.findMany({
      where,
      select: { isOptimal: true, outcomeSuccess: true },
    }),
  ]);

  const processVsOutcome: ProcessVsOutcome = {
    goodProcessGoodOutcome: 0,
    goodProcessBadOutcome: 0,
    badProcessGoodOutcome: 0,
    badProcessBadOutcome: 0,
  };
  for (const d of outcomeRows) {
    if (d.outcomeSuccess === null) continue; // unresolved plays aren't outcome data
    if (d.isOptimal) {
      if (d.outcomeSuccess) processVsOutcome.goodProcessGoodOutcome += 1;
      else processVsOutcome.goodProcessBadOutcome += 1;
    } else if (d.outcomeSuccess) {
      processVsOutcome.badProcessGoodOutcome += 1;
    } else {
      processVsOutcome.badProcessBadOutcome += 1;
    }
  }

  // League rank under the same filters. Trends aren't returned here, so skip
  // the full-season trend scan (withTrends = false) — rank only needs the cards.
  const leaderboard = await computeLeaderboard(
    coach.sport.name as SportAbbreviation,
    coach.sportId,
    season,
    decisionType,
    undefined,
    false
  );
  const rank = leaderboard.find(s => s.coachId === coachId)?.rank ?? null;

  const optimalDecisions = outcomeRows.filter(d => d.isOptimal).length;

  return {
    coach: {
      coachId,
      coachName: coach.name,
      teamName: coach.team.name,
      sport: coach.sport.name as SportAbbreviation,
    },
    summary: {
      totalDecisions: total,
      optimalDecisions,
      evRate: total > 0 ? (optimalDecisions / total) * 100 : 0,
      rank,
    },
    processVsOutcome,
    decisions: rows.map(row => toCoachDecisionEntry(row, coach.teamId)),
    meta: paginationMeta(filters.page, filters.limit, total),
  };
}

// ---------------------------------------------------------------------------
// Game view + decision types
// ---------------------------------------------------------------------------

type GameDecisionRow = Prisma.CoachDecisionsGetPayload<{
  include: { coach: { select: { id: true; teamId: true } } };
}>;

/** DB row → bare DecisionDetail (game context comes from the caller). */
function toGameDecisionDetail(
  row: GameDecisionRow,
  gameDate: Date,
  homeTeamName: string,
  awayTeamName: string,
  opponentFor: 'home' | 'away'
): DecisionDetail {
  return {
    id: row.id,
    gameId: row.gameId,
    gameDate: gameDate.toISOString(),
    opponent: opponentFor === 'home' ? awayTeamName : homeTeamName,
    decisionType: row.decisionType,
    period: row.period,
    clock: row.clock,
    scoreDiff: row.scoreDiff,
    chosenAction: row.chosenAction,
    evChosen: row.evChosen,
    evBest: row.evBest,
    evDifference: row.evDifference,
    isOptimal: row.isOptimal,
    alternativeActions: row.alternativeActions as DecisionDetail['alternativeActions'],
    outcome: row.outcome,
    outcomeSuccess: row.outcomeSuccess,
  };
}

/** GET /api/decisions/game/:gameId — both coaches' decisions, chronological. */
export async function getGameDecisions(gameId: number): Promise<GameDecisions> {
  const game = await prisma.games.findUnique({
    where: { id: gameId },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (!game) throw ApiError.notFound(`Game ${gameId} not found`);

  const rows = await prisma.coachDecisions.findMany({
    where: { gameId },
    include: { coach: { select: { id: true, teamId: true } } },
  });
  // Chronological through the game; decisions without a clock time sink last.
  rows.sort((a, b) => (a.gameTimeSeconds ?? Infinity) - (b.gameTimeSeconds ?? Infinity));

  // Bucket every decision to a side so nothing is dropped from the totals:
  // match by the coach's team first, fall back to the game's recorded coach
  // ids, then bucket any remainder with home (with a warning).
  const homeIds = new Set<number>();
  const awayIds = new Set<number>();
  for (const r of rows) {
    if (r.coach.teamId === game.homeTeamId || r.coachId === game.homeCoachId) {
      homeIds.add(r.id);
    } else if (r.coach.teamId === game.awayTeamId || r.coachId === game.awayCoachId) {
      awayIds.add(r.id);
    } else {
      logger.warn(
        { gameId, decisionId: r.id, coachId: r.coachId },
        'Decision with no matching home/away coach — bucketed with home'
      );
      homeIds.add(r.id);
    }
  }

  const homeDecisions = rows
    .filter(r => homeIds.has(r.id))
    .map(r => toGameDecisionDetail(r, game.date, game.homeTeam.name, game.awayTeam.name, 'home'));
  const awayDecisions = rows
    .filter(r => awayIds.has(r.id))
    .map(r => toGameDecisionDetail(r, game.date, game.homeTeam.name, game.awayTeam.name, 'away'));

  const all = [...homeDecisions, ...awayDecisions];
  const biggestMistake =
    all.length > 0 ? all.reduce((a, b) => (b.evDifference > a.evDifference ? b : a)) : null;

  return {
    game: {
      gameId,
      date: game.date.toISOString(),
      homeTeam: game.homeTeam.name,
      awayTeam: game.awayTeam.name,
      finalScore:
        game.homeScore != null && game.awayScore != null
          ? `${game.homeScore}-${game.awayScore}`
          : null,
    },
    homeCoachDecisions: homeDecisions,
    awayCoachDecisions: awayDecisions,
    gameSummary: {
      totalDecisions: all.length,
      optimalDecisions: all.filter(d => d.isOptimal).length,
      biggestMistake,
    },
  };
}

/** GET /api/decisions/types/:sport — decision types from the sport's config. */
export async function getDecisionTypes(
  sport: SportAbbreviation
): Promise<{ sport: SportAbbreviation; decisionTypes: string[] }> {
  const sportRow = await getSport(sport);
  const config = (sportRow.config ?? {}) as { decisionTypes?: unknown };
  const decisionTypes = Array.isArray(config.decisionTypes)
    ? config.decisionTypes.filter((t): t is string => typeof t === 'string')
    : [];
  return { sport, decisionTypes };
}
