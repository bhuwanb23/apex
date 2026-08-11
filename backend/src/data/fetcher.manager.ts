import { MlbFetcher } from './mlb/mlb.fetcher.js';
import { NbaFetcher } from './nba/nba.fetcher.js';
import { NflFetcher } from './nfl/nfl.fetcher.js';

/**
 * Common fetcher contract. Each sport fetcher implements these raw-data
 * pullers; return types narrow to the sport-specific raw types.
 */
export interface SportFetcher {
  readonly sport: string; // "nba" / "nfl" / "mlb"
  fetchTeams(): Promise<unknown>;
  fetchPlayers(): Promise<unknown>;
  fetchGames(): Promise<unknown>;
  fetchStats(): Promise<unknown>;
}

/**
 * Master coordinator: resolves the right fetcher per sport abbreviation and
 * is responsible for pacing (rate limits), retries and logging fetches.
 */
export class FetcherManager {
  private readonly registry: Map<string, SportFetcher>;

  constructor() {
    this.registry = new Map<string, SportFetcher>();
    this.register(new NbaFetcher());
    this.register(new NflFetcher());
    this.register(new MlbFetcher());
  }

  private register(fetcher: SportFetcher): void {
    this.registry.set(fetcher.sport, fetcher);
  }

  /** Returns the fetcher for a sport abbreviation, or throws if unsupported. */
  getFetcher(sportAbbreviation: string): SportFetcher {
    const fetcher = this.registry.get(sportAbbreviation);
    if (!fetcher) {
      throw new Error(`Unsupported sport: ${sportAbbreviation}`);
    }
    return fetcher;
  }

  getSupportedSports(): string[] {
    return [...this.registry.keys()];
  }
}

// Shared instance (import this, don't construct your own)
export const fetcherManager = new FetcherManager();
