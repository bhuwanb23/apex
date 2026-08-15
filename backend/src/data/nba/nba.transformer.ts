import type { GameRecord, PlayerGameLogRecord, PlayerRecord, TeamRecord } from '../db.writer.js';
import { computeWorkloads } from '../workload.util.js';
import type { NBAGame, NBAPlayer, NBAStats, NBATeam } from './nba.types.js';

/**
 * Cleans and normalizes raw BallDontLie payloads into the DB-ready records
 * defined in db.writer.ts (sportId: 1 = NBA).
 */

const NBA_SPORT_ID = 1;

/** Parses BallDontLie season number (2024) into our "2024-25" format. */
function formatSeason(season: number): string {
  return `${season}-${String((season + 1) % 100).padStart(2, '0')}`;
}

/** Maps BallDontLie status text ("Final", "1st Qtr") → our status enum. */
export function normalizeGameStatus(status: string): 'scheduled' | 'live' | 'final' {
  const s = status.toLowerCase();
  if (s.includes('final')) return 'final';
  if (s.includes('sched') || s === '') return 'scheduled';
  return 'live';
}

/** "6-2" (feet-inches) → 74 inches. */
function parseHeightInches(height: string | null | undefined): number | null {
  if (!height) return null;
  const match = /^(\d+)-(\d+)$/.exec(height.trim());
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]);
}

/** "185" (lbs string) → 185. */
function parseWeightLbs(weight: string | null | undefined): number | null {
  if (!weight) return null;
  const n = Number(weight.trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * "32:14" → 32.23 decimal minutes; plain "30" → 30. Returns null when unset.
 * The API gives minutes as a string — conversion happens here, not the fetcher.
 */
export function parseMinutesToDecimal(min: string | null | undefined): number | null {
  if (!min) return null;
  const parts = min.trim().split(':');
  if (parts.length === 2) {
    const m = Number(parts[0]);
    const s = Number(parts[1]);
    if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
    return Math.round((m + s / 60) * 100) / 100;
  }
  const n = Number(min);
  return Number.isFinite(n) ? n : null;
}

/**
 * BallDontLie /teams returns 88 rows: the 30 active NBA teams plus ~58
 * historical/defunct/international teams (e.g. "Washington Capitols", "Tel
 * Aviv Maccabi") that share abbreviations with active teams. Active NBA
 * teams are the only ones with a real conference ("East"/"West"); the rest
 * have a blank string or null. The Teams table has a unique constraint on
 * (abbreviation, sportId), so writing the full payload collides on the
 * duplicates — filter to active NBA teams here.
 */
export function isActiveNbaTeam(raw: NBATeam): boolean {
  return raw.conference != null && raw.conference.trim() !== '';
}

/** BallDontLie team → TeamRecord. */
export function transformTeam(raw: NBATeam): TeamRecord {
  return {
    sportId: NBA_SPORT_ID,
    name: raw.full_name,
    abbreviation: raw.abbreviation,
    city: raw.city,
    conference: raw.conference?.trim() || null,
    division: raw.division ?? null,
    externalId: String(raw.id),
    logoUrl: null,
  };
}

/** BallDontLie player → PlayerRecord (team + sport resolution via external ids). */
export function transformPlayer(raw: NBAPlayer): PlayerRecord {
  const firstName = raw.first_name ?? '';
  const lastName = raw.last_name ?? '';
  return {
    sportId: NBA_SPORT_ID,
    name: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    position: raw.position ?? 'UNK',
    jerseyNumber: raw.jersey_number ?? null,
    age: null,
    heightInches: parseHeightInches(raw.height),
    weightLbs: parseWeightLbs(raw.weight),
    externalId: String(raw.id),
    externalTeamId: raw.team?.id != null ? String(raw.team.id) : null,
  };
}

/** BallDontLie game → GameRecord (home/away team resolution via external ids). */
export function transformGame(raw: NBAGame): GameRecord {
  const homeScore = raw.home_team_score;
  const awayScore = raw.visitor_team_score;
  const status = normalizeGameStatus(raw.status);
  let winner: string | null = null;
  if (status === 'final') {
    winner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'tie';
  }
  return {
    sportId: NBA_SPORT_ID,
    date: new Date(raw.date),
    season: formatSeason(raw.season),
    gameType: raw.postseason ? 'playoff' : 'regular',
    week: null,
    homeScore,
    awayScore,
    winner,
    status,
    externalId: String(raw.id),
    venue: null,
    homeTeamExternalId: String(raw.home_team.id),
    awayTeamExternalId: String(raw.visitor_team.id),
  };
}

/**
 * Single BallDontLie box score → PlayerGameLogRecord.
 * Workload fields (backToBack, days rest, windows) are computed from the
 * player's full game history — use transformPlayerGameLogs for those.
 */
export function transformPlayerGameLog(raw: NBAStats): PlayerGameLogRecord {
  return {
    sportId: NBA_SPORT_ID,
    playerExternalId: String(raw.player.id),
    gameExternalId: String(raw.game.id),
    teamExternalId: raw.team?.id != null ? String(raw.team.id) : null,
    date: new Date(raw.game.date),
    minutesPlayed: parseMinutesToDecimal(raw.min),
    distanceCovered: null,
    highIntensityEvents: null,
    backToBack: false,
    daysRestBefore: null,
    gamesLast7Days: null,
    gamesLast14Days: null,
    gamesLast21Days: null,
    points: raw.pts ?? null,
    assists: raw.ast ?? null,
    rebounds: raw.reb ?? null,
    rawBoxScore: raw as unknown as Record<string, unknown>,
  };
}

/**
 * Batch game-log transformer: sorts by game date, maps each box score, and
 * computes the workload windows (back-to-back, days rest, last-7/14/21-day
 * games) from the player's own game history.
 */
export function transformPlayerGameLogs(stats: NBAStats[]): PlayerGameLogRecord[] {
  const sorted = [...stats].sort((a, b) => a.game.date.localeCompare(b.game.date));
  const dates = sorted.map(s => new Date(s.game.date));
  const workloads = computeWorkloads(dates);
  return sorted.map((stat, i) => {
    const workload = workloads[i];
    return {
      ...transformPlayerGameLog(stat),
      backToBack: workload?.backToBack ?? false,
      daysRestBefore: workload?.daysRestBefore ?? null,
      gamesLast7Days: workload?.gamesLast7Days ?? null,
      gamesLast14Days: workload?.gamesLast14Days ?? null,
      gamesLast21Days: workload?.gamesLast21Days ?? null,
    };
  });
}

// NBA has no coach data on the free tier — reserved for parity with the other sports.
export function transformCoach(_raw: unknown): never {
  throw new Error('Not implemented: NBA coach data is unavailable on the BallDontLie free tier');
}
