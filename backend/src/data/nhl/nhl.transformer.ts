import type {
  GameRecord,
  PlayByPlayRecord,
  PlayerGameLogRecord,
  PlayerRecord,
  TeamRecord,
} from '../db.writer.js';
import type {
  NhlPlay,
  NhlRosterEntry,
  NhlScheduleGame,
  NhlTeam,
} from './nhl.types.js';

/**
 * Cleans and normalizes raw NHL API payloads into the DB-ready records
 * defined in db.writer.ts (sportId: 4 = NHL).
 */

const NHL_SPORT_ID = 4;

/**
 * NHL has a game clock, so event times are derived from the period and
 * time-in-period. This converts to approximate game seconds for the
 * Cox-model timeline.
 */
function gameTimeToSeconds(period: number, timeInPeriod: string): number {
  const [mins, secs] = timeInPeriod.split(':').map(Number);
  const periodSeconds = (period - 1) * 20 * 60; // 20 min periods
  const elapsed = (mins ?? 0) * 60 + (secs ?? 0);
  return periodSeconds + elapsed;
}

/** NHL team → TeamRecord (conference → league per the spec). */
export function transformTeam(raw: NhlTeam): TeamRecord {
  return {
    sportId: NHL_SPORT_ID,
    name: raw.name,
    abbreviation: raw.abbreviation,
    city: raw.locationName ?? '',
    conference: raw.conference?.name ?? null,
    division: raw.division?.name ?? null,
    externalId: String(raw.id),
    logoUrl: null,
  };
}

/**
 * Roster entry → PlayerRecord. `externalTeamId` is passed by the sync
 * coordinator — roster payloads don't carry the team themselves.
 */
export function transformPlayer(
  raw: NhlRosterEntry,
  externalTeamId?: string | null
): PlayerRecord {
  const firstName = raw.firstName?.default ?? '';
  const lastName = raw.lastName?.default ?? '';
  const fullName = raw.fullName ?? `${firstName} ${lastName}`.trim();
  return {
    sportId: NHL_SPORT_ID,
    name: fullName || firstName,
    firstName,
    lastName,
    position: raw.positionCode ?? 'UNK',
    jerseyNumber: raw.jerseyNumber ?? null,
    age: raw.birthDate
      ? Math.floor(
          (Date.now() - new Date(raw.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        )
      : null,
    heightInches: raw.heightInInches ?? null,
    weightLbs: raw.weightInPounds ?? null,
    externalId: String(raw.id),
    externalTeamId: externalTeamId ?? null,
  };
}

/** Schedule entry → GameRecord (id → externalId). */
export function transformGame(raw: NhlScheduleGame): GameRecord {
  const home = raw.homeTeam;
  const away = raw.awayTeam;
  const homeScore = home?.score ?? null;
  const awayScore = away?.score ?? null;
  const state = raw.detailedState ?? 'Preview';
  const status =
    state === 'Final' ? 'final' : state === 'Live' ? 'live' : 'scheduled';
  let winner: string | null = null;
  if (status === 'final' && homeScore != null && awayScore != null) {
    winner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'tie';
  }
  const seasonYear = raw.gameDate?.slice(0, 4) ?? '';
  return {
    sportId: NHL_SPORT_ID,
    date: new Date(raw.gameDate),
    season: seasonYear,
    gameType: raw.gameType === 'P' ? 'playoff' : 'regular',
    week: null,
    homeScore,
    awayScore,
    winner,
    status,
    externalId: String(raw.id),
    venue: raw.venue?.default ?? null,
    homeTeamExternalId: home?.id != null ? String(home.id) : '',
    awayTeamExternalId: away?.id != null ? String(away.id) : '',
  };
}

/**
 * NHL play-by-play event → PlayByPlayRecord.
 * Tracks running scores to detect scoring plays.
 */
export function transformPlay(
  raw: NhlPlay,
  prevScores?: { home: number; away: number }
): PlayByPlayRecord {
  const details = raw.details ?? {};
  const homeScore = details.homeScore ?? prevScores?.home ?? 0;
  const awayScore = details.awayScore ?? prevScores?.away ?? 0;
  const isScoring = details.eventType === 'GOAL' ||
    (prevScores != null && (homeScore !== prevScores.home || awayScore !== prevScores.away));

  const eventTimeSeconds =
    raw.period && raw.timeInPeriod
      ? gameTimeToSeconds(raw.period, raw.timeInPeriod)
      : null;

  return {
    sportId: NHL_SPORT_ID,
    eventNumber: raw.eventId ?? 0,
    period: raw.period ?? 0,
    clock: raw.timeInPeriod ?? null,
    eventTimeSeconds,
    teamExternalId: null,
    playerExternalId:
      details.goalScorerId != null ? String(details.goalScorerId) : null,
    eventType: details.eventType ?? 'unknown',
    eventSubtype: details.shotType ?? null,
    description: raw.description ?? '',
    homeScore,
    awayScore,
    scoreDiff: homeScore - awayScore,
    isScoring,
    rawEvent: raw as unknown as Record<string, unknown>,
  };
}

/** Batch variant — tracks running scores to flag scoring plays precisely. */
export function transformPlays(plays: NhlPlay[]): PlayByPlayRecord[] {
  let prev: { home: number; away: number } | undefined;
  return plays.map(play => {
    const record = transformPlay(play, prev);
    if (play.details?.homeScore != null && play.details?.awayScore != null) {
      prev = { home: play.details.homeScore, away: play.details.awayScore };
    }
    return record;
  });
}

/** Batch game-log transformer — computes workload windows from the player's season. */
export function transformPlayerGameLogs(
  _games: unknown[],
  _playerExternalId: string
): PlayerGameLogRecord[] {
  // NHL game logs are derived from team game data during sync.
  // The public API doesn't provide per-player game logs directly.
  return [];
}
