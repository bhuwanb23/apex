/**
 * Search module types (Phase 5, Step 8).
 * Response DTOs for the autocomplete / filter endpoints.
 */
import type { SportAbbreviation } from './shared.types.js';

/** One player autocomplete result. */
export interface SearchPlayerResult {
  playerId: number;
  playerName: string;
  position: string;
  teamName: string;
  teamAbbreviation: string;
  sport: SportAbbreviation;
  injuryStatus: string | null;
}

/** One team autocomplete result (with sport context). */
export interface SearchTeamResult {
  teamId: number;
  teamName: string;
  abbreviation: string;
  city: string;
  conference: string | null;
  division: string | null;
  logoUrl: string | null;
  sport: SportAbbreviation;
}

/** One coach autocomplete result (decision module drill-down target). */
export interface SearchCoachResult {
  coachId: number;
  coachName: string;
  role: string;
  teamName: string;
  sport: SportAbbreviation;
}

/** One game result for replay / decision drill-down. */
export interface SearchGameResult {
  gameId: number;
  date: string; // ISO timestamp
  season: string;
  gameType: string;
  status: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  finalScore: string | null;
  sport: SportAbbreviation;
}
