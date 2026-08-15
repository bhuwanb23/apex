/**
 * One-off build script — exports REAL NFL data from the DB into:
 *   1. python_ml/app/data/training/wp_training.json   — WP logistic-regression training samples
 *   2. python_ml/app/data/nfl_local/plays.json        — local /nfl/plays fallback dataset
 *   3. python_ml/app/data/nfl_local/rosters.json      — local /nfl/rosters fallback dataset
 *   4. python_ml/app/data/nfl_local/schedule.json     — local /nfl/schedule fallback dataset
 *
 * Run: npx tsx scripts/build-training-data.ts  (from backend/)
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/db/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_ML = join(__dirname, '..', 'python_ml');
const TRAINING_DIR = join(PYTHON_ML, 'app', 'data', 'training');
const NFL_LOCAL_DIR = join(PYTHON_ML, 'app', 'data', 'nfl_local');

const NFL = 2;

interface GameRow {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  externalId: string;
  week: number | null;
  season: string;
}

interface PlayRow {
  gameId: number;
  eventNumber: number;
  period: number;
  eventType: string;
  rawEvent: Record<string, unknown> | null;
}

async function main(): Promise<void> {
  mkdirSync(TRAINING_DIR, { recursive: true });
  mkdirSync(NFL_LOCAL_DIR, { recursive: true });

  // Teams — externalId (ESPN id) → DB id
  const teams = await prisma.teams.findMany({
    where: { sportId: NFL },
    select: { id: true, externalId: true, name: true, abbreviation: true },
  });
  const extToDb = new Map<string, number>();
  for (const t of teams) extToDb.set(t.externalId, t.id);
  console.log(`NFL teams: ${teams.length}`);

  // Final games with outcomes
  const games = await prisma.games.findMany({
    where: { sportId: NFL, status: 'final' },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      externalId: true,
      week: true,
      season: true,
    },
  });
  const gameById = new Map<number, GameRow>(games.map(g => [g.id, g]));
  const usableGames = games.filter(
    g => g.homeScore != null && g.awayScore != null && g.homeScore !== g.awayScore
  );
  console.log(`final games: ${games.length} (usable for WP: ${usableGames.length})`);

  // All NFL plays (ordered per game)
  const plays = await prisma.playByPlay.findMany({
    where: { sportId: NFL },
    orderBy: [{ gameId: 'asc' }, { eventNumber: 'asc' }],
    select: { gameId: true, eventNumber: true, period: true, eventType: true, rawEvent: true },
  });
  console.log(`plays loaded: ${plays.length}`);

  const playsByGame = new Map<number, PlayRow[]>();
  for (const p of plays) {
    const list = playsByGame.get(p.gameId) ?? [];
    list.push(p);
    playsByGame.set(p.gameId, list);
  }

  const wpSamples: Array<Record<string, unknown>> = [];
  const localPlays: Array<Record<string, unknown>> = [];
  let skippedNoPosteam = 0;
  let skippedNoSeconds = 0;
  let skippedNoGame = 0;
  let skippedNoYardline = 0;

  for (const game of usableGames) {
    const gamePlays = playsByGame.get(game.id) ?? [];
    // Timeouts called per team per half — 3 per half (halves: qtr 1-2, 3-4; OT = half 3)
    const timeoutCounts = new Map<string, number>();
    const halfOf = (qtr: number): number => (qtr <= 2 ? 1 : qtr <= 4 ? 2 : 3);
    const timeoutsLeft = (teamDbId: number, qtr: number): number => {
      const key = `${teamDbId}:${halfOf(qtr)}`;
      return Math.max(0, 3 - (timeoutCounts.get(key) ?? 0));
    };

    for (const play of gamePlays) {
      const raw = play.rawEvent;
      if (!raw) continue;
      const posteamExt = raw.posteam;
      const isTimeoutEvent = raw.timeout === true || play.eventType === 'timeout';
      const timeoutTeamExt = raw.timeout_team;

      // Track timeout usage for the timeouts-remaining feature (NFL: 3/half)
      if (isTimeoutEvent) {
        const callerExt = timeoutTeamExt ?? posteamExt;
        const callerDb = callerExt != null ? extToDb.get(String(callerExt)) : undefined;
        if (callerDb != null) {
          const key = `${callerDb}:${halfOf(play.period)}`;
          timeoutCounts.set(key, (timeoutCounts.get(key) ?? 0) + 1);
        }
        continue; // timeout events are not WP samples
      }

      // Local /nfl/plays dataset — augment with season + week (nflfastR contract)
      const gameMeta = gameById.get(play.gameId);
      if (gameMeta) {
        localPlays.push({
          ...raw,
          season: Number(gameMeta.season),
          week: gameMeta.week ?? null,
        });
      }

      // WP sample — needs posteam, game-seconds, yardline
      if (posteamExt == null) {
        skippedNoPosteam++;
        continue;
      }
      const posteamDb = extToDb.get(String(posteamExt));
      if (posteamDb == null) {
        skippedNoPosteam++;
        continue;
      }
      const seconds = raw.game_seconds_remaining;
      if (typeof seconds !== 'number') {
        skippedNoSeconds++;
        continue;
      }
      const yardline = raw.yardline_100;
      if (typeof yardline !== 'number') {
        skippedNoYardline++;
        continue;
      }
      const qtr = typeof raw.qtr === 'number' ? raw.qtr : play.period || 1;
      const isHome = posteamDb === game.homeTeamId;
      const homeWon = (game.homeScore ?? 0) > (game.awayScore ?? 0);
      const won = isHome ? homeWon : !homeWon;

      wpSamples.push({
        score_diff: typeof raw.score_differential === 'number' ? raw.score_differential : 0,
        time_remaining: seconds,
        is_home: isHome ? 1 : 0,
        has_ball: 1,
        down: typeof raw.down === 'number' ? raw.down : 0,
        field_position: yardline,
        timeouts: timeoutsLeft(posteamDb, qtr),
        period: qtr,
        outcome: won ? 1 : 0,
      });
    }
  }

  console.log(`WP samples: ${wpSamples.length}`);
  console.log(`  skipped: no-posteam=${skippedNoPosteam} no-seconds=${skippedNoSeconds} no-yardline=${skippedNoYardline} no-game=${skippedNoGame}`);
  console.log(`local plays exported: ${localPlays.length}`);

  // Class balance check
  const wins = wpSamples.filter(s => s.outcome === 1).length;
  console.log(`WP class balance: ${wins} wins / ${wpSamples.length - wins} losses`);

  // --- Write WP training data ---
  writeFileSync(join(TRAINING_DIR, 'wp_training.json'), JSON.stringify(wpSamples, null, 1));
  console.log(`wrote ${join(TRAINING_DIR, 'wp_training.json')}`);

  // --- Write local NFL dataset ---
  writeFileSync(join(NFL_LOCAL_DIR, 'plays.json'), JSON.stringify(localPlays, null, 1));
  console.log(`wrote ${join(NFL_LOCAL_DIR, 'plays.json')}`);

  // Rosters — players + their team (nflfastR-ish shape)
  const players = await prisma.players.findMany({
    where: { sportId: NFL },
    select: { id: true, externalId: true, firstName: true, lastName: true, position: true, teamId: true },
  });
  const dbToExt = new Map<number, string>();
  for (const t of teams) dbToExt.set(t.id, t.externalId);
  const seasonYear = Number(usableGames[0]?.season) || 2025;
  const rosterRows = players
    .filter(p => p.teamId != null && dbToExt.has(p.teamId))
    .map(p => ({
      player_id: p.externalId,
      player_name: `${p.firstName} ${p.lastName}`.trim(),
      position: p.position,
      team_abbr: teams.find(t => t.id === p.teamId)?.abbreviation ?? null,
      season: seasonYear,
    }));
  writeFileSync(join(NFL_LOCAL_DIR, 'rosters.json'), JSON.stringify(rosterRows, null, 1));
  console.log(`wrote ${join(NFL_LOCAL_DIR, 'rosters.json')} (${rosterRows.length} rows)`);

  // Schedule — games in nflfastR-ish shape
  const scheduleRows = games.map(g => ({
    game_id: g.externalId,
    season: Number(g.season),
    week: g.week ?? null,
    home_team: dbToExt.get(g.homeTeamId) ?? null,
    away_team: dbToExt.get(g.awayTeamId) ?? null,
    home_score: g.homeScore,
    away_score: g.awayScore,
  }));
  writeFileSync(join(NFL_LOCAL_DIR, 'schedule.json'), JSON.stringify(scheduleRows, null, 1));
  console.log(`wrote ${join(NFL_LOCAL_DIR, 'schedule.json')} (${scheduleRows.length} rows)`);

  // Sanity — do raw game_ids match games.externalId? (router filter contract)
  const rawGameIds = new Set(localPlays.map(p => String(p.game_id)));
  const extIds = new Set(games.map(g => g.externalId));
  const overlap = [...rawGameIds].filter(id => extIds.has(id)).length;
  console.log(`game_id ↔ externalId overlap: ${overlap} / ${rawGameIds.size} raw ids`);
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
