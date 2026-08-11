import axios, { type AxiosInstance } from 'axios';
import type { SportFetcher } from '../fetcher.manager.js';
import type { MlbBoxscoreResponse, MlbPlay, MlbScheduleGame, MlbTeam } from './mlb.types.js';

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

/**
 * Pulls raw MLB data from the official MLB Stats API (free, no key).
 */
export class MlbFetcher implements SportFetcher {
  readonly sport = 'mlb';

  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({ baseURL: MLB_API_BASE, timeout: 15_000 });
  }

  // TODO(phase-3): GET /teams?sportId=1 — all MLB teams
  async fetchTeams(): Promise<MlbTeam[]> {
    throw new Error('Not implemented: MlbFetcher.fetchTeams');
  }

  // TODO(phase-3): roster players from /teams/{id}/roster
  async fetchPlayers(): Promise<unknown> {
    throw new Error('Not implemented: MlbFetcher.fetchPlayers');
  }

  // TODO(phase-3): GET /schedule — games for a season/date range
  async fetchGames(): Promise<MlbScheduleGame[]> {
    throw new Error('Not implemented: MlbFetcher.fetchGames');
  }

  // TODO(phase-3): box scores feed player game logs
  async fetchStats(): Promise<unknown> {
    throw new Error('Not implemented: MlbFetcher.fetchStats');
  }

  // TODO(phase-3): GET /game/{gamePk}/boxscore — per-player box scores
  async fetchBoxscore(_gamePk: number): Promise<MlbBoxscoreResponse> {
    throw new Error('Not implemented: MlbFetcher.fetchBoxscore');
  }

  // TODO(phase-3): GET /game/{gamePk}/feed/live — full play-by-play
  async fetchPlays(_gamePk: number): Promise<MlbPlay[]> {
    throw new Error('Not implemented: MlbFetcher.fetchPlays');
  }
}
