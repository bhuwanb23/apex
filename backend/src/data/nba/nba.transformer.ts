import type {
  CoachDecisionRecord,
  GameRecord,
  PlayByPlayRecord,
  PlayerGameLogRecord,
  PlayerRecord,
  TeamRecord,
} from '../db.writer.js';
import { computeWorkloads } from '../workload.util.js';
import type { NBAGame, NBAPlayer, NbaCoachDecision, NBAStats, NBATeam, NbaPlay } from './nba.types.js';

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

/**
 * One ESPN-sourced NbaPlay → PlayByPlayRecord.
 * `prevScores` lets the batch caller compute isScoring from the actual score
 * change (the authoritative signal — ESPN's scoringPlay flag is a hint that
 * can lag on free throws). Team attribution: the play's own team first, then
 * the home/away side that actually scored (score delta), then null.
 */
export function transformPlay(
  raw: NbaPlay,
  prevScores?: { home: number; away: number }
): PlayByPlayRecord {
  const hasScores = raw.home_score != null && raw.away_score != null;
  const homeScore = hasScores ? (raw.home_score ?? 0) : 0;
  const awayScore = hasScores ? (raw.away_score ?? 0) : 0;
  let isScoring = raw.is_scoring;
  if (hasScores && prevScores) {
    isScoring = homeScore !== prevScores.home || awayScore !== prevScores.away;
  }

  let teamExternalId: string | null = raw.team;
  if (hasScores && prevScores && isScoring) {
    if (homeScore !== prevScores.home) teamExternalId = raw.home_team ?? teamExternalId;
    else if (awayScore !== prevScores.away) teamExternalId = raw.away_team ?? teamExternalId;
  }

  return {
    sportId: NBA_SPORT_ID,
    eventNumber: raw.play_id,
    period: raw.period ?? 0,
    clock: raw.clock,
    eventTimeSeconds: raw.event_time_seconds,
    teamExternalId,
    playerExternalId: null,
    eventType: raw.event_type,
    eventSubtype: null,
    description: raw.desc,
    homeScore,
    awayScore,
    scoreDiff: homeScore - awayScore,
    isScoring,
    rawEvent: raw as unknown as Record<string, unknown>,
  };
}

/** Batch variant — tracks running scores to flag scoring plays precisely. */
export function transformPlays(plays: NbaPlay[]): PlayByPlayRecord[] {
  let prev: { home: number; away: number } | undefined;
  return plays.map(play => {
    const record = transformPlay(play, prev);
    if (play.home_score != null && play.away_score != null) {
      prev = { home: play.home_score, away: play.away_score };
    }
    return record;
  });
}

// ---------------------------------------------------------------------------
// NBA Coach Decisions — extracted from play-by-play
// ---------------------------------------------------------------------------

/** Play types that represent coach decisions. */
const TIMEOUT_PATTERNS = /timeout/i;
const CHALLENGE_PATTERNS = /challenge|review/i;
const SUBSTITUTION_PATTERNS = /substitution|subbed in|subbed out|replaced/i;
const FOUL_PATTERNS = /foul|technical foul|flagrant/i;

/**
 * Extracts coach decisions from NBA play-by-play data.
 * These represent strategic choices by the coach: timeouts, challenges,
 * substitutions, and foul strategy.
 */
export function extractNbaDecisions(
  plays: NbaPlay[],
  gameId: string,
  homeTeamAbbr: string,
  awayTeamAbbr: string
): NbaCoachDecision[] {
  const decisions: NbaCoachDecision[] = [];
  const periodSeconds = 12 * 60; // 12 minutes per quarter

  for (const play of plays) {
    const desc = play.desc ?? '';
    const eventType = play.event_type ?? '';
    const period = play.period ?? 0;
    const clock = play.clock ?? '';

    let decisionType: string | null = null;
    let chosenAction = '';
    let outcome: string | null = null;

    // Timeout
    if (TIMEOUT_PATTERNS.test(desc) || TIMEOUT_PATTERNS.test(eventType)) {
      decisionType = 'timeout';
      chosenAction = 'timeout';
      // Determine which team called it from the description
      const teamMatch = /(\w+)\s+timeout/i.exec(desc);
      outcome = teamMatch ? teamMatch[1] : 'team';
    }
    // Challenge / Review
    else if (CHALLENGE_PATTERNS.test(desc) || CHALLENGE_PATTERNS.test(eventType)) {
      decisionType = 'challenge';
      chosenAction = 'challenge';
      outcome = /upheld|confirmed/i.test(desc) ? 'upheld' : /overturned/i.test(desc) ? 'overturned' : 'pending';
    }
    // Substitution
    else if (SUBSTITUTION_PATTERNS.test(desc) || SUBSTITUTION_PATTERNS.test(eventType)) {
      decisionType = 'lineup';
      chosenAction = 'substitution';
      outcome = desc;
    }
    // Foul strategy (technical, flagrant)
    else if (FOUL_PATTERNS.test(desc) && (/technical|flagrant/i.test(desc))) {
      decisionType = 'foul_strategy';
      chosenAction = /technical/i.test(desc) ? 'technical_foul' : 'flagrant_foul';
      outcome = /called/i.test(desc) ? 'called' : 'assessed';
    }

    if (!decisionType) continue;

    // Determine which team made the decision
    // The team that called the timeout/challenge is usually mentioned or inferred
    let teamAbbr = play.team ?? null;
    if (!teamAbbr) {
      // Infer from possession or description
      teamAbbr = desc.includes(homeTeamAbbr) ? homeTeamAbbr : desc.includes(awayTeamAbbr) ? awayTeamAbbr : null;
    }

    const homeScore = play.home_score ?? 0;
    const awayScore = play.away_score ?? 0;
    const scoreDiff = homeScore - awayScore;

    // Convert period + clock to game seconds elapsed
    const periodNum = period;
    const clockMatch = /^(\d+):(\d{2})$/.exec(clock);
    const clockSeconds = clockMatch ? Number(clockMatch[1]) * 60 + Number(clockMatch[2]) : 0;
    const gameTimeSeconds = (periodNum - 1) * periodSeconds + (periodSeconds - clockSeconds);

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

/** Transform NBA coach decision into CoachDecisionRecord format. */
export function transformDecision(raw: NbaCoachDecision): CoachDecisionRecord {
  const DECISION_TYPE_MAP: Record<string, string> = {
    timeout: 'timeout',
    challenge: 'challenge',
    lineup: 'lineup',
    foul_strategy: 'foul_strategy',
  };

  return {
    sportId: NBA_SPORT_ID,
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
