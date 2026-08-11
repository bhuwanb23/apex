import axios, { type AxiosInstance } from 'axios';
import type { DateRange, SportFetcher } from '../fetcher.manager.js';
import type { MlbPlay, MlbScheduleGame, MlbTeam } from './mlb.types.js';

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

/**
 * Pulls raw MLB data from the official MLB Stats API (free, no key).
 */
export class MlbFetcher implements SportFetcher {
  readonly sport = 'mlb';
  readonly apiName = 'mlb';

  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({ baseURL: MLB_API_BASE, timeout: 15_000 });
  }

  // TODO(phase-3): GET /teams?sportId=1 — all MLB teams
  async fetchTeams(): Promise<MlbTeam[]> {
    throw new Error('Not implemented: MlbFetcher.fetchTeams');
  }

  // TODO(phase-3): GET /teams/{teamId}/roster — active roster
  async fetchPlayers(_teamId?: string): Promise<unknown> {
    throw new Error('Not implemented: MlbFetcher.fetchPlayers');
  }

  // TODO(phase-3): GET /schedule?sportId=1&season=&startDate=&endDate=
  async fetchGames(_season: string, _dateRange?: DateRange): Promise<MlbScheduleGame[]> {
    throw new Error('Not implemented: MlbFetcher.fetchGames');
  }

  // TODO(phase-3): box scores feed per-player game logs (GET /game/{gamePk}/boxscore)
  async fetchPlayerGameLogs(_playerId: string, _season: string): Promise<unknown> {
    throw new Error('Not implemented: MlbFetcher.fetchPlayerGameLogs');
  }

  // TODO(phase-3): GET /game/{gamePk}/feed/live — full play-by-play
  async fetchPlayByPlay(_gameId: string): Promise<MlbPlay[]> {
    throw new Error('Not implemented: MlbFetcher.fetchPlayByPlay');
  }

  // TODO(phase-3): GET /teams/{teamId}/roster — active roster
  async fetchRosters(_teamId: string): Promise<unknown> {
    throw new Error('Not implemented: MlbFetcher.fetchRosters');
  }
}
