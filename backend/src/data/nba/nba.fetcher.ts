import axios, { type AxiosInstance } from 'axios';
import { env } from '../../config/env.js';
import type { NBAGame, NBAPlayer, NBAStats, NBATeam } from './nba.types.js';

const NBA_API_BASE = 'https://api.balldontlie.io/v1';

/**
 * Pulls raw NBA data from the BallDontLie API.
 * Free tier: 30 requests/minute — the fetcher.manager is responsible for
 * pacing calls. No play-by-play or tracking data on the free tier (MVP scope).
 */
export class NbaFetcher {
  readonly sport = 'nba';

  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: NBA_API_BASE,
      // Free tier requires an API key (Bearer-style Authorization header)
      headers: env.BALLDONTLIE_API_KEY ? { Authorization: env.BALLDONTLIE_API_KEY } : undefined,
      timeout: 15_000,
    });
  }

  // TODO(phase-3): GET /teams — returns all NBA teams
  async fetchTeams(): Promise<NBATeam[]> {
    throw new Error('Not implemented: NbaFetcher.fetchTeams');
  }

  // TODO(phase-3): GET /players — paginated roster with search params
  async fetchPlayers(): Promise<NBAPlayer[]> {
    throw new Error('Not implemented: NbaFetcher.fetchPlayers');
  }

  // TODO(phase-3): GET /games — schedule + results, filterable by dates/season
  async fetchGames(): Promise<NBAGame[]> {
    throw new Error('Not implemented: NbaFetcher.fetchGames');
  }

  // TODO(phase-3): GET /stats — box scores per player per game
  async fetchStats(): Promise<NBAStats[]> {
    throw new Error('Not implemented: NbaFetcher.fetchStats');
  }

  // TODO(phase-3): shared helper to follow meta.next_cursor pages, respecting the rate limit
}
