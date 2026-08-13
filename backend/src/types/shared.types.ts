/**
 * Shared TypeScript types used across all Phase 5 modules.
 * Defined once here, imported everywhere (routes, controllers, services, ML client).
 */

// ---------------------------------------------------------------------------
// Sports & roles
// ---------------------------------------------------------------------------

/**
 * API-facing sport abbreviations (uppercase, as used in route paths and the
 * Sports table `name` column). NOTE: NHL is schema-only for now — the data
 * fetchers cover NBA, NFL and MLB.
 */
export const SUPPORTED_SPORTS = ['NBA', 'NFL', 'MLB', 'NHL'] as const;
export type SportAbbreviation = (typeof SUPPORTED_SPORTS)[number];

/** Lowercase sport code — matches the Sports table `abbreviation` column ('nba'). */
export type SportCode = 'nba' | 'nfl' | 'mlb' | 'nhl';

/** 'NBA' | 'NFL' | ... → 'nba' | 'nfl' | ... for DB abbreviation lookups. */
export function toSportCode(sport: SportAbbreviation): SportCode {
  return sport.toLowerCase() as SportCode;
}

/**
 * User roles for story-mode tone adaptation.
 * (journalist is supported by the Python story endpoint, so it's included.)
 */
export const USER_ROLES = ['trainer', 'coach', 'analyst', 'fan', 'journalist'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Coaching decision categories understood by the Python EV model and the
 * CoachDecisions / DecisionEVScores tables.
 */
export const DECISION_TYPES = [
  '4th_down',
  'timeout',
  '2pt_conversion',
  'shot_selection',
  'foul_strategy',
] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

// ---------------------------------------------------------------------------
// Standard API response shapes (mirror src/utils/response.util.ts)
// ---------------------------------------------------------------------------

/** Success response — matches sendSuccess(). */
export interface ApiSuccessResponse<T> {
  success: true;
  status: number;
  data: T;
  message?: string;
  timestamp: string;
}

/**
 * Error response — matches sendError() and the Phase 8 error response
 * guarantee (AppError.toResponse()). The machine readable code lives in
 * `errorCode`; ValidationError responses additionally carry
 * `validationErrors: FieldError[]`.
 */
export interface ApiErrorResponse {
  success: false;
  status: number;
  message: string;
  errorCode: string;
  timestamp: string;
  validationErrors?: Array<{ field: string; message: string; value?: unknown }>;
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

/**
 * Paginated list response — matches sendPaginated(). Note it does NOT carry
 * status / message / timestamp (the util only emits success + data + meta).
 */
export interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  meta: PaginatedMeta;
}

/** ISO date range for query filters (as received from the frontend). */
export interface ApiDateRange {
  startDate: string;
  endDate: string;
}

// ---------------------------------------------------------------------------
// Reference-data DTOs (shared routes)
// ---------------------------------------------------------------------------

/** Sport row as returned by GET /api/sports. */
export interface SportInfo {
  id: number;
  name: SportAbbreviation;
  abbreviation: SportCode;
  isActive: boolean;
  season: string;
  config: Record<string, unknown>;
}

/** Team row as returned by GET /api/sports/:sport/teams. */
export interface TeamInfo {
  id: number;
  name: string;
  abbreviation: string;
  city: string;
  conference: string | null;
  division: string | null;
  logoUrl: string | null;
}

/** Player row (with team context) as returned by GET /api/sports/:sport/players. */
export interface PlayerInfo {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  position: string;
  jerseyNumber: string | null;
  age: number | null;
  teamId: number;
  teamName: string;
  teamAbbreviation: string;
  injuryStatus: string | null;
}
