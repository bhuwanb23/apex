import axios, { type AxiosInstance } from 'axios';
import { env } from '../../config/env.js';
import type { DateRange, SportFetcher } from '../fetcher.manager.js';
import type { NBAGame, NBAPlayer, NBAStats, NBATeam } from './nba.types.js';

const NBA_API_BASE = 'https://api.balldontlie.io/v1';

/**
 * Pulls raw NBA data from the BallDontLie API.
 * Free tier: 30 requests/minute — the fetcher.manager is responsible for
 * pacing calls. No play-by-play or tracking data on the free tier (MVP scope).
 */
export class NbaFetcher implements SportFetcher {
  readonly sport = 'nba';
  readonly apiName = 'balldontlie';

  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: NBA_API_BASE,
      // Free tier requires an API key (Bearer-style Authorization header)
      headers: env.BALLDONTLIE_API_KEY ? { Authorization: env.BALLDONTLIE_API_KEY } : undefined,
      timeout: 15_000,
    });
  }

  // TODO(phase-3): GET /teams — all NBA teams
  async fetchTeams(): Promise<NBATeam[]> {
    throw new Error('Not implemented: NbaFetcher.fetchTeams');
  }

  // TODO(phase-3): GET /players?team_ids[]= — all players, optionally by team
  async fetchPlayers(_teamId?: string): Promise<NBAPlayer[]> {
    throw new Error('Not implemented: NbaFetcher.fetchPlayers');
  }

  // TODO(phase-3): GET /games?seasons[]=&start_date=&end_date= — schedule + results
  async fetchGames(_season: string, _dateRange?: DateRange): Promise<NBAGame[]> {
    throw new Error('Not implemented: NbaFetcher.fetchGames');
  }

  // TODO(phase-3): GET /stats?player_ids[]=&seasons[]= — per-game box scores
  async fetchPlayerGameLogs(_playerId: string, _season: string): Promise<NBAStats[]> {
    throw new Error('Not implemented: NbaFetcher.fetchPlayerGameLogs');
  }

  // BallDontLie free tier has no play-by-play — permanent limitation, not a TODO.
  async fetchPlayByPlay(_gameId: string): Promise<unknown> {
    throw new Error('Play-by-play is not available for NBA on the BallDontLie free tier');
  }

  // TODO(phase-3): GET /players?team_ids[]= — same endpoint as fetchPlayers, filtered
  async fetchRosters(_teamId: string): Promise<NBAPlayer[]> {
    throw new Error('Not implemented: NbaFetcher.fetchRosters');
  }
}
