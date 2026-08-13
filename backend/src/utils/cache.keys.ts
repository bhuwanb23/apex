/**
 * Cache key system (Phase 7, Step 5).
 *
 * The single file that defines every cache key. Services import these builders
 * instead of interpolating key strings, so a format change happens in exactly
 * one place and the layer that writes a key can never drift apart from the
 * layer that reads it.
 *
 * Conventions (Step 3.3): lowercase segments, colon-separated, most specific
 * segment last, no spaces or special characters. Query values are normalized
 * (trimmed + lowercased) so the same search always maps to one key.
 *
 * Key families:
 *   memory cache (node-cache)      — search:…, teams:…, alerts:…, player:…,
 *                                    sport:config:…, ml:health
 *   SQLite cache (CacheMetadata)   — risk:…, leaderboard:…, momentum:…,
 *                                    timeout:…
 *   story logs (StoryLogs)         — story:…
 */

// ---------------------------------------------------------------------------
// Memory cache keys (Layer 1 — node-cache)
// ---------------------------------------------------------------------------

/** "search:players:{sport}:{query}" — e.g. search:players:NBA:lebr */
export function searchPlayersKey(sport: string, query: string): string {
  return `search:players:${sport}:${query.trim().toLowerCase()}`;
}

/** "search:teams:{sport}:{query}" — e.g. search:teams:NBA:lal */
export function searchTeamsKey(sport: string, query: string): string {
  return `search:teams:${sport}:${query.trim().toLowerCase()}`;
}

/** "teams:{sport}" — e.g. teams:NBA */
export function teamListKey(sport: string): string {
  return `teams:${sport}`;
}

/** "alerts:{sport}:{zone}" — e.g. alerts:NBA:red */
export function alertsKey(sport: string, zone: string): string {
  return `alerts:${sport}:${zone}`;
}

/** "player:info:{playerId}" — e.g. player:info:237 */
export function playerInfoKey(playerId: number | string): string {
  return `player:info:${playerId}`;
}

/** "sport:config:{sport}" — e.g. sport:config:NFL */
export function sportConfigKey(sport: string): string {
  return `sport:config:${sport}`;
}

/** "ml:health" — single well-known key for the Python service health probe. */
export function mlHealthKey(): string {
  return 'ml:health';
}

// ---------------------------------------------------------------------------
// SQLite cache keys (Layer 2 — CacheMetadata registry)
// ---------------------------------------------------------------------------

/** "risk:{playerId}" — e.g. risk:237 */
export function riskScoreKey(playerId: number | string): string {
  return `risk:${playerId}`;
}

/** "risk:team:{teamId}" — e.g. risk:team:19 */
export function teamRiskKey(teamId: number | string): string {
  return `risk:team:${teamId}`;
}

/**
 * "leaderboard:{sport}:{season}:{decisionType}[:{gameType}]" — e.g.
 * leaderboard:NBA:2024-25:4th_down:all. gameType is appended when provided
 * (the coach leaderboard is cached per gameType in memory); the SQLite
 * freshness registry keys on the three-part form.
 */
export function leaderboardKey(
  sport: string,
  season: string,
  decisionType: string,
  gameType?: string
): string {
  return gameType
    ? `leaderboard:${sport}:${season}:${decisionType}:${gameType}`
    : `leaderboard:${sport}:${season}:${decisionType}`;
}

/** "momentum:season:{sport}:{season}" — e.g. momentum:season:NBA:2024-25 */
export function momentumSeasonKey(sport: string, season: string): string {
  return `momentum:season:${sport}:${season}`;
}

/** "momentum:game:{gameId}" — e.g. momentum:game:1042 */
export function momentumGameKey(gameId: number | string): string {
  return `momentum:game:${gameId}`;
}

/** "timeout:{sport}:{scenarioKey}" — e.g. timeout:NBA:down-3-2min */
export function timeoutKey(sport: string, scenarioKey: string): string {
  return `timeout:${sport}:${scenarioKey}`;
}

/** "coach:{coachId}" — e.g. coach:1042 (coach decision drill-down, Step 8). */
export function coachDetailKey(coachId: number | string): string {
  return `coach:${coachId}`;
}

/** "momentum:comparison:{season}" — e.g. momentum:comparison:2024-25; missing
 *  season falls back to 'all' (multi-sport comparison panel, Step 8). */
export function momentumComparisonKey(season?: string | null): string {
  return `momentum:comparison:${season ?? 'all'}`;
}

// ---------------------------------------------------------------------------
// Story log keys (StoryLogs table)
// ---------------------------------------------------------------------------

/**
 * "story:{module}:{sport}:{role}:{entityId}:{season}" — e.g.
 * story:injury:NBA:fan:237:2024-25. Missing ids fall back to 'none' (the
 * momentum module has no entity), and the season segment is always present so
 * different seasons never share a cached narrative — this byte-for-byte
 * matches the key format the StoryLogs table already stores.
 */
export function storyKey(
  module: string,
  sport: string,
  role: string,
  entityId?: number | string | null,
  season?: string | null
): string {
  return `story:${module}:${sport}:${role}:${entityId ?? 'none'}:${season ?? 'none'}`;
}
