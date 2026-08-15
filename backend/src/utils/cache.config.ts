/**
 * Cache configuration (Phase 7, Step 2).
 *
 * The single place every cache TTL lives. Change a value here and it applies
 * across the whole app — no per-service constants drifting out of sync.
 *
 * Two-layer model (Step 1):
 *   Layer 1 — in-memory (node-cache): hot, frequently changing data
 *             (searches, alerts, sport config). Lost on restart.
 *   Layer 2 — SQLite (CacheMetadata registry + real data tables): computed
 *             results (risk scores, leaderboards, momentum). Survives restart.
 *
 * All values are SECONDS unless noted.
 */

// ---------------------------------------------------------------------------
// Layer 1 — in-memory cache TTLs
// ---------------------------------------------------------------------------
export const IN_MEMORY_TTL = {
  /** Player/team autocomplete results — 1 hour. */
  SEARCH_RESULTS: 3600,
  /** Team lists per sport — 24 hours (rosters change rarely). */
  TEAM_LISTS: 86400,
  /** Red/yellow/green risk alerts — 30 minutes. */
  ACTIVE_ALERTS: 1800,
  /** Per-sport config (decision types, scoring rules…) — 24 hours. */
  SPORT_CONFIG: 86400,
  /** Player basic info (name, team, position) — 24 hours. */
  PLAYER_BASIC_INFO: 86400,
  /** Python ML service health probe — 15 minutes. */
  ML_SERVICE_HEALTH: 900,
} as const;

// ---------------------------------------------------------------------------
// Layer 2 — SQLite cache TTLs (CacheMetadata)
// ---------------------------------------------------------------------------
export const SQLITE_TTL = {
  /** Injury risk scores — 6 hours. */
  RISK_SCORES: 21600,
  /** Coach leaderboards (EV scorecards) — 24 hours. */
  COACH_LEADERBOARD: 86400,
  /** Season-level momentum (Cox) analysis — 24 hours. */
  MOMENTUM_ANALYSIS: 86400,
  /** Generated story text — 1 hour. */
  STORY_TEXT: 3600,
  /** Per-game momentum timeline — 24 hours. */
  GAME_MOMENTUM: 86400,
  /** Coach decision drill-down — 1 hour (Step 8: coachDetailCacheMiddleware). */
  COACH_DETAIL: 3600,
  /** Timeout recommendations — 30 days (scenarios are static per game state). */
  TIMEOUT_RECOMMENDATIONS: 2592000,
  /** Whole-season data (raw plays, logs) — 7 days. */
  SEASON_DATA: 604800,
} as const;

// ---------------------------------------------------------------------------
// Stale-while-revalidate thresholds
// ---------------------------------------------------------------------------
/** After this age, a cached entry may be served stale while a background
 *  recompute refreshes it (docs: return stale data fast, refresh in place). */
export const STALE_WHILE_REVALIDATE = {
  /** Alerts recompute after 30 minutes of staleness. */
  ALERTS_STALE_AFTER: 1800,
  /** Leaderboards refresh after 12 hours of staleness. */
  LEADERBOARD_STALE_AFTER: 43200,
  /** Momentum analysis refreshes after 12 hours of staleness. */
  MOMENTUM_STALE_AFTER: 43200,
} as const;

// ---------------------------------------------------------------------------
// Cache data type enum — the canonical dataType values stored in CacheMetadata
// ---------------------------------------------------------------------------
export const CacheDataType = {
  PLAYER_LOGS: 'player_logs',
  RISK_SCORES: 'risk_scores',
  COACH_DECISIONS: 'coach_decisions',
  COACH_LEADERBOARD: 'coach_leaderboard',
  PLAY_BY_PLAY: 'play_by_play',
  MOMENTUM_ANALYSIS: 'momentum_analysis',
  GAME_MOMENTUM: 'game_momentum',
  STORY_TEXT: 'story_text',
  SEARCH_RESULTS: 'search_results',
  TEAM_DATA: 'team_data',
  PLAYER_DATA: 'player_data',
  /** Fetch-layer CacheMetadata dataTypes (fetcher.manager writes these). */
  TEAMS: 'teams',
  PLAYERS: 'players',
  GAMES: 'games',
  COACHES: 'coaches',
  TIMEOUT_RECOMMENDATIONS: 'timeout_recommendations',
  SPORT_CONFIG: 'sport_config',
  /** Whole-season data (raw plays, logs) — the doc gives it a 7-day SQLite TTL. */
  SEASON_DATA: 'season_data',
} as const;

/** Union type of every valid cache data type. */
export type CacheDataType = (typeof CacheDataType)[keyof typeof CacheDataType];

/** The documented SQLite TTL for each cache data type (types without a doc
 *  TTL — e.g. PLAY_BY_PLAY — are memory-tier or freshness-tracked, not
 *  long-lived SQLite entries, so they map to undefined). */
const SQLITE_TTL_BY_TYPE: Partial<Record<CacheDataType, number>> = {
  [CacheDataType.RISK_SCORES]: SQLITE_TTL.RISK_SCORES,
  [CacheDataType.COACH_LEADERBOARD]: SQLITE_TTL.COACH_LEADERBOARD,
  [CacheDataType.MOMENTUM_ANALYSIS]: SQLITE_TTL.MOMENTUM_ANALYSIS,
  [CacheDataType.STORY_TEXT]: SQLITE_TTL.STORY_TEXT,
  [CacheDataType.GAME_MOMENTUM]: SQLITE_TTL.GAME_MOMENTUM,
  [CacheDataType.TIMEOUT_RECOMMENDATIONS]: SQLITE_TTL.TIMEOUT_RECOMMENDATIONS,
  [CacheDataType.SEASON_DATA]: SQLITE_TTL.SEASON_DATA,
};

/** SQLite TTL for a data type, or undefined when the type has no long-lived
 *  SQLite entry (used by the SQLite cache layer when marking entries valid). */
export function sqliteTtlFor(dataType: CacheDataType): number | undefined {
  return SQLITE_TTL_BY_TYPE[dataType];
}
