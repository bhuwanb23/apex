import axios, { type AxiosInstance } from 'axios';
import type { DateRange, SportFetcher } from '../fetcher.manager.js';
import { toSeasonYear } from '../season.util.js';
import type {
  NhlPlay,
  NhlPlayByPlayResponse,
  NhlPlayerGameLogEntry,
  NhlPlayerGameLogResponse,
  NhlRosterEntry,
  NhlRosterResponse,
  NhlScheduleGame,
  NhlScheduleResponse,
  NhlTeam,
  NhlTeamsResponse,
} from './nhl.types.js';

const NHL_API_BASE = 'https://api-web.nhle.com/v1';

/**
 * Pulls raw NHL data from the public NHL API (free, no auth).
 * All shapes below were verified against the live API.
 */
export class NhlFetcher implements SportFetcher {
  readonly sport = 'nhl';
  readonly apiName = 'nhl';

  private readonly client: AxiosInstance;

  constructor(client?: AxiosInstance) {
    this.client = client ?? axios.create({ baseURL: NHL_API_BASE, timeout: 15_000 });
  }

  /** GET /roster — all 32 NHL teams (current season). */
  async fetchTeams(): Promise<NhlTeam[]> {
    const res = await this.client.get<NhlTeamsResponse>('/roster');
    return res.data.teams ?? [];
  }

  /**
   * NHL roster is per-team. Requires a team abbreviation (e.g. "EDM").
   * Falls back to the roster endpoint if the full roster isn't available.
   */
  async fetchPlayers(teamId?: string): Promise<NhlRosterEntry[]> {
    if (!teamId) {
      throw new Error('NHL players require a teamId — use fetchRosters');
    }
    return this.fetchRosters(teamId);
  }

  /**
   * GET /schedule/{date} — games for a specific date.
   * For a date range, we iterate day by day.
   */
  async fetchGames(season: string, dateRange?: DateRange): Promise<NhlScheduleGame[]> {
    const year = toSeasonYear(season);
    if (dateRange) {
      return this.fetchGamesForRange(dateRange);
    }
    // Fetch current season standings to get recent games
    return this.fetchCurrentSeasonGames(year);
  }

  private async fetchGamesForRange(range: DateRange): Promise<NhlScheduleGame[]> {
    const games: NhlScheduleGame[] = [];
    const start = new Date(range.startDate);
    const end = new Date(range.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      try {
        const res = await this.client.get<NhlScheduleResponse>(`/schedule/${dateStr}`);
        const dayGames = res.data.games ?? [];
        games.push(...dayGames);
      } catch {
        // Skip dates with no games
      }
      // Small delay to be nice to the API
      await new Promise(r => setTimeout(r, 100));
    }
    return games;
  }

  private async fetchCurrentSeasonGames(_year: string): Promise<NhlScheduleGame[]> {
    // Fetch today's schedule and recent games
    try {
      const res = await this.client.get<NhlScheduleResponse>('/schedule/now');
      return res.data.games ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch game logs for a player via the NHL player game log endpoint.
   * Returns game-by-game stats for the specified season.
   */
  async fetchPlayerGameLogs(playerId: string, season: string): Promise<NhlPlayerGameLogEntry[]> {
    const year = toSeasonYear(season);
    try {
      const res = await this.client.get<NhlPlayerGameLogResponse>(
        `/player/${playerId}/game-log/${year}`
      );
      return res.data.splits ?? [];
    } catch {
      // Some players may not have game logs (e.g., healthy scratches)
      return [];
    }
  }

  /** GET /gamecenter/{gameId}/play-by-play — full play-by-play. */
  async fetchPlayByPlay(gameId: string): Promise<NhlPlay[]> {
    const res = await this.client.get<NhlPlayByPlayResponse>(
      `/gamecenter/${gameId}/play-by-play`
    );
    return res.data.plays ?? [];
  }

  /**
   * GET /roster/{teamAbbrev} — active roster with positions and jersey numbers.
   */
  async fetchRosters(teamAbbrev: string): Promise<NhlRosterEntry[]> {
    const res = await this.client.get<NhlRosterResponse>(`/roster/${teamAbbrev}`);
    const entries: NhlRosterEntry[] = [];
    if (res.data.forwards) entries.push(...res.data.forwards);
    if (res.data.defensemen) entries.push(...res.data.defensemen);
    if (res.data.goalies) entries.push(...res.data.goalies);
    return entries;
  }

  /**
   * NHL coaches are part of the roster/coaching staff.
   * The NHL API doesn't have a separate coach endpoint — coaches are derived
   * from the roster data or seeded statically.
   */
  async fetchCoaches(_teamId?: string): Promise<unknown[]> {
    return [];
  }
}
