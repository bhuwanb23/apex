import axios, { type AxiosInstance } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { DateRange, SportFetcher } from '../fetcher.manager.js';
import { toSeasonYear } from '../season.util.js';
import type {
  EspnAthlete,
  EspnDrivePlay,
  EspnEvent,
  EspnGameLogResponse,
  EspnRosterResponse,
  EspnScoreboardResponse,
  EspnSummaryResponse,
  EspnTeam,
  EspnTeamsResponse,
  NflPlay,
} from './nfl.types.js';

const ESPN_NFL_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const REGULAR_SEASON_TYPE = 2;

/** Play types that count as "going for it" on 4th down (must mirror nfl.decisions.ts). */
const GO_FOR_IT_TYPES = new Set(['run', 'pass', 'qb_kneel', 'qb_spike', 'sack']);

/** "13:09" → seconds into the period (789). Null when the display is missing. */
function parseClockToSeconds(display: string | undefined): number | null {
  if (!display) return null;
  const match = /^(\d+):(\d{2})$/.exec(display.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * nfl_data_py game_seconds_remaining convention: seconds left in the game,
 * counting down through four 900s quarters (Q4 0:00 → 0). Overtime isn't
 * modeled — clamped to 0. The ESPN fallback derives it from period + clock.
 */
function gameSecondsRemaining(period: number, clockSeconds: number): number {
  return Math.max(0, (4 - period) * 900 + clockSeconds);
}

/** Maps ESPN play-type text to the nfl_data_py vocabulary the decision extractor knows. */
function mapEspnPlayType(play: EspnDrivePlay): string | null {
  const text = play.type?.text?.toLowerCase() ?? '';
  if (!text) return null;
  if (text.includes('timeout')) return 'timeout';
  if (text.includes('two point')) {
    return text.includes('pass') ? 'two_point_pass' : 'two_point_rush';
  }
  if (text.includes('punt')) return 'punt';
  if (text.includes('field goal')) return 'field_goal';
  if (text.includes('sack')) return 'sack';
  if (text.includes('kneel')) return 'qb_kneel';
  if (text.includes('spike')) return 'qb_spike';
  if (text.includes('kickoff')) return text.includes('return') ? 'kickoff_return' : 'kickoff';
  // nfl_data_py reports interceptions as play_type 'pass' (separate flag) —
  // matching that keeps 4th-down interceptions classified as go-for-it.
  if (text.includes('interception')) return 'pass';
  if (text.includes('fumble')) return text.includes('pass') ? 'pass' : 'run';
  if (text.includes('penalty')) return 'penalty';
  if (text.includes('pass') || text.includes('completion') || text.includes('incompletion')) {
    return 'pass';
  }
  if (text.includes('rush') || text.includes('run')) return 'run';
  return 'unknown';
}

/** "TWO-POINT CONVERSION ATTEMPT … SUCCEEDS." → success/failure. */
function inferTwoPointResult(desc: string): string | null {
  if (/SUCCEEDS|IS GOOD|GOOD\./i.test(desc)) return 'success';
  if (/FAILS|NO GOOD|UNSUCCESSFUL|INCOMPLETE/i.test(desc)) return 'failure';
  return null;
}

/**
 * Pulls NFL data from two sources (both implemented, whichever is available):
 * - Approach B — ESPN public API (no key): teams, scoreboards, summaries, rosters.
 * - Approach A — Python microservice → nfl-data-py: full down-by-down play-by-play.
 *   fetchPlayByPlay tries Python first and falls back to ESPN scoring plays.
 */
export class NflFetcher implements SportFetcher {
  readonly sport = 'nfl';
  readonly apiName = 'espn';

  private readonly espn: AxiosInstance;
  private readonly python: AxiosInstance;

  /** Clients are injectable for tests (mock servers) — the app uses the defaults. */
  constructor(espn?: AxiosInstance, python?: AxiosInstance) {
    this.espn = espn ?? axios.create({ baseURL: ESPN_NFL_BASE, timeout: 15_000 });
    // Short timeout so the ESPN fallback is fast when the Python service is down.
    this.python = python ?? axios.create({ baseURL: env.PYTHON_ML_URL, timeout: 5_000 });
  }

  /** GET /teams — all 32 NFL teams (nested under sports[].leagues[].teams[].team). */
  async fetchTeams(): Promise<EspnTeam[]> {
    const res = await this.espn.get<EspnTeamsResponse>('/teams');
    const teams = res.data.sports?.[0]?.leagues?.[0]?.teams ?? [];
    return teams.map(t => t.team);
  }

  /** NFL has no all-players endpoint on ESPN — rosters are per team. */
  async fetchPlayers(teamId?: string): Promise<unknown> {
    if (!teamId) {
      throw new Error('NFL players require a teamId (roster) — use fetchRosters');
    }
    return this.fetchRosters(teamId);
  }

  /**
   * GET /scoreboard — schedule + results.
   * With a date range → dates=YYYYMMDD-YYYYMMDD. Without → the full regular
   * season span (Sep 1 of the season year → Feb 15 of the next year), which
   * works for historical seasons too (ESPN scoreboard has no season-year param).
   */
  async fetchGames(season: string, dateRange?: DateRange): Promise<EspnEvent[]> {
    if (dateRange) {
      return this.fetchScoreboard(this.espnDateParam(dateRange));
    }
    const startYear = Number(toSeasonYear(season));
    const span = `${startYear}0901-${startYear + 1}0215`;
    return this.fetchScoreboard(span);
  }

  /**
   * Approach A — POST {PYTHON_ML_URL}/nfl/plays via the microservice.
   * nfl-data-py pbp is season/week scoped; game_id narrows it server-side.
   */
  async fetchPlayByPlay(gameId: string): Promise<NflPlay[]> {
    try {
      const res = await this.python.post<{ plays: NflPlay[] }>('/nfl/plays', { game_id: gameId });
      return res.data.plays ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { gameId, error: message },
        'Python NFL plays unavailable — falling back to ESPN summary'
      );
      return this.fetchSummaryAsPlays(gameId);
    }
  }

  /**
   * Approach A, bulk form — POST /nfl/plays with the exact microservice
   * contract: season + optional week/team filters. This is the feed for
   * Module 2 (coach decision extraction).
   */
  async fetchSeasonPlays(season: string, week?: number, team?: string): Promise<NflPlay[]> {
    const body: Record<string, unknown> = { season: Number(toSeasonYear(season)) };
    if (week !== undefined) body.week = week;
    if (team) body.team = team;
    const res = await this.python.post<{ plays: NflPlay[] }>('/nfl/plays', body);
    return res.data.plays ?? [];
  }

  /** GET /teams/{teamId}/roster — active roster with positions and jersey numbers. */
  async fetchRosters(teamId: string): Promise<EspnAthlete[]> {
    const res = await this.espn.get<EspnRosterResponse>(`/teams/${teamId}/roster`);
    // ESPN nests athletes inside position groups: { position, items[] }
    return (res.data.athletes ?? []).flatMap(group => group.items ?? []);
  }

  /**
   * GET /athletes/{playerId}/gamelog — per-player game-by-game stats from ESPN.
   * Falls back to Python microservice if ESPN endpoint unavailable.
   */
  async fetchPlayerGameLogs(playerId: string, season: string): Promise<unknown[]> {
    const year = toSeasonYear(season);
    try {
      const res = await this.espn.get<EspnGameLogResponse>(`/athletes/${playerId}/gamelog`);
      // ESPN returns seasons[] → types[] → events[] — flatten to the season we want
      const seasons = res.data.seasons ?? [];
      const target = seasons.find(s => String(s.year) === year);
      const regularSeason = target?.types?.find(t => t.type === '02'); // 02 = regular season
      return (regularSeason?.events ?? []).map(event => ({
        ...event.stats,
        gameId: event.id,
        date: event.date,
        opponent: event.opponent,
        result: event.result,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ playerId, season, error: message }, 'ESPN game log unavailable');
      return [];
    }
  }

  // ESPN team pages don't expose coaching staff in the current API responses —
  // NFL coaches remain pending nfl_data_py (the Python microservice).
  async fetchCoaches(_teamId?: string): Promise<unknown> {
    throw new Error('NFL coaches are not available via the ESPN public API');
  }

  // -- Internal helpers ------------------------------------------------------

  private async fetchScoreboard(dates: string): Promise<EspnEvent[]> {
    const params: Record<string, unknown> = { seasontype: REGULAR_SEASON_TYPE, limit: 300 };
    if (dates) params.dates = dates;
    const res = await this.espn.get<EspnScoreboardResponse>('/scoreboard', { params });
    return res.data.events ?? [];
  }

  /**
   * Approach B — GET /summary?event={id}; maps the drive-by-drive play list
   * into full NflPlay[] shape. The summary exposes ~200 plays/game via
   * drives[] (down, distance, field position, per-play scores, timeouts) —
   * far richer than the legacy scoring-plays-only mapping, so coach decision
   * extraction and the momentum model get real data without nfl_data_py.
   */
  private async fetchSummaryAsPlays(gameId: string): Promise<NflPlay[]> {
    const res = await this.espn.get<EspnSummaryResponse>('/summary', {
      params: { event: gameId },
    });
    const drivePlays = [
      ...(res.data.drives?.previous ?? []),
      ...(res.data.drives?.current ?? []),
    ].flatMap(drive => drive.plays ?? []);

    // Legacy fallback — very old games lack drives; map scoring plays (sparse).
    if (drivePlays.length === 0) {
      return (res.data.scoringPlays ?? []).map(sp => ({
        game_id: gameId,
        play_id: Number(sp.id) || 0,
        desc: sp.text ?? '',
        down: null,
        ydstogo: null,
        yardline_100: null,
        play_type: 'score',
        yards_gained: null,
        posteam: sp.team?.id ?? null,
        defteam: null,
        score_differential: (sp.homeScore ?? 0) - (sp.awayScore ?? 0),
        home_score: sp.homeScore ?? null,
        away_score: sp.awayScore ?? null,
        game_seconds_remaining: null,
        qtr: sp.period?.number ?? null,
        fourth_down_converted: null,
        fourth_down_failed: null,
        timeout: false,
        timeout_team: null,
        two_point_conv_result: null,
      }));
    }

    // Home team id — used to orient score_differential as posteam − defteam.
    const homeTeamId =
      res.data.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')
        ?.team?.id ?? null;

    const plays = drivePlays
      // ESPN-only clock markers aren't plays — skip them (nfl_data_py never emits these).
      .filter(p => !/END (QUARTER|OF GAME)|Two-Minute Warning/i.test(p.text ?? ''))
      .map(play => this.mapSummaryPlay(gameId, play, homeTeamId))
      // sequenceNumber is monotonic across the game — chronological order.
      .sort((a, b) => a.play_id - b.play_id);

    this.inferFourthDownOutcomes(plays);
    return plays;
  }

  /** One ESPN drive play → NflPlay (down/ydstogo/yardline/scores/timeouts). */
  private mapSummaryPlay(
    gameId: string,
    raw: EspnDrivePlay,
    homeTeamId: string | null
  ): NflPlay {
    const start = raw.start ?? {};
    const posteam = start.team?.id ?? null;
    const isCoachTimeout = raw.type?.text === 'Timeout';
    const qtr = raw.period?.number ?? null;
    const clockSeconds = parseClockToSeconds(raw.clock?.displayValue);
    const homeScore = raw.homeScore ?? null;
    const awayScore = raw.awayScore ?? null;
    // posteam-perspective diff when the home team is known; else home − away.
    const posteamIsHome = homeTeamId != null && posteam === homeTeamId;
    const scoreDiff =
      homeScore != null && awayScore != null
        ? posteamIsHome || homeTeamId == null
          ? homeScore - awayScore
          : awayScore - homeScore
        : null;

    const isTwoPoint = raw.type?.text?.toLowerCase().includes('two point') ?? false;
    const desc = raw.text ?? '';

    return {
      game_id: gameId,
      play_id: parseInt(raw.sequenceNumber ?? '0', 10) || 0,
      desc,
      down: start.down != null && start.down > 0 ? start.down : null,
      ydstogo: start.distance != null && start.distance > 0 ? start.distance : null,
      // ESPN's yardsToEndzone is nfl_data_py's yardline_100 (dist from own end zone).
      yardline_100: start.yardsToEndzone ?? null,
      play_type: mapEspnPlayType(raw),
      yards_gained: raw.statYardage ?? null,
      posteam,
      defteam: null,
      score_differential: scoreDiff,
      home_score: homeScore,
      away_score: awayScore,
      game_seconds_remaining:
        clockSeconds != null && qtr != null ? gameSecondsRemaining(qtr, clockSeconds) : null,
      qtr,
      fourth_down_converted: null, // filled by inferFourthDownOutcomes
      fourth_down_failed: null,
      timeout: isCoachTimeout,
      // For coach timeouts the caller is the offense (teamParticipants[0]).
      timeout_team: isCoachTimeout ? (raw.teamParticipants?.[0]?.id ?? posteam) : null,
      two_point_conv_result: isTwoPoint ? inferTwoPointResult(desc) : null,
    };
  }

  /**
   * ESPN doesn't emit 4th-down conversion flags — infer them from the
   * sequence: a go-for-it 4th down followed by a 1st down for the SAME team
   * converted; followed by 1st down for the other team, it failed
   * (turnover on downs). A 4th-down touchdown counts as converted.
   */
  private inferFourthDownOutcomes(plays: NflPlay[]): void {
    for (let i = 0; i < plays.length; i++) {
      const play = plays[i];
      if (!play) continue;
      if (play.down !== 4 || !play.play_type || !GO_FOR_IT_TYPES.has(play.play_type)) {
        continue;
      }
      if (/TOUCHDOWN/i.test(play.desc)) {
        play.fourth_down_converted = true;
        play.fourth_down_failed = false;
        continue;
      }
      const next = plays[i + 1];
      if (!next || next.down !== 1) continue; // penalty/replay — leave unknown
      if (next.posteam === play.posteam) {
        play.fourth_down_converted = true;
        play.fourth_down_failed = false;
      } else {
        play.fourth_down_converted = false;
        play.fourth_down_failed = true;
      }
    }
  }

  /** "2024-25" / "2024" → "2024" (ESPN dates are YYYYMMDD). */
  private espnDateParam(range: DateRange): string {
    const start = range.startDate.toISOString().slice(0, 10).replaceAll('-', '');
    const end = range.endDate.toISOString().slice(0, 10).replaceAll('-', '');
    return `${start}-${end}`;
  }
}
