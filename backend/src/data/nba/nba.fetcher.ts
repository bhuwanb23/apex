import axios, { type AxiosInstance } from 'axios';
import { env } from '../../config/env.js';
import { prisma } from '../../db/client.js';
import type { DateRange, SportFetcher } from '../fetcher.manager.js';
import { toSeasonYear } from '../season.util.js';
import type {
  EspnNbaPlay,
  EspnNbaScoreboardResponse,
  EspnNbaScoringPlay,
  EspnNbaSummaryResponse,
  NBAGame,
  NBAPaginatedResponse,
  NBAPlayer,
  NBAStats,
  NBATeam,
  NbaPlay,
} from './nba.types.js';

const NBA_API_BASE = 'https://api.balldontlie.io/v1';
/** ESPN NBA public API (no key) — the play-by-play source (BallDontLie has none). */
const ESPN_NBA_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const PER_PAGE = 100; // API max
const REQUEST_TIMEOUT_MS = 10_000; // 10s per request (docs recommend a client timeout)

/** "13:09" → 789 seconds into the period. Null when the display is missing. */
function parseClockToSeconds(display: string | undefined): number | null {
  if (!display) return null;
  const match = /^(\d+):(\d{2})$/.exec(display.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Basketball has 4×12-minute quarters (720s) plus 5-minute overtimes (300s).
 * Converts period + clock to seconds ELAPSED (ascending), the convention the
 * momentum model expects (NFL uses seconds-remaining via nfl_data_py; MLB
 * uses elapsed at-bat time).
 */
function nbaElapsedSeconds(period: number | null, clockSeconds: number | null): number | null {
  if (period == null || clockSeconds == null) return null;
  const periodSeconds = period <= 4 ? 720 : 300;
  const base =
    period <= 4
      ? (period - 1) * 720
      : 4 * 720 + (period - 5) * 300;
  return Math.max(0, base + (periodSeconds - clockSeconds));
}

/**
 * Maps an ESPN basketball play to the event vocabulary used in
 * PlayByPlay.eventType. ESPN keeps the SAME type.text for made and missed
 * attempts ("Jump Shot" / "Driving Layup Shot") — the made/missed signal
 * lives in the play's `text` ("makes …" / "misses …") and in scoringPlay /
 * scoreValue, so we classify from both.
 */
function mapEspnBasketballEventType(play: EspnNbaPlay): string {
  const typeText = (play.type?.text ?? '').toLowerCase();
  const desc = (play.text ?? '').toLowerCase();
  if (!typeText && !desc) return 'unknown';
  const isMiss = /miss/i.test(desc);
  const isMake = /makes?|converts|scores/i.test(desc);

  if (typeText.includes('free throw')) {
    if (isMiss) return 'missed_free_throw';
    if (isMake) return 'made_free_throw';
    return 'free_throw';
  }
  // Made/missed shots: any shot-family type is a made shot unless the
  // description says it missed.
  const isShot =
    typeText.includes('shot') ||
    typeText.includes('layup') ||
    typeText.includes('dunk') ||
    typeText.includes('tip') ||
    typeText.includes('heave') ||
    typeText.includes('jumper');
  if (isMiss && isShot) return 'missed_shot';
  if (isShot) return 'made_shot';
  if (typeText.includes('rebound')) return 'rebound';
  if (typeText.includes('turnover')) return 'turnover';
  if (typeText.includes('timeout')) return 'timeout';
  if (typeText.includes('jump ball') || typeText === 'jumpball') return 'jump_ball';
  if (typeText.includes('substitution')) return 'substitution';
  if (typeText.includes('foul')) return 'foul';
  if (typeText.includes('travel') || typeText.includes('violation') || typeText.includes('goaltending')) return 'violation';
  if (typeText.includes('ejection')) return 'ejection';
  if (typeText.includes('challenge')) return 'challenge';
  if (typeText.includes('end period') || typeText.includes('end game')) return 'end_period';
  if (typeText.includes('start period')) return 'start_period';
  if (typeText.includes('block')) return 'block';
  if (typeText.includes('steal')) return 'steal';
  return typeText.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Shared axios client: single configured instance for all BallDontLie calls.
 * Auth per official docs — `Authorization: YOUR_API_KEY` (raw key, no Bearer).
 */
function createDefaultClient(): AxiosInstance {
  return axios.create({
    baseURL: NBA_API_BASE,
    headers: {
      // Only sent when a key is configured; live calls 401 without one.
      ...(env.BALLDONTLIE_API_KEY ? { Authorization: env.BALLDONTLIE_API_KEY } : {}),
      'Content-Type': 'application/json',
    },
    timeout: REQUEST_TIMEOUT_MS,
  });
}

/**
 * Pulls raw NBA data from the BallDontLie API — no transformation here,
 * fetch and return exactly what the API gives.
 *
 * Rate limiting + retries live in the fetcher.manager (pacing per bucket,
 * 429 → 60s wait, 5xx/network → exponential backoff, 3 attempts).
 */
export class NbaFetcher implements SportFetcher {
  readonly sport = 'nba';
  readonly apiName = 'balldontlie';

  private readonly client: AxiosInstance;
  private readonly espn: AxiosInstance;

  /** Clients are injectable for tests (mock servers) — the app uses the defaults. */
  constructor(client?: AxiosInstance, espn?: AxiosInstance) {
    this.client = client ?? createDefaultClient();
    this.espn = espn ?? axios.create({ baseURL: ESPN_NBA_BASE, timeout: 15_000 });
  }

  /** GET /teams — all NBA teams (single unpaginated response, ~30 rows). */
  async fetchTeams(): Promise<NBATeam[]> {
    return this.fetchAllPages<NBATeam>('/teams', {});
  }

  /** GET /players — paginated roster, optionally filtered by team. */
  async fetchPlayers(teamId?: string): Promise<NBAPlayer[]> {
    const params: Record<string, unknown> = {};
    const teamIdNum = Number(teamId);
    if (Number.isFinite(teamIdNum)) {
      params['team_ids[]'] = [teamIdNum];
    }
    return this.fetchAllPages<NBAPlayer>('/players', params);
  }

  /** GET /games — schedule + results for a season, optionally a date range. */
  async fetchGames(season: string, dateRange?: DateRange): Promise<NBAGame[]> {
    const params: Record<string, unknown> = {
      'seasons[]': [Number(toSeasonYear(season))],
    };
    if (dateRange) {
      params.start_date = dateRange.startDate.toISOString().slice(0, 10);
      params.end_date = dateRange.endDate.toISOString().slice(0, 10);
    }
    return this.fetchAllPages<NBAGame>('/games', params);
  }

  /** GET /stats — per-game box scores for one player across a season. */
  async fetchPlayerGameLogs(playerId: string, season: string): Promise<NBAStats[]> {
    const params: Record<string, unknown> = {
      'player_ids[]': [Number(playerId)],
      'seasons[]': [Number(toSeasonYear(season))],
    };
    return this.fetchAllPages<NBAStats>('/stats', params);
  }

  /**
   * Play-by-play via the ESPN public NBA summary API (BallDontLie has no
   * /plays endpoint below the GOAT tier). `gameId` is the BallDontLie game
   * id stored in Games.externalId — ESPN keys summaries on its own event id,
   * so we resolve it from the game's date + team abbreviations on the
   * scoreboard, then map the summary plays into NbaPlay[] shape.
   * Returns [] (not an error) when the game isn't on ESPN — the sync treats
   * it as zero plays for that game, not a failure.
   */
  async fetchPlayByPlay(gameId: string): Promise<NbaPlay[]> {
    // The game row gives us the ESPN event id AND the home/away abbreviations
    // needed for score-delta team attribution in the mapped plays.
    const game = await prisma.games.findFirst({
      where: { sportId: 1, externalId: gameId },
      include: {
        // Full name is the cross-source key — BallDontLie and ESPN disagree on
        // abbreviations (SAS vs SA, NYK vs NY) but share full team names.
        homeTeam: { select: { abbreviation: true, name: true } },
        awayTeam: { select: { abbreviation: true, name: true } },
      },
    });
    if (!game) return [];
    const homeAbbr = game.homeTeam?.abbreviation ?? null;
    const awayAbbr = game.awayTeam?.abbreviation ?? null;
    const homeName = game.homeTeam?.name ?? null;
    const awayName = game.awayTeam?.name ?? null;

    const eventId = await this.resolveEspnEventId(game, homeAbbr, awayAbbr, homeName, awayName);
    if (!eventId) return [];
    const res = await this.espn.get<EspnNbaSummaryResponse>('/summary', {
      params: { event: eventId },
    });
    // The summary header is the ONLY place ESPN exposes the numeric team id
    // that each play's top-level `team.id` refers to. Map it to the DB
    // abbreviation of the matching side via homeAway — ESPN's own
    // abbreviations (SA / NY) differ from BallDontLie's (SAS / NYK), so using
    // the side-aligned DB abbreviation makes every play's team resolvable by
    // the DB writer (no null teamIds).
    const idToAbbr = new Map<string, string>();
    for (const comp of res.data.header?.competitions?.[0]?.competitors ?? []) {
      if (!comp.team?.id) continue;
      if (comp.homeAway === 'home' && homeAbbr) idToAbbr.set(comp.team.id, homeAbbr);
      else if (comp.homeAway === 'away' && awayAbbr) idToAbbr.set(comp.team.id, awayAbbr);
      else if (comp.team.abbreviation) idToAbbr.set(comp.team.id, comp.team.abbreviation);
    }
    const plays = res.data.plays ?? [];
    // Legacy fallback — very old games lack a full plays list; map the
    // sparse scoring plays (every one of them is a scoring event).
    if (plays.length === 0) {
      return (res.data.scoringPlays ?? []).map((sp, i) =>
        this.mapScoringPlay(gameId, sp, i, homeAbbr, awayAbbr, idToAbbr)
      );
    }
    return plays
      // ESPN-only period markers ("End Period" / "End Game" / "Start Period")
      // aren't plays — skip them.
      .filter(p => !/^(start period|end period|end game)$/i.test((p.type?.text ?? '').trim()))
      .map((p, i) => this.mapSummaryPlay(gameId, p, i, homeAbbr, awayAbbr, idToAbbr))
      .sort((a, b) => a.play_id - b.play_id);
  }

  /** "san antonio spurs" → "sanantonio spurs" (case/space-insensitive match). */
  private normalizeTeamKey(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  /**
   * Game row + team identifiers → ESPN event id. Matches the game's date
   * (±1 day window to absorb timezone differences) and BOTH teams against the
   * ESPN scoreboard. Primary key is the normalized FULL NAME (BallDontLie
   * and ESPN disagree on abbreviations — SAS vs SA, NYK vs NY — but share
   * full team names); abbreviation is a secondary fallback. Returns null when
   * no event matches (e.g. sample/demo games that never existed on ESPN).
   */
  private async resolveEspnEventId(
    game: { date: Date },
    homeAbbr: string | null,
    awayAbbr: string | null,
    homeName: string | null,
    awayName: string | null
  ): Promise<string | null> {
    if (!homeAbbr && !homeName) return null;
    if (!awayAbbr && !awayName) return null;
    const homeKeys = new Set([
      ...(homeName ? [this.normalizeTeamKey(homeName)] : []),
      ...(homeAbbr ? [homeAbbr.toLowerCase()] : []),
    ]);
    const awayKeys = new Set([
      ...(awayName ? [this.normalizeTeamKey(awayName)] : []),
      ...(awayAbbr ? [awayAbbr.toLowerCase()] : []),
    ]);

    const gameDay = game.date.toISOString().slice(0, 10);
    const start = new Date(gameDay);
    start.setUTCDate(start.getUTCDate() - 1);
    const end = new Date(gameDay);
    end.setUTCDate(end.getUTCDate() + 1);
    const dates = `${this.espnDate(start)}-${this.espnDate(end)}`;

    const sb = await this.espn.get<EspnNbaScoreboardResponse>('/scoreboard', {
      params: { dates, limit: 300 },
    });
    const event = (sb.data.events ?? []).find(e => {
      const comps = e.competitions?.[0]?.competitors ?? [];
      if (comps.length < 2) return false;
      const a = comps[0] as { team?: { displayName?: string; abbreviation?: string } } | undefined;
      const b = comps[1] as { team?: { displayName?: string; abbreviation?: string } } | undefined;
      if (!a || !b) return false;
      const aKeys = new Set([
        ...(a.team?.displayName ? [this.normalizeTeamKey(a.team.displayName)] : []),
        ...(a.team?.abbreviation ? [a.team.abbreviation.toLowerCase()] : []),
      ]);
      const bKeys = new Set([
        ...(b.team?.displayName ? [this.normalizeTeamKey(b.team.displayName)] : []),
        ...(b.team?.abbreviation ? [b.team.abbreviation.toLowerCase()] : []),
      ]);
      const matchHome = [...homeKeys].some(k => aKeys.has(k) || bKeys.has(k));
      const matchAway = [...awayKeys].some(k => aKeys.has(k) || bKeys.has(k));
      return matchHome && matchAway;
    });
    return event?.id ?? null;
  }

  /** "2025-01-05" → "20250105" (ESPN dates= format). */
  private espnDate(d: Date): string {
    return d.toISOString().slice(0, 10).replaceAll('-', '');
  }

  /** One ESPN summary play → NbaPlay (team from the play's numeric team id). */
  private mapSummaryPlay(
    gameId: string,
    raw: EspnNbaPlay,
    index: number,
    homeAbbr: string | null,
    awayAbbr: string | null,
    idToAbbr: Map<string, string>
  ): NbaPlay {
    const period = raw.period?.number ?? null;
    const clockSeconds = parseClockToSeconds(raw.clock?.displayValue);
    return {
      game_id: gameId,
      play_id: Number(raw.sequenceNumber ?? raw.id) || index,
      desc: raw.text ?? '',
      period,
      clock: raw.clock?.displayValue ?? null,
      event_time_seconds: nbaElapsedSeconds(period, clockSeconds),
      // ESPN puts the play's team at the TOP level as a numeric id
      // (`team: { id: "18" }`) — resolve it via the header id→DB-abbreviation
      // map (side-aligned, so it matches BallDontLie's abbreviations).
      // Participants never carry team info on NBA summaries. When the id is
      // missing the transformer attributes scoring plays from the score delta.
      team: raw.team?.id ? (idToAbbr.get(raw.team.id) ?? null) : null,
      home_team: homeAbbr,
      away_team: awayAbbr,
      home_score: raw.homeScore ?? null,
      away_score: raw.awayScore ?? null,
      is_scoring: raw.scoringPlay ?? false,
      event_type: mapEspnBasketballEventType(raw),
    };
  }

  /** Legacy scoring-play fallback → NbaPlay (all are scoring events). */
  private mapScoringPlay(
    gameId: string,
    raw: EspnNbaScoringPlay,
    index: number,
    homeAbbr: string | null,
    awayAbbr: string | null,
    idToAbbr: Map<string, string>
  ): NbaPlay {
    const period = raw.period?.number ?? null;
    const clockSeconds = parseClockToSeconds(raw.clock?.displayValue);
    return {
      game_id: gameId,
      play_id: Number(raw.id) || index,
      desc: raw.text ?? '',
      period,
      clock: raw.clock?.displayValue ?? null,
      event_time_seconds: nbaElapsedSeconds(period, clockSeconds),
      team: raw.team?.abbreviation ?? (raw.team?.id ? (idToAbbr.get(raw.team.id) ?? null) : null),
      home_team: homeAbbr,
      away_team: awayAbbr,
      home_score: raw.homeScore ?? null,
      away_score: raw.awayScore ?? null,
      is_scoring: true,
      event_type: 'made_shot',
    };
  }

  /** GET /players?team_ids[]= — same endpoint as fetchPlayers, team-filtered. */
  async fetchRosters(teamId: string): Promise<NBAPlayer[]> {
    return this.fetchPlayers(teamId);
  }

  // BallDontLie has no coaching staff endpoint on any tier — fail fast.
  async fetchCoaches(_teamId?: string): Promise<unknown> {
    throw new Error('NBA coaches are not available via the BallDontLie API');
  }

  /**
   * Follows meta.next_cursor until null, combining every page into one array.
   * Endpoints that return a single unpaginated response (e.g. /teams has no
   * meta) stop after the first page.
   */
  private async fetchAllPages<T>(path: string, params: Record<string, unknown>): Promise<T[]> {
    return this.collectPages<T>(path, params, null, []);
  }

  /**
   * One paginated request, recursing while next_cursor is non-null.
   * Recursion (rather than a reassigned loop variable) keeps the cursor a
   * typed parameter and avoids TS circular-inference errors.
   */
  private async collectPages<T>(
    path: string,
    params: Record<string, unknown>,
    cursor: number | null,
    acc: T[]
  ): Promise<T[]> {
    const res = await this.client.get<NBAPaginatedResponse<T>>(path, {
      params: {
        ...params,
        per_page: PER_PAGE,
        ...(cursor !== null ? { cursor } : {}),
      },
    });
    const combined: T[] = [...acc, ...res.data.data];
    const next: number | null = res.data.meta?.next_cursor ?? null;
    if (next === null) return combined;
    return this.collectPages<T>(path, params, next, combined);
  }
}
