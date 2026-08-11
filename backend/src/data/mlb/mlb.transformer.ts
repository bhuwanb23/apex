import type { GameRecord, PlayerGameLogRecord, PlayerRecord, TeamRecord } from '../db.writer.js';
import type { MlbBoxscorePlayer, MlbScheduleGame, MlbTeam } from './mlb.types.js';

/**
 * Cleans and normalizes raw MLB Stats API payloads into the DB-ready records
 * defined in db.writer.ts (sportId: 3 = MLB).
 */

// TODO(phase-3): map MLB team → TeamRecord (externalId = MLB id)
export function transformTeam(_raw: MlbTeam): TeamRecord {
  throw new Error('Not implemented: transformTeam');
}

// TODO(phase-3): map roster/boxscore player → PlayerRecord
export function transformPlayer(_raw: MlbBoxscorePlayer): PlayerRecord {
  throw new Error('Not implemented: transformPlayer');
}

// TODO(phase-3): map schedule game → GameRecord (gameType from spring/regular)
export function transformGame(_raw: MlbScheduleGame): GameRecord {
  throw new Error('Not implemented: transformGame');
}

// TODO(phase-3): map boxscore batting/pitching lines → PlayerGameLogRecord
export function transformPlayerGameLog(_raw: MlbBoxscorePlayer): PlayerGameLogRecord {
  throw new Error('Not implemented: transformPlayerGameLog');
}
