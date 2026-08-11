import type {
  CoachRecord,
  GameRecord,
  PlayerGameLogRecord,
  PlayerRecord,
  TeamRecord,
} from '../db.writer.js';
import type { NBAGame, NBAPlayer, NBAStats, NBATeam } from './nba.types.js';

/**
 * Cleans and normalizes raw BallDontLie payloads into the DB-ready records
 * defined in db.writer.ts (sportId: 1 = NBA).
 */

// TODO(phase-3): map NBA team → TeamRecord (externalId = api id, sportId = 1)
export function transformTeam(_raw: NBATeam): TeamRecord {
  throw new Error('Not implemented: transformTeam');
}

// TODO(phase-3): map NBA player → PlayerRecord (team + sport resolution)
export function transformPlayer(_raw: NBAPlayer): PlayerRecord {
  throw new Error('Not implemented: transformPlayer');
}

// TODO(phase-3): map NBA game → GameRecord (home/away team resolution)
export function transformGame(_raw: NBAGame): GameRecord {
  throw new Error('Not implemented: transformGame');
}

// TODO(phase-3): map NBA box score → PlayerGameLogRecord (workload + raw box score)
export function transformPlayerGameLog(_raw: NBAStats): PlayerGameLogRecord {
  throw new Error('Not implemented: transformPlayerGameLog');
}

// TODO(phase-3): NBA has no coach data on the free tier — reserved for parity
export function transformCoach(_raw: unknown): CoachRecord {
  throw new Error('Not implemented: transformCoach');
}
