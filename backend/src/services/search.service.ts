/**
 * Search module service (Phase 5, Step 8).
 * Autocomplete + filtered lookups for the frontend search bar. Player results
 * are cached in memory for 1 hour (spec) — the LIKE scans are otherwise the
 * hot path on every keystroke.
 */
import { cacheGet, cacheSet } from '../cache/memoryCache.js';
import { IN_MEMORY_TTL } from '../utils/cache.config.js';
import { prisma } from '../db/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PaginatedMeta, SportAbbreviation } from '../types/shared.types.js';
import type {
  SearchCoachResult,
  SearchGameResult,
  SearchPlayerResult,
  SearchTeamResult,
} from '../types/search.types.js';
import { logger } from '../utils/logger.util.js';

/** Player autocomplete results live for 1 hour (Phase 7 cache config). */
const SEARCH_TTL_SECONDS = IN_MEMORY_TTL.SEARCH_RESULTS;

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

/** GET /api/search/players — cached autocomplete (min 2 chars, 1h TTL). */
export async function searchPlayers(
  q: string,
  opts: { sport?: SportAbbreviation; limit: number }
): Promise<SearchPlayerResult[]> {
  const query = q.trim();
  const cacheKey = `search_player_${query.toLowerCase()}_${opts.sport ?? 'all'}`;
  const cached = cacheGet<SearchPlayerResult[]>(cacheKey);
  if (cached) return cached;

  const players = await prisma.players.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: query } },
        { firstName: { contains: query } },
        { lastName: { contains: query } },
      ],
      ...(opts.sport ? { sport: { name: opts.sport } } : {}),
    },
    include: {
      team: { select: { name: true, abbreviation: true } },
      sport: { select: { name: true } },
    },
    orderBy: [{ lastName: 'asc' }, { id: 'asc' }],
    take: opts.limit,
  });

  const results: SearchPlayerResult[] = players.map(p => ({
    playerId: p.id,
    playerName: p.name,
    position: p.position,
    teamName: p.team.name,
    teamAbbreviation: p.team.abbreviation,
    sport: p.sport.name as SportAbbreviation,
    injuryStatus: p.injuryStatus,
  }));

  cacheSet(cacheKey, results, SEARCH_TTL_SECONDS);
  return results;
}

/** GET /api/search/teams — name / city / abbreviation match with sport info. */
export async function searchTeams(
  q: string,
  opts: { sport?: SportAbbreviation }
): Promise<SearchTeamResult[]> {
  const query = q.trim();
  const teams = await prisma.teams.findMany({
    where: {
      OR: [
        { name: { contains: query } },
        { city: { contains: query } },
        { abbreviation: { contains: query.toUpperCase() } },
      ],
      ...(opts.sport ? { sport: { name: opts.sport } } : {}),
    },
    include: { sport: { select: { name: true } } },
    orderBy: { name: 'asc' },
    take: 20,
  });

  return teams.map(t => ({
    teamId: t.id,
    teamName: t.name,
    abbreviation: t.abbreviation,
    city: t.city,
    conference: t.conference,
    division: t.division,
    logoUrl: t.logoUrl,
    sport: t.sport.name as SportAbbreviation,
  }));
}

/** GET /api/search/coaches — coach autocomplete for the decisions module. */
export async function searchCoaches(
  q: string,
  opts: { sport?: SportAbbreviation }
): Promise<SearchCoachResult[]> {
  const query = q.trim();
  const coaches = await prisma.coaches.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: query } },
        { firstName: { contains: query } },
        { lastName: { contains: query } },
      ],
      ...(opts.sport ? { sport: { name: opts.sport } } : {}),
    },
    include: {
      team: { select: { name: true } },
      sport: { select: { name: true } },
    },
    orderBy: [{ lastName: 'asc' }, { id: 'asc' }],
    take: 20,
  });

  return coaches.map(c => ({
    coachId: c.id,
    coachName: c.name,
    role: c.role,
    teamName: c.team.name,
    sport: c.sport.name as SportAbbreviation,
  }));
}

/** GET /api/search/games — filtered game list (team / sport / season / dates). */
export async function searchGames(
  filters: {
    teamId?: number;
    sport?: SportAbbreviation;
    season?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page: number;
    limit: number;
  }
): Promise<{ games: SearchGameResult[]; total: number; meta: PaginatedMeta }> {
  const where: Prisma.GamesWhereInput = {
    ...(filters.teamId !== undefined
      ? { OR: [{ homeTeamId: filters.teamId }, { awayTeamId: filters.teamId }] }
      : {}),
    ...(filters.sport ? { sport: { name: filters.sport } } : {}),
    ...(filters.season ? { season: filters.season } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          date: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
  };

  const [total, games] = await prisma.$transaction([
    prisma.games.count({ where }),
    prisma.games.findMany({
      where,
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        sport: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  const results: SearchGameResult[] = games.map(g => ({
    gameId: g.id,
    date: g.date.toISOString(),
    season: g.season,
    gameType: g.gameType,
    status: g.status,
    homeTeamName: g.homeTeam.name,
    awayTeamName: g.awayTeam.name,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    finalScore:
      g.homeScore != null && g.awayScore != null ? `${g.homeScore}-${g.awayScore}` : null,
    sport: g.sport.name as SportAbbreviation,
  }));

  logger.debug({ total, page: filters.page }, 'searchGames complete');
  return { games: results, total, meta: paginationMeta(filters.page, filters.limit, total) };
}
