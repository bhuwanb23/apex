import type {
  GameRecord,
  PlayByPlayRecord,
  PlayerGameLogRecord,
  PlayerRecord,
  TeamRecord,
} from '../db.writer.js';
import { computeWorkloads } from '../workload.util.js';
import type {
  MlbGameLogSplit,
  MlbPlay,
  MlbRosterEntry,
  MlbScheduleGame,
  MlbTeam,
} from './mlb.types.js';

/**
 * Cleans and normalizes raw MLB Stats API payloads into the DB-ready records
 * defined in db.writer.ts (sportId: 3 = MLB).
 */

const MLB_SPORT_ID = 3;

/**
 * MLB has no game clock, so event times are derived from the at-bat sequence
 * number (monotonic within a game). Scaling by ~180s per at-bat keeps the
 * Cox-model durations and the replay-scrubber timeline in plausible game
 * seconds (~3 hours for a 9-inning game) instead of raw at-bat indices.
 */
const SECONDS_PER_AT_BAT = 180;

/** MLB team → TeamRecord (league → conference, per the spec). */
export function transformTeam(raw: MlbTeam): TeamRecord {
  return {
    sportId: MLB_SPORT_ID,
    name: raw.name,
    abbreviation: raw.abbreviation,
    city: raw.locationName ?? '',
    conference: raw.league?.name ?? null,
    division: raw.division?.name ?? null,
    externalId: String(raw.id),
    logoUrl: null,
  };
}

/**
 * Roster entry → PlayerRecord. `externalTeamId` (the MLB team id the roster
 * was fetched for) is passed by the sync coordinator — roster payloads don't
 * carry the team themselves.
 */
export function transformPlayer(raw: MlbRosterEntry, externalTeamId?: string | null): PlayerRecord {
  const fullName = raw.person?.fullName ?? '';
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ') || firstName;
  return {
    sportId: MLB_SPORT_ID,
    name: fullName || firstName,
    firstName,
    lastName,
    position: raw.position?.abbreviation ?? raw.position?.code ?? 'UNK',
    jerseyNumber: raw.jerseyNumber ?? null,
    age: null,
    heightInches: null,
    weightLbs: null,
    externalId: raw.person?.id != null ? String(raw.person.id) : '',
    externalTeamId: externalTeamId ?? null,
  };
}

/** Schedule entry → GameRecord (gamePk → externalId, gameDate → date). */
export function transformGame(raw: MlbScheduleGame): GameRecord {
  const home = raw.teams.home;
  const away = raw.teams.away;
  const homeScore = home?.score ?? null;
  const awayScore = away?.score ?? null;
  const state = raw.status?.abstractGameState; // "Preview" | "Live" | "Final"
  const status = state === 'Final' ? 'final' : state === 'Live' ? 'live' : 'scheduled';
  let winner: string | null = null;
  if (status === 'final' && homeScore != null && awayScore != null) {
    winner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'tie';
  }
  const seasonYear = raw.officialDate?.slice(0, 4) ?? raw.season ?? '';
  return {
    sportId: MLB_SPORT_ID,
    date: new Date(raw.gameDate),
    season: seasonYear,
    gameType: raw.gameType === 'P' ? 'playoff' : 'regular',
    week: null,
    homeScore,
    awayScore,
    winner,
    status,
    externalId: String(raw.gamePk),
    venue: raw.venue?.name ?? null,
    homeTeamExternalId: home?.team.id != null ? String(home.team.id) : '',
    awayTeamExternalId: away?.team.id != null ? String(away.team.id) : '',
  };
}

/**
 * MLB play-by-play event → PlayByPlayRecord (event → eventType, description,
 * inning → period per the spec). `prevScores` lets a batch caller detect
 * scoring plays from the actual score change; about.isScoringPlay is the
 * fallback the API provides.
 */
export function transformPlay(
  raw: MlbPlay,
  prevScores?: { home: number; away: number }
): PlayByPlayRecord {
  const hasScores = raw.result.homeScore != null && raw.result.awayScore != null;
  const homeScore = hasScores ? (raw.result.homeScore ?? 0) : 0;
  const awayScore = hasScores ? (raw.result.awayScore ?? 0) : 0;
  let isScoring = raw.about.isScoringPlay ?? false;
  if (hasScores && prevScores) {
    isScoring = homeScore !== prevScores.home || awayScore !== prevScores.away;
  }
  return {
    sportId: MLB_SPORT_ID,
    eventNumber: raw.about.atBatIndex ?? 0,
    period: raw.about.inning ?? 0,
    clock: null,
    eventTimeSeconds:
      raw.about.atBatIndex != null ? raw.about.atBatIndex * SECONDS_PER_AT_BAT : null,
    teamExternalId: null, // not carried per-event; caller can fill from the game
    playerExternalId: raw.matchup?.batter?.id != null ? String(raw.matchup.batter.id) : null,
    eventType: raw.result.event ?? 'unknown',
    eventSubtype: raw.result.eventType ?? null,
    description: raw.result.description ?? '',
    homeScore,
    awayScore,
    scoreDiff: homeScore - awayScore,
    isScoring,
    rawEvent: raw as unknown as Record<string, unknown>,
  };
}

/** Batch variant — tracks running scores to flag scoring plays precisely. */
export function transformPlays(plays: MlbPlay[]): PlayByPlayRecord[] {
  let prev: { home: number; away: number } | undefined;
  return plays.map(play => {
    const record = transformPlay(play, prev);
    if (play.result.homeScore != null && play.result.awayScore != null) {
      prev = { home: play.result.homeScore, away: play.result.awayScore };
    }
    return record;
  });
}

/**
 * Single game-log split → PlayerGameLogRecord (workload fields computed in
 * transformPlayerGameLogs from the full season of splits).
 */
export function transformPlayerGameLog(
  raw: MlbGameLogSplit,
  playerExternalId: string
): PlayerGameLogRecord {
  return {
    sportId: MLB_SPORT_ID,
    playerExternalId,
    gameExternalId: raw.game?.gamePk != null ? String(raw.game.gamePk) : '',
    teamExternalId: raw.team?.id != null ? String(raw.team.id) : null,
    date: new Date(raw.date),
    minutesPlayed: null,
    distanceCovered: null,
    highIntensityEvents: null,
    backToBack: false,
    daysRestBefore: null,
    gamesLast7Days: null,
    gamesLast14Days: null,
    gamesLast21Days: null,
    // NBA-shaped columns don't map to MLB — the full split stat line lives in rawBoxScore.
    points: null,
    assists: null,
    rebounds: null,
    rawBoxScore: raw.stat as Record<string, unknown>,
  };
}

/** Batch game-log transformer — computes workload windows from the player's season. */
export function transformPlayerGameLogs(
  splits: MlbGameLogSplit[],
  playerExternalId: string
): PlayerGameLogRecord[] {
  const sorted = [...splits].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map(s => new Date(s.date));
  const workloads = computeWorkloads(dates);
  return sorted.map((split, i) => {
    const workload = workloads[i];
    return {
      ...transformPlayerGameLog(split, playerExternalId),
      backToBack: workload?.backToBack ?? false,
      daysRestBefore: workload?.daysRestBefore ?? null,
      gamesLast7Days: workload?.gamesLast7Days ?? null,
      gamesLast14Days: workload?.gamesLast14Days ?? null,
      gamesLast21Days: workload?.gamesLast21Days ?? null,
    };
  });
}
