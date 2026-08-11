import axios, { type AxiosInstance } from 'axios';
import type { DateRange, SportFetcher } from '../fetcher.manager.js';
import type { EspnScoreboardResponse, EspnTeam, NflPlay } from './nfl.types.js';

const ESPN_NFL_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

/**
 * Pulls NFL data from two sources:
 * - ESPN public API (no key): teams + schedules — good enough for the MVP.
 * - Python microservice → nfl-data-py: detailed play-by-play + 4th-down context.
 */
export class NflFetcher implements SportFetcher {
  readonly sport = 'nfl';
  readonly apiName = 'espn';

  private readonly espn: AxiosInstance;

  constructor() {
    this.espn = axios.create({ baseURL: ESPN_NFL_BASE, timeout: 15_000 });
  }

  // TODO(phase-3): GET /teams via ESPN (or Python when rosters are needed)
  async fetchTeams(): Promise<EspnTeam[]> {
    throw new Error('Not implemented: NflFetcher.fetchTeams');
  }

  // TODO(phase-3): rosters via the Python microservice (nfl-data-py)
  async fetchPlayers(_teamId?: string): Promise<unknown> {
    throw new Error('Not implemented: NflFetcher.fetchPlayers');
  }

  // TODO(phase-3): GET /scoreboard?dates= via ESPN — schedules + results
  async fetchGames(
    _season: string,
    _dateRange?: DateRange
  ): Promise<EspnScoreboardResponse['events']> {
    throw new Error('Not implemented: NflFetcher.fetchGames');
  }

  // TODO(phase-3): per-player game logs via the Python microservice (nfl-data-py)
  async fetchPlayerGameLogs(_playerId: string, _season: string): Promise<unknown> {
    throw new Error('Not implemented: NflFetcher.fetchPlayerGameLogs');
  }

  // TODO(phase-3): GET {PYTHON_ML_URL}/nfl/playbyplay via the microservice
  async fetchPlayByPlay(_gameId: string): Promise<NflPlay[]> {
    throw new Error('Not implemented: NflFetcher.fetchPlayByPlay');
  }

  // TODO(phase-3): roster data via the Python microservice (nfl-data-py)
  async fetchRosters(_teamId: string): Promise<unknown> {
    throw new Error('Not implemented: NflFetcher.fetchRosters');
  }
}
