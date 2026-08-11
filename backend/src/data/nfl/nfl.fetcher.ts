import axios, { type AxiosInstance } from 'axios';
import type { SportFetcher } from '../fetcher.manager.js';
import type { EspnScoreboardResponse, EspnTeam, NflPlay, NflSchedule } from './nfl.types.js';

const ESPN_NFL_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

/**
 * Pulls NFL data from two sources:
 * - ESPN public API (no key): teams + schedules — good enough for the MVP.
 * - Python microservice → nfl-data-py: detailed play-by-play + 4th-down context.
 */
export class NflFetcher implements SportFetcher {
  readonly sport = 'nfl';

  private readonly espn: AxiosInstance;

  constructor() {
    this.espn = axios.create({ baseURL: ESPN_NFL_BASE, timeout: 15_000 });
  }

  // TODO(phase-3): GET /teams via ESPN (or Python when rosters are needed)
  async fetchTeams(): Promise<EspnTeam[]> {
    throw new Error('Not implemented: NflFetcher.fetchTeams');
  }

  // TODO(phase-3): NFL rosters arrive later via the Python microservice
  async fetchPlayers(): Promise<unknown> {
    throw new Error('Not implemented: NflFetcher.fetchPlayers');
  }

  // TODO(phase-3): GET /scoreboard (schedules + results) via ESPN
  async fetchGames(): Promise<EspnScoreboardResponse['events']> {
    throw new Error('Not implemented: NflFetcher.fetchGames');
  }

  // TODO(phase-3): GET {PYTHON_ML_URL}/nfl/playbyplay via the microservice
  async fetchStats(): Promise<unknown> {
    throw new Error('Not implemented: NflFetcher.fetchStats');
  }

  // TODO(phase-3): detailed play-by-play via the microservice (nfl-data-py)
  async fetchPlayByPlay(_season: number, _week: number): Promise<NflPlay[]> {
    throw new Error('Not implemented: NflFetcher.fetchPlayByPlay');
  }

  // TODO(phase-3): full season schedule via the microservice (nfl-data-py)
  async fetchScheduleFull(_season: number): Promise<NflSchedule[]> {
    throw new Error('Not implemented: NflFetcher.fetchScheduleFull');
  }
}
