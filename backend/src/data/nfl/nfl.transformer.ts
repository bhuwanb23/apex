import type {
  CoachDecisionRecord,
  GameRecord,
  PlayByPlayRecord,
  PlayerGameLogRecord,
  PlayerRecord,
  TeamRecord,
} from '../db.writer.js';
import { computeWorkloads } from '../workload.util.js';
import type { NflCoachDecision } from './nfl.decisions.js';
import { formatClock } from './nfl.decisions.js';
import type { EspnAthlete, EspnEvent, EspnTeam, NflPlay, NflSchedule } from './nfl.types.js';

/**
 * Cleans and normalizes raw NFL payloads (ESPN + nfl-data-py) into the
 * DB-ready records defined in db.writer.ts (sportId: 2 = NFL).
 */

const NFL_SPORT_ID = 2;

/** ESPN team → TeamRecord. */
export function transformTeam(raw: EspnTeam): TeamRecord {
  return {
    sportId: NFL_SPORT_ID,
    name: raw.displayName,
    abbreviation: raw.abbreviation,
    city: raw.location ?? '',
    conference: raw.conference?.name ?? null,
    division: raw.division?.name ?? null,
    externalId: raw.id,
    logoUrl: raw.logo ?? null,
  };
}

// NFL rosters arrive via ESPN or the Python microservice (nfl_data_py).
export function transformPlayer(raw: EspnAthlete, externalTeamId?: string | null): PlayerRecord {
  const fullName = raw.displayName ?? '';
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? raw.firstName ?? '';
  const lastName = nameParts.slice(1).join(' ') || raw.lastName || firstName;
  return {
    sportId: NFL_SPORT_ID,
    name: fullName || firstName,
    firstName,
    lastName,
    position: raw.position?.abbreviation ?? 'UNK',
    jerseyNumber: raw.jersey ?? null,
    age: null,
    heightInches: null,
    weightLbs: null,
    externalId: raw.id ?? '',
    externalTeamId: externalTeamId ?? null,
  };
}

// NFL head coaches arrive later via the Python microservice (nfl_data_py).
export function transformCoach(_raw: unknown): never {
  throw new Error('Not implemented: NFL coach transformation (Python microservice planned)');
}

/** ESPN scoreboard event → GameRecord (week arrives with the Python schedule). */
export function transformGame(raw: EspnEvent): GameRecord {
  const competition = raw.competitions?.[0];
  const home = competition?.competitors.find(c => c.homeAway === 'home');
  const away = competition?.competitors.find(c => c.homeAway === 'away');
  const homeScore = home?.score != null ? Number(home.score) : null;
  const awayScore = away?.score != null ? Number(away.score) : null;
  const state = raw.status?.type?.state; // "pre" | "in" | "post"
  const status = state === 'post' ? 'final' : state === 'in' ? 'live' : 'scheduled';
  let winner: string | null = null;
  if (status === 'final' && homeScore != null && awayScore != null) {
    winner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'tie';
  }
  return {
    sportId: NFL_SPORT_ID,
    date: new Date(raw.date),
    season: raw.season?.year != null ? String(raw.season.year) : '',
    gameType: raw.season?.type === 3 ? 'playoff' : 'regular',
    week: null,
    homeScore,
    awayScore,
    winner,
    status,
    externalId: raw.id,
    venue: competition?.venue?.fullName ?? null,
    homeTeamExternalId: home?.team.id ?? '',
    awayTeamExternalId: away?.team.id ?? '',
  };
}

/** nfl_data_py schedule row → GameRecord (has the week the ESPN path lacks). */
export function transformScheduleGame(raw: NflSchedule): GameRecord {
  const date = new Date(raw.game_date);
  return {
    sportId: NFL_SPORT_ID,
    date,
    season: String(date.getUTCFullYear()),
    gameType: 'regular',
    week: raw.week,
    homeScore: null,
    awayScore: null,
    winner: null,
    status: raw.finished ? 'final' : 'scheduled',
    externalId: raw.game_id,
    venue: null,
    homeTeamExternalId: raw.home_team,
    awayTeamExternalId: raw.away_team,
  };
}

/** Play types that are always scoring events. */
const SCORING_PLAY_TYPES = new Set([
  'FIELD_GOAL',
  'EXTRA_POINT',
  'XP_KICK',
  'TWO_POINT_CONVERSION',
]);

/** True when the play description shows a touchdown or safety. */
function descShowsScore(desc: string): boolean {
  return /TOUCHDOWN|FIELD GOAL|EXTRA POINT|SAFETY/i.test(desc);
}

/**
 * Converts a play's `game_seconds_remaining` (nfl_data_py / ESPN convention:
 * seconds LEFT in the game, counting DOWN from 3600) to elapsed seconds
 * (seconds since kickoff, counting UP). The schema documents
 * `eventTimeSeconds` as "Seconds elapsed in game" and the momentum model
 * sorts ascending by it — storing seconds-remaining makes Python process
 * NFL games backwards, breaking scorer attribution and the timeline.
 *
 * `maxRemaining` is the game's largest remaining value (the kickoff play);
 * elapsed = maxRemaining − remaining so overtime plays stay monotonic.
 */
export function toElapsedSeconds(
  remaining: number | null | undefined,
  maxRemaining: number
): number | null {
  if (remaining == null) return null;
  return Math.max(0, maxRemaining - remaining);
}

/**
 * nfl_data_py play → PlayByPlayRecord.
 * `prevScores` (optional) lets a batch caller compute isScoring from the
 * actual score change when absolute scores are available; without it, the
 * play type + description heuristics are used.
 */
export function transformPlay(
  raw: NflPlay,
  prevScores?: { home: number; away: number },
  maxRemaining = 3600
): PlayByPlayRecord {
  const hasScores = raw.home_score != null && raw.away_score != null;
  const homeScore = hasScores ? (raw.home_score ?? 0) : 0;
  const awayScore = hasScores ? (raw.away_score ?? 0) : 0;
  let isScoring = SCORING_PLAY_TYPES.has(raw.play_type ?? '') || descShowsScore(raw.desc);
  if (hasScores && prevScores) {
    isScoring = homeScore !== prevScores.home || awayScore !== prevScores.away;
  }
  return {
    sportId: NFL_SPORT_ID,
    eventNumber: raw.play_id,
    period: raw.qtr ?? 0,
    clock: formatClock(raw.game_seconds_remaining),
    eventTimeSeconds: toElapsedSeconds(raw.game_seconds_remaining, maxRemaining),
    teamExternalId: raw.posteam,
    playerExternalId: null,
    eventType: raw.play_type ?? 'unknown',
    eventSubtype: null,
    description: raw.desc,
    homeScore,
    awayScore,
    // nfl_data_py's score_differential is posteam − defteam perspective;
    // the ESPN fallback emits home − away (see nfl.types.ts).
    scoreDiff: raw.score_differential ?? homeScore - awayScore,
    isScoring,
    rawEvent: raw as unknown as Record<string, unknown>,
  };
}

/** Batch variant — tracks running scores to detect scoring plays precisely. */
export function transformPlays(plays: NflPlay[]): PlayByPlayRecord[] {
  let prev: { home: number; away: number } | undefined;
  // Per-game max seconds-remaining (kickoff) so elapsed stays monotonic.
  const maxRemaining = plays.reduce(
    (max, p) => Math.max(max, p.game_seconds_remaining ?? 0),
    0
  );
  return plays.map(play => {
    const record = transformPlay(play, prev, maxRemaining);
    if (play.home_score != null && play.away_score != null) {
      prev = { home: play.home_score, away: play.away_score };
    }
    return record;
  });
}

const DECISION_TYPE_MAP: Record<string, string> = {
  fourth_down: '4th_down',
  timeout: 'timeout',
  two_point_conversion: '2pt_conversion',
};

// Spec vocabulary for the CoachDecisions.chosenAction column
// ("go" / "punt" / "field_goal" / "timeout" / "two_point_attempt").
const ACTION_MAP: Record<string, string> = {
  go_for_it: 'go',
  punt: 'punt',
  field_goal: 'field_goal',
  timeout: 'timeout',
  two_point_attempt: 'two_point_attempt',
};

/** Coach decision observation → CoachDecisionRecord (EV fields filled by writer defaults). */
export function transformDecision(raw: NflCoachDecision): CoachDecisionRecord {
  return {
    sportId: NFL_SPORT_ID,
    gameExternalId: raw.gameId,
    teamExternalId: raw.team,
    decisionType: DECISION_TYPE_MAP[raw.decisionType] ?? raw.decisionType,
    period: raw.qtr ?? 0,
    clock: raw.clock,
    gameTimeSeconds: raw.gameTimeSeconds,
    scoreDiff: raw.scoreDiff ?? 0,
    gameContext: raw.context,
    chosenAction: ACTION_MAP[raw.chosenAction] ?? raw.chosenAction,
    outcome: raw.outcome,
    outcomeSuccess: raw.outcomeSuccess,
  };
}

/**
 * Transform NFL game logs from nfl_data_py or ESPN.
 * Accepts both snake_case (nfl_data_py) and camelCase (ESPN) formats.
 */
export function transformPlayerGameLogs(
  logs: Array<Record<string, unknown>>,
  playerExternalId: string
): PlayerGameLogRecord[] {
  if (!Array.isArray(logs) || logs.length === 0) return [];

  // Normalize fields from either snake_case (nfl_data_py) or camelCase (ESPN)
  const normalized = logs.map(log => ({
    game_id: (log.game_id ?? log.gameId ?? '') as string,
    game_date: (log.game_date ?? log.date ?? '') as string,
    team: (log.team ?? null) as string | null,
    completions: (log.completions ?? log.passingCompletions ?? 0) as number,
    passing_yards: (log.passing_yards ?? log.passingYards ?? 0) as number,
    passing_tds: (log.passing_tds ?? log.passingTouchdowns ?? 0) as number,
    interceptions: (log.interceptions ?? log.interceptionsCaught ?? 0) as number,
    carries: (log.carries ?? log.rushingAttempts ?? 0) as number,
    rushing_yards: (log.rushing_yards ?? log.rushingYards ?? 0) as number,
    rushing_tds: (log.rushing_tds ?? log.rushingTouchdowns ?? 0) as number,
    targets: (log.targets ?? log.receivingTargets ?? 0) as number,
    receptions: (log.receptions ?? log.passingCompletions ?? 0) as number,
    receiving_yards: (log.receiving_yards ?? log.receivingYards ?? 0) as number,
    receiving_tds: (log.receiving_tds ?? log.receivingTouchdowns ?? 0) as number,
    fumbles_lost: (log.fumbles_lost ?? log.fumblesLost ?? 0) as number,
    fantasy_points: (log.fantasy_points ?? 0) as number,
  }));

  const sorted = [...normalized].sort((a, b) => (a.game_date ?? '').localeCompare(b.game_date ?? ''));
  const dates = sorted.map(l => new Date(l.game_date || Date.now()));
  const workloads = computeWorkloads(dates);

  return sorted.map((log, i) => {
    const workload = workloads[i];
    return {
      sportId: NFL_SPORT_ID,
      playerExternalId,
      gameExternalId: log.game_id,
      teamExternalId: log.team,
      date: new Date(log.game_date || Date.now()),
      minutesPlayed: null,
      distanceCovered: null,
      highIntensityEvents: null,
      backToBack: workload?.backToBack ?? false,
      daysRestBefore: workload?.daysRestBefore ?? null,
      gamesLast7Days: workload?.gamesLast7Days ?? null,
      gamesLast14Days: workload?.gamesLast14Days ?? null,
      gamesLast21Days: workload?.gamesLast21Days ?? null,
      points: log.fantasy_points || null,
      assists: log.completions || null,
      rebounds: null,
      rawBoxScore: {
        completions: log.completions,
        passing_yards: log.passing_yards,
        passing_tds: log.passing_tds,
        interceptions: log.interceptions,
        carries: log.carries,
        rushing_yards: log.rushing_yards,
        rushing_tds: log.rushing_tds,
        targets: log.targets,
        receptions: log.receptions,
        receiving_yards: log.receiving_yards,
        receiving_tds: log.receiving_tds,
        fumbles_lost: log.fumbles_lost,
      },
    };
  });
}
