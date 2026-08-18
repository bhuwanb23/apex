import type {
  CoachDecisionRecord,
  GameRecord,
  PlayByPlayRecord,
  PlayerGameLogRecord,
  PlayerRecord,
  TeamRecord,
} from '../db.writer.js';
import type {
  NhlCoachDecision,
  NhlPlay,
  NhlPlayerGameLogEntry,
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

// ---------------------------------------------------------------------------
// NHL Coach Decisions — extracted from play-by-play
// ---------------------------------------------------------------------------

/** Play types that represent coach decisions in hockey. */
const TIMEOUT_PATTERNS = /timeout/i;
const GOALIE_PULL_PATTERNS = /pulls.*goalie|goalie.*pulled|empty net/i;
const LINE_CHANGE_PATTERNS = /line change|change of lines|defensive line/i;
const PENALTY_PATTERNS = /penalty|delay of game|too many men|bench minor/i;

/**
 * Extracts coach decisions from NHL play-by-play data.
 * These represent strategic choices by the coach: timeouts, goalie pulls,
 * line changes, and penalty strategy.
 */
export function extractNhlDecisions(
  plays: NhlPlay[],
  gameId: string,
  homeTeamAbbr: string,
  awayTeamAbbr: string
): NhlCoachDecision[] {
  const decisions: NhlCoachDecision[] = [];
  const periodSeconds = 20 * 60; // 20 minute periods

  for (const play of plays) {
    const desc = play.description ?? '';
    const eventType = play.details?.eventType ?? '';
    const period = play.period ?? 0;
    const clock = play.timeInPeriod ?? '';

    let decisionType: string | null = null;
    let chosenAction = '';
    let outcome: string | null = null;

    // Timeout
    if (TIMEOUT_PATTERNS.test(desc) || TIMEOUT_PATTERNS.test(eventType)) {
      decisionType = 'timeout';
      chosenAction = 'timeout';
      // Determine which team called it from the description
      const teamMatch = /(\w+)\s+timeout/i.exec(desc);
      outcome = teamMatch?.[1] ?? 'team';
    }
    // Goalie Pull
    else if (GOALIE_PULL_PATTERNS.test(desc)) {
      decisionType = 'goalie_pull';
      chosenAction = 'pull_goalie';
      outcome = /pulls/i.test(desc) ? 'pulled' : 'result';
    }
    // Line Change
    else if (LINE_CHANGE_PATTERNS.test(desc)) {
      decisionType = 'line_change';
      chosenAction = 'line_change';
      outcome = desc;
    }
    // Penalty Strategy (bench minor, too many men, delay of game)
    else if (PENALTY_PATTERNS.test(desc) && (/bench|too many|delay/i.test(desc))) {
      decisionType = 'penalty_strategy';
      chosenAction = /bench/i.test(desc) ? 'bench_minor' : 'penalty';
      outcome = /called/i.test(desc) ? 'called' : 'assessed';
    }

    if (!decisionType) continue;

    // Determine which team made the decision
    // The team that called the timeout/pulled goalie is usually mentioned
    const teamAbbr = play.teamAbbrev?.default ?? null;

    const details = play.details ?? {};
    const homeScore = details.homeScore ?? 0;
    const awayScore = details.awayScore ?? 0;
    const scoreDiff = homeScore - awayScore;

    // Convert period + clock to game seconds elapsed
    const clockMatch = /^(\d+):(\d{2})$/.exec(clock);
    const clockSeconds = clockMatch ? Number(clockMatch[1]) * 60 + Number(clockMatch[2]) : 0;
    const gameTimeSeconds = (period - 1) * periodSeconds + (periodSeconds - clockSeconds);

    decisions.push({
      gameId,
      team: teamAbbr ?? awayTeamAbbr,
      decisionType,
      period,
      clock,
      gameTimeSeconds,
      scoreDiff,
      context: { description: desc, eventType, period, clock },
      chosenAction,
      outcome,
      outcomeSuccess: null,
    });
  }

  return decisions;
}

/** Transform NHL coach decision into CoachDecisionRecord format. */
export function transformDecision(raw: NhlCoachDecision): CoachDecisionRecord {
  const DECISION_TYPE_MAP: Record<string, string> = {
    timeout: 'timeout',
    goalie_pull: 'goalie_pull',
    line_change: 'line_change',
    penalty_strategy: 'penalty_strategy',
  };

  return {
    sportId: NHL_SPORT_ID,
    gameExternalId: raw.gameId,
    teamExternalId: raw.team,
    decisionType: DECISION_TYPE_MAP[raw.decisionType] ?? raw.decisionType,
    period: raw.period,
    clock: raw.clock,
    gameTimeSeconds: raw.gameTimeSeconds,
    scoreDiff: raw.scoreDiff ?? 0,
    gameContext: raw.context,
    chosenAction: raw.chosenAction,
    outcome: raw.outcome,
    outcomeSuccess: raw.outcomeSuccess,
  };
}

/**
 * Transform NHL player game log entries into PlayerGameLogRecord format.
 * Used when the game logs are fetched directly from the NHL API.
 */
export function transformNhlPlayerGameLogs(
  entries: NhlPlayerGameLogEntry[],
  playerExternalId: string
): PlayerGameLogRecord[] {
  return entries.map(entry => ({
    sportId: NHL_SPORT_ID,
    playerExternalId,
    gameExternalId: entry.gamePk != null ? String(entry.gamePk) : '',
    teamExternalId: null,
    date: entry.date ? new Date(entry.date) : new Date(),
    minutesPlayed: entry.toi ? parseTimeOnIce(entry.toi) : null,
    distanceCovered: null,
    highIntensityEvents: null,
    backToBack: false,
    daysRestBefore: null,
    gamesLast7Days: null,
    gamesLast14Days: null,
    gamesLast21Days: null,
    points: entry.points ?? null,
    assists: entry.assists ?? null,
    rebounds: null, // NHL doesn't track rebounds the same way
    rawBoxScore: entry as unknown as Record<string, unknown>,
  }));
}

/** Parse NHL time on ice format "MM:SS" to decimal minutes. */
function parseTimeOnIce(toi: string): number | null {
  const parts = toi.split(':');
  if (parts.length !== 2) return null;
  const mins = Number(parts[0]);
  const secs = Number(parts[1]);
  if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null;
  return Math.round((mins + secs / 60) * 100) / 100;
}
