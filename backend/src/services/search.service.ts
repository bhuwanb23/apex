/**
 * Search module service (Phase 5, Step 8).
 * Autocomplete + filtered lookups for the frontend search bar. Player results
 * are cached in memory for 1 hour (spec) — the LIKE scans are otherwise the
 * hot path on every keystroke.
 */
import { prisma } from '../db/client.js';
import { cacheSearchResults, getSearchResults } from './memory.cache.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PaginatedMeta, SportAbbreviation } from '../types/shared.types.js';
import type {
  SearchCoachResult,
  SearchGameResult,
  SearchPlayerResult,
  SearchTeamResult,
} from '../types/search.types.js';
import { logger } from '../utils/logger.util.js';

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
  const cached = getSearchResults<SearchPlayerResult>(query, opts.sport ?? 'all');
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

  // Latest risk zone per matched player — one batched lookup, no N+1. The
  // players table's injuryStatus column is a separate sports-feed field, so
  // the searchable risk zone comes from the latest InjuryRiskScores row.
  const ids = players.map(p => p.id);
  const latestScores =
    ids.length > 0
      ? await prisma.injuryRiskScores.findMany({
          where: { playerId: { in: ids }, isLatest: true },
          select: { playerId: true, zone: true },
        })
      : [];
  const zoneByPlayer = new Map(latestScores.map(r => [r.playerId, r.zone]));

  const results: SearchPlayerResult[] = players.map(p => ({
    playerId: p.id,
    playerName: p.name,
    position: p.position,
    teamName: p.team.name,
    teamAbbreviation: p.team.abbreviation,
    sport: p.sport.name as SportAbbreviation,
    injuryStatus: p.injuryStatus,
    zone: (zoneByPlayer.get(p.id) as SearchPlayerResult['zone']) ?? null,
  }));

  cacheSearchResults(query, opts.sport ?? 'all', results);
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

/** GET /api/search/games — filtered game list (q / team / sport / season / dates). */
export async function searchGames(
  filters: {
    /** Free-text match against home/away team name, city or abbreviation. */
    q?: string;
    teamId?: number;
    sport?: SportAbbreviation;
    season?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page: number;
    limit: number;
  }
): Promise<{ games: SearchGameResult[]; total: number; meta: PaginatedMeta }> {
  // Team-based filters (explicit teamId and/or free-text q matching a team's
  // name / city / abbreviation) combine as an AND of ORs.
  const teamFilters: Prisma.GamesWhereInput[] = [];
  if (filters.teamId !== undefined) {
    teamFilters.push({ OR: [{ homeTeamId: filters.teamId }, { awayTeamId: filters.teamId }] });
  }
  if (filters.q) {
    const teamMatch: Prisma.TeamsWhereInput = {
      OR: [
        { name: { contains: filters.q } },
        { city: { contains: filters.q } },
        { abbreviation: { contains: filters.q } },
      ],
    };
    teamFilters.push({ OR: [{ homeTeam: teamMatch }, { awayTeam: teamMatch }] });
  }

  const where: Prisma.GamesWhereInput = {
    ...(teamFilters.length > 0 ? { AND: teamFilters } : {}),
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
