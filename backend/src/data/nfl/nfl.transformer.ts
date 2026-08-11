import type {
  CoachRecord,
  GameRecord,
  PlayerGameLogRecord,
  PlayerRecord,
  TeamRecord,
} from '../db.writer.js';
import type { EspnTeam, NflPlay, NflSchedule } from './nfl.types.js';

/**
 * Cleans and normalizes raw NFL payloads (ESPN + nfl-data-py) into the
 * DB-ready records defined in db.writer.ts (sportId: 2 = NFL).
 */

// TODO(phase-3): map ESPN team → TeamRecord (externalId = ESPN id)
export function transformTeam(_raw: EspnTeam): TeamRecord {
  throw new Error('Not implemented: transformTeam');
}

// TODO(phase-3): NFL rosters arrive later via the Python microservice
export function transformPlayer(_raw: unknown): PlayerRecord {
  throw new Error('Not implemented: transformPlayer');
}

// TODO(phase-3): NFL head coaches arrive later via the Python microservice
export function transformCoach(_raw: unknown): CoachRecord {
  throw new Error('Not implemented: transformCoach');
}

// TODO(phase-3): map schedule payload → GameRecord (week, gameType)
export function transformGame(_raw: NflSchedule): GameRecord {
  throw new Error('Not implemented: transformGame');
}

// TODO(phase-3): NFL box-score style logs arrive later (limited on ESPN)
export function transformPlayerGameLog(_raw: unknown): PlayerGameLogRecord {
  throw new Error('Not implemented: transformPlayerGameLog');
}

// TODO(phase-3): play-by-play rows feed PlayByPlay + CoachDecisions (4th down)
export function transformPlay(_raw: NflPlay): unknown {
  throw new Error('Not implemented: transformPlay');
}
