/**
 * AQX API client — the ONLY place the app talks to the backend.
 *
 * Every screen fetches through here; the app never calls the sports APIs or
 * runs calculations itself (integration plan: "app is purely the presentation
 * layer"). All responses are unwrapped from the backend's { success, data }
 * envelope. Base URL comes from EXPO_PUBLIC_API_URL (default localhost:8000).
 */

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Backend envelope: { success, status, data, timestamp }. */
interface ApiEnvelope<T> {
  success: boolean;
  status: number;
  data: T;
  message?: string;
  timestamp: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const REQUEST_TIMEOUT_MS = 8000;

/** Fetch with a timeout, unwraps the { success, data } envelope, throws ApiError. */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (!res.ok) {
      throw new ApiError(
        body?.message ?? `Request failed (${res.status})`,
        res.status,
        (body as { errorCode?: string } | null)?.errorCode
      );
    }
    if (!body || body.success === false || body.data === undefined) {
      throw new ApiError('Malformed API response');
    }
    return body.data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('Request timed out');
    }
    throw new ApiError(err instanceof Error ? err.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

function qs(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------------------
// Types — mirrors of the backend response shapes
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: 'ok' | 'degraded';
  environment: string;
  version: string;
  uptime: number;
  services: { database: string; cache: string; mlService: string };
}

export interface SportInfo {
  id: number;
  name: string;
  abbreviation: string;
  isActive: boolean;
  season: string;
  config: Record<string, unknown>;
}

export interface TeamInfo {
  id: number;
  name: string;
  abbreviation: string;
  city: string;
  conference?: string | null;
  division?: string | null;
  logoUrl?: string | null;
}

export interface PlayerInfo {
  id: number;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  jerseyNumber?: number | null;
  age?: number | null;
  teamId: number;
  teamName: string;
  teamAbbreviation: string;
  injuryStatus?: string | null;
}

export type RiskZone = 'red' | 'yellow' | 'green' | 'insufficient_data';

export interface RiskAlert {
  playerId: string;
  playerName: string;
  teamName: string;
  position?: string | null;
  riskScore: number | null;
  zone: RiskZone;
  triggerMetric?: string | null;
  explanation: string;
  /** Days the player has been in this zone (backend-computed streak). */
  daysInZone?: number;
}

export interface PlayerRiskProfile {
  playerId: string;
  playerName: string;
  teamId: number;
  teamName: string;
  position?: string | null;
  sport: string;
  riskScore: number | null;
  zone: RiskZone;
  triggerMetric?: string | null;
  minutesZScore?: number | null;
  distanceZScore?: number | null;
  intensityZScore?: number | null;
  backToBackFlag?: boolean;
  baselineMeanMinutes?: number | null;
  baselineStdMinutes?: number | null;
  explanation?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  computedAt: string;
}

export interface PlayerRiskResponse extends PlayerRiskProfile {
  gameLogSummary?: { gamesLast7Days: number; gamesLast21Days: number; avgMinutesLast21Days: number | null };
  history?: { computedAt: string; riskScore: number | null; zone: string; triggerMetric?: string | null }[];
}

export interface TeamRiskResponse {
  teamId: number;
  teamName: string;
  sport: string;
  summary: { redCount: number; yellowCount: number; greenCount: number };
  players: PlayerRiskProfile[];
  lastUpdated: string;
}

export interface RiskHistoryResponse {
  playerId: string;
  playerName: string;
  history: { computedAt: string; riskScore: number | null; zone: string; triggerMetric?: string | null }[];
}

export interface CoachScorecard {
  coachId: number;
  coachName: string;
  teamName: string;
  totalDecisions: number;
  optimalDecisions: number;
  evRate: number;
  avgEvLeft?: number | null;
  rank?: number | null;
  /** Direction vs the prior 30-day window — backend-computed. */
  trend?: 'up' | 'down' | 'same' | null;
}

export interface LeaderboardResponse {
  sport: string;
  season: string;
  decisionType: string;
  gameType: string;
  coaches: CoachScorecard[];
  generatedAt: string;
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean };
}

export interface CoachDecision {
  id: string;
  gameId: string;
  coachId: string;
  coachName: string;
  team: string;
  sport: string;
  date: string;
  opponent: string;
  type: string;
  situation: string;
  chosenAction: string;
  evChosen: number;
  evBest: number;
  isOptimal: boolean;
  outcome: string;
  outcomeSuccess: boolean;
  period: string;
  clock: string;
}

export interface MomentumVerdict {
  sport: string;
  season: string;
  verdictLabel: string;
  isSignificant: boolean;
  shortExplanation: string;
  statistics: {
    hazardCoefficient?: number | null;
    pValue?: number | null;
    confidenceIntervalLow?: number | null;
    confidenceIntervalHigh?: number | null;
    effectSize?: number | null;
    hazardRateChange?: number | null;
  };
  context: { gamesAnalyzed: number; playsAnalyzed: number; streakThreshold?: number | null };
  plainExplanation: string;
  computedAt: string;
}

export interface MomentumComparisonEntry {
  sport: string;
  verdictLabel: string;
  hazardCoefficient?: number | null;
  pValue?: number | null;
  effectSize?: number | null;
  isSignificant: boolean;
  shortExplanation: string;
}

export interface GameMomentumResponse {
  gameId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeScore?: number | null;
  awayScore?: number | null;
  timeline: { gameTimeSeconds: number; homeMomentum: number; awayMomentum: number }[];
  events: { gameTimeSeconds: number; description: string; team?: string | null; swing?: number | null }[];
  momentumShifts?: number | null;
  longestStreak?: string | null;
  momentumLeader?: string | null;
}

export interface TimeoutRecommendationResponse {
  situation: { consecutiveScores: number; scoreDiff: number; timeRemaining: number; period: number; timeoutsAvailable: number };
  recommendation: {
    shouldCallTimeout: boolean;
    stopProbabilityWith: number;
    stopProbabilityWithout: number;
    probabilityDiff: number;
    confidenceLevel: string;
    recommendationText: string;
  };
  basedOnSampleSize: number;
}

export interface SearchPlayersResponse {
  players: { playerId: number; playerName: string; position?: string | null; teamName: string; teamAbbreviation: string; sport: string; injuryStatus?: string | null }[];
}

export interface SearchTeamsResponse {
  teams: { teamId: number; teamName: string; abbreviation?: string | null; city?: string | null; sport: string }[];
}

export interface SearchCoachesResponse {
  coaches: { coachId: number; coachName: string; teamName: string; sport: string }[];
}

export interface SearchGamesResponse {
  games: {
    gameId: number;
    date: string;
    season: string;
    gameType: string;
    status: string;
    homeTeamName: string;
    awayTeamName: string;
    homeScore?: number | null;
    awayScore?: number | null;
    finalScore?: string | null;
    sport: string;
  }[];
}

export interface StoryResponse {
  module: string;
  sport: string;
  role: string;
  entityId?: string | null;
  entityName?: string | null;
  storyText: string;
  headlineText: string;
  toneLabel: string;
  generatedBy: string;
  keyMetrics?: Record<string, unknown> | null;
}

export interface CacheStatsResponse {
  memory: { keys: number; hits: number; misses: number; hitRate: number; ksize: number };
  sqlite: { totalEntries: number; validEntries: number; expiredEntries: number; byDataType: Record<string, number> };
}

export interface JobsStatusResponse {
  jobs: { jobName: string; description: string; isRunning: boolean; lastRunAt?: string | null; lastRunStatus?: string | null; nextRunAt?: string | null }[];
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const api = {
  // System
  health: () => apiFetch<HealthResponse>('/api/health'),

  // Sports / shared
  sports: () => apiFetch<{ sports: SportInfo[]; total: number }>('/api/sports'),
  teams: (sport: string) => apiFetch<{ sport: string; teams: TeamInfo[]; total: number }>(`/api/sports/${sport}/teams`),
  players: (sport: string, teamId?: number) =>
    apiFetch<PlayerInfo[]>(`/api/sports/${sport}/players${qs({ teamId, limit: 100 })}`),

  // Injury
  leagueAlerts: (sport: string, zone: 'red' | 'yellow' = 'red', limit = 20, recalculate = false) =>
    apiFetch<{ sport: string; zone: string; alerts: RiskAlert[]; totalAlerts: number; generatedAt: string }>(
      `/api/injury/alerts/${sport}${qs({ zone, limit, recalculate: recalculate || undefined })}`
    ),
  playerRisk: (playerId: string | number, recalculate = false) =>
    apiFetch<PlayerRiskResponse>(`/api/injury/player/${playerId}${qs({ recalculate })}`),
  teamRisk: (teamId: number, recalculate = false) =>
    apiFetch<TeamRiskResponse>(`/api/injury/team/${teamId}${qs({ recalculate: recalculate || undefined })}`),
  playerRiskHistory: (playerId: string | number, days = 60) =>
    apiFetch<RiskHistoryResponse>(`/api/injury/player/${playerId}/history${qs({ days })}`),

  // Decisions
  leaderboard: (sport: string, opts?: { season?: string; decisionType?: string; gameType?: string; limit?: number }) =>
    apiFetch<LeaderboardResponse>(`/api/decisions/coaches/${sport}${qs({ ...opts, limit: opts?.limit ?? 30 })}`),
  coachDecisions: (coachId: number, opts?: { season?: string; decisionType?: string; limit?: number }) =>
    apiFetch<{
      coach: CoachScorecard;
      decisions: CoachDecision[];
      processVsOutcome: { goodProcessGoodOutcome: number; goodProcessBadOutcome: number; badProcessGoodOutcome: number; badProcessBadOutcome: number };
    }>(
      `/api/decisions/coach/${coachId}${qs({ ...opts, limit: opts?.limit ?? 50 })}`
    ),
  gameDecisions: (gameId: number) =>
    apiFetch<{ gameId: number; homeCoach: { name: string; team: string }; awayCoach: { name: string; team: string }; decisions: CoachDecision[] }>(
      `/api/decisions/game/${gameId}`
    ),

  // Momentum
  momentumAnalysis: (sport: string, season?: string) =>
    apiFetch<MomentumVerdict>(`/api/momentum/analysis/${sport}${qs({ season })}`),
  gameMomentum: (gameId: number) => apiFetch<GameMomentumResponse>(`/api/momentum/game/${gameId}`),
  momentumComparison: (season?: string) => apiFetch<{ season: string; sports: MomentumComparisonEntry[]; generatedAt: string }>(`/api/momentum/comparison${qs({ season })}`),
  timeoutRecommendation: (sport: string, situation: { consecutiveScores: number; scoreDiff: number; timeRemaining: number; period: number; timeoutsAvailable: number }) =>
    apiFetch<TimeoutRecommendationResponse>(
      `/api/momentum/timeout/${sport}${qs({ ...situation, timeRemaining: Math.round(situation.timeRemaining) })}`
    ),

  // Search
  searchPlayers: (q: string, sport?: string, limit = 10) =>
    apiFetch<SearchPlayersResponse>(`/api/search/players${qs({ q, sport, limit })}`),
  searchTeams: (q: string, sport?: string) => apiFetch<SearchTeamsResponse>(`/api/search/teams${qs({ q, sport })}`),
  searchCoaches: (q: string, sport?: string) => apiFetch<SearchCoachesResponse>(`/api/search/coaches${qs({ q, sport })}`),
  searchGames: (opts?: { teamId?: number; sport?: string; season?: string; dateFrom?: string; dateTo?: string; limit?: number }) =>
    apiFetch<SearchGamesResponse>(`/api/search/games${qs({ ...opts, limit: opts?.limit ?? 10 })}`),

  // Story
  story: (module: string, sport: string, opts?: { role?: string; entityId?: string; season?: string }) =>
    apiFetch<StoryResponse>(`/api/story/${module}/${sport}${qs(opts)}`),

  // System / settings
  cacheStats: () => apiFetch<CacheStatsResponse>('/api/cache/stats'),
  jobsStatus: () => apiFetch<JobsStatusResponse>('/api/jobs/status'),
};
