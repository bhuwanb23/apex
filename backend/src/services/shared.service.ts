/**
 * Shared module service (Phase 5, Step 4).
 * Sports / teams / players reference lookups for the shared routes.
 * The full service layer expands in Step 11 — this file holds the
 * read-only reference queries everything else builds on.
 */
import { prisma } from '../db/client.js';
import { ApiError } from '../middleware/error.middleware.js';
import {
  toSportCode,
  type PlayerInfo,
  type SportAbbreviation,
  type SportCode,
  type SportInfo,
  type TeamInfo,
} from '../types/shared.types.js';

/** Prisma Sports row → API DTO (kept here so every caller maps identically). */
function toSportInfo(row: {
  id: number;
  name: string;
  abbreviation: string;
  isActive: boolean;
  season: string;
  config: unknown;
}): SportInfo {
  return {
    id: row.id,
    name: row.name as SportAbbreviation,
    abbreviation: row.abbreviation as SportCode,
    isActive: row.isActive,
    season: row.season,
    config: row.config as Record<string, unknown>,
  };
}

/** Resolves an uppercase sport abbreviation to its Sports row (404 if unknown). */
export async function getSport(sport: SportAbbreviation): Promise<SportInfo> {
  const row = await prisma.sports.findUnique({
    where: { abbreviation: toSportCode(sport) },
  });
  if (!row) {
    throw ApiError.notFound(`Sport '${sport}' not found`);
  }
  return toSportInfo(row);
}

/** All active sports, alphabetically (frontend sport selector). */
export async function getSports(): Promise<SportInfo[]> {
  const rows = await prisma.sports.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  return rows.map(toSportInfo);
}

/** All teams for a sport, sorted by name (team selector dropdowns). */
export async function getTeamsForSport(sport: SportAbbreviation): Promise<TeamInfo[]> {
  const sportRow = await getSport(sport);
  const teams = await prisma.teams.findMany({
    where: { sportId: sportRow.id },
    orderBy: { name: 'asc' },
  });
  return teams.map(t => ({
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    city: t.city,
    conference: t.conference,
    division: t.division,
    logoUrl: t.logoUrl,
  }));
}

/** Paginated active players for a sport, each with its team name + abbreviation. */
export async function getPlayersForSport(
  sport: SportAbbreviation,
  opts: { teamId?: number; page: number; limit: number }
): Promise<{ players: PlayerInfo[]; total: number }> {
  const sportRow = await getSport(sport);
  const where = {
    sportId: sportRow.id,
    isActive: true,
    ...(opts.teamId !== undefined ? { teamId: opts.teamId } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.players.findMany({
      where,
      include: { team: { select: { name: true, abbreviation: true } } },
      // Stable sort: id tiebreaker keeps pagination from drifting on duplicate last names.
      orderBy: [{ lastName: 'asc' }, { id: 'asc' }],
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    prisma.players.count({ where }),
  ]);

  return {
    players: rows.map(p => ({
      id: p.id,
      name: p.name,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position,
      jerseyNumber: p.jerseyNumber,
      age: p.age,
      teamId: p.teamId,
      teamName: p.team.name,
      teamAbbreviation: p.team.abbreviation,
      injuryStatus: p.injuryStatus,
    })),
    total,
  };
}
