/**
 * Generates mock CoachDecisions + DecisionEVScores for NBA, MLB, NHL so the
 * coaches leaderboard is immediately populated. Idempotent: deletes existing
 * mock decisions per sport+season before re-inserting.
 *
 * Run with: npx tsx scripts/seed-mock-decisions.ts
 */
import { prisma } from '../src/db/client.js';
import { invalidateLeaderboard } from '../src/services/cache.invalidation.js';
import type { Prisma } from '../src/generated/prisma/client.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface SportConfig {
  code: string;           // sports.abbreviation
  sportId: number;        // resolved at runtime
  season: string;         // resolved from Sports table
  decisionTypes: string[];
  actionsForType: Record<string, string[]>;
}

const SPORTS: Omit<SportConfig, 'sportId' | 'season'>[] = [
  {
    code: 'nba',
    decisionTypes: ['timeout', 'shot_selection', 'foul_strategy'],
    actionsForType: {
      timeout: ['call_timeout', 'save_timeout'],
      shot_selection: ['three_pointer', 'mid_range', 'drive_to_basket'],
      foul_strategy: ['intentional_foul', 'play_defense'],
    },
  },
  {
    code: 'mlb',
    decisionTypes: ['intentional_walk', 'pitching_change'],
    actionsForType: {
      intentional_walk: ['intentional_walk', 'pitch_to_batter'],
      pitching_change: ['change_pitcher', 'keep_pitcher'],
    },
  },
  {
    code: 'nhl',
    decisionTypes: ['timeout', 'challenge'],
    actionsForType: {
      timeout: ['call_timeout', 'save_timeout'],
      challenge: ['challenge_play', 'accept_call'],
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function generateGameContext(sport: string, period: number): Record<string, unknown> {
  switch (sport) {
    case 'nba':
      return {
        quarter: period,
        scoreHome: randInt(70, 120),
        scoreAway: randInt(70, 120),
        timeRemaining: `${randInt(0, 11)}:${randInt(0, 59).toString().padStart(2, '0')}`,
        shotClock: randInt(5, 24),
      };
    case 'mlb':
      return {
        inning: period,
        half: period % 2 === 1 ? 'top' : 'bottom',
        balls: randInt(0, 3),
        strikes: randInt(0, 2),
        outs: randInt(0, 2),
        runnersOn: randInt(0, 3),
      };
    case 'nhl':
      return {
        period,
        timeRemaining: `${randInt(0, 19)}:${randInt(0, 59).toString().padStart(2, '0')}`,
        scoreHome: randInt(0, 5),
        scoreAway: randInt(0, 5),
        strength: pick(['5v5', '5v4', '4v5']),
      };
    default:
      return {};
  }
}

function maxPeriod(sport: string): number {
  switch (sport) {
    case 'nba': return 4;     // regular season: 4 quarters
    case 'mlb': return 18;    // 9 innings × 2 (top/bottom)
    case 'nhl': return 3;     // 3 periods
    default: return 4;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  for (const sportDef of SPORTS) {
    const sport = await prisma.sports.findUnique({ where: { abbreviation: sportDef.code } });
    if (!sport) {
      console.warn(`SKIP ${sportDef.code} — sport not seeded`);
      continue;
    }

    const config: SportConfig = { ...sportDef, sportId: sport.id, season: sport.season };
    console.log(`\n--- ${config.code.toUpperCase()} (sportId=${config.sportId}, season=${config.season}) ---`);

    // 1. Get coaches
    const coaches = await prisma.coaches.findMany({
      where: { sportId: config.sportId, isActive: true },
      select: { id: true, name: true, teamId: true },
    });
    if (coaches.length === 0) {
      console.warn(`  No coaches found for ${config.code} — skipping`);
      continue;
    }
    console.log(`  Coaches: ${coaches.length}`);

    // 2. Get games for this season
    const games = await prisma.games.findMany({
      where: { sportId: config.sportId, season: config.season },
      select: { id: true, homeTeamId: true, awayTeamId: true },
      orderBy: { id: 'asc' },
    });
    if (games.length === 0) {
      console.warn(`  No games found for ${config.code} season ${config.season} — skipping`);
      continue;
    }
    const sampleGames = games.slice(0, Math.min(30, games.length));
    console.log(`  Games: ${games.length} (using ${sampleGames.length} for decisions)`);

    // Index games by team so each coach's decisions land on their own games.
    const gamesByTeam = new Map<number, typeof sampleGames>();
    for (const g of sampleGames) {
      for (const tid of [g.homeTeamId, g.awayTeamId]) {
        const list = gamesByTeam.get(tid) ?? [];
        list.push(g);
        gamesByTeam.set(tid, list);
      }
    }

    // 3. Delete existing decisions for this sport+season (idempotent re-run)
    const deleted = await prisma.coachDecisions.deleteMany({
      where: { sportId: config.sportId, game: { season: config.season } },
    });
    console.log(`  Deleted ${deleted.count} existing decisions`);

    // 4. Generate CoachDecisions
    const decisions: Array<Prisma.CoachDecisionsCreateManyInput> = [];
    for (const coach of coaches) {
      const coachGames = gamesByTeam.get(coach.teamId);
      const pool = coachGames && coachGames.length > 0 ? coachGames : sampleGames;
      const numDecisions = randInt(4, 8);
      for (let i = 0; i < numDecisions; i++) {
        const game = pick(pool);
        const decisionType = pick(config.decisionTypes);
        const actions = config.actionsForType[decisionType] ?? ['action_a', 'action_b'];
        const chosenAction = pick(actions);
        const period = randInt(1, maxPeriod(config.code));
        const scoreDiff = randInt(-15, 15);
        const evChosen = rand(0.01, 0.12);
        const evBest = evChosen + rand(0.0, 0.08);
        const evDifference = evBest - evChosen;
        const isOptimal = evDifference < 0.015;

        decisions.push({
          gameId: game.id,
          coachId: coach.id,
          sportId: config.sportId,
          decisionType,
          period,
          clock: `${randInt(0, 11)}:${randInt(0, 59).toString().padStart(2, '0')}`,
          gameTimeSeconds: rand(0, 2880),
          scoreDiff,
          winProbabilityBefore: rand(0.2, 0.8),
          gameContext: generateGameContext(config.code, period),
          chosenAction,
          evChosen,
          evBest,
          evDifference,
          isOptimal,
          alternativeActions: actions.reduce((acc, a) => {
            acc[a] = a === chosenAction ? evChosen : rand(0.01, 0.10);
            return acc;
          }, {} as Record<string, number>),
          outcome: pick(['success', 'failure', 'neutral']),
          outcomeSuccess: Math.random() > 0.4,
        });
      }
    }

    // Batch insert decisions
    const CHUNK = 500;
    for (let i = 0; i < decisions.length; i += CHUNK) {
      await prisma.coachDecisions.createMany({ data: decisions.slice(i, i + CHUNK) });
    }
    console.log(`  Created ${decisions.length} decisions`);

    // 5. Aggregate into DecisionEVScores
    // Delete existing scorecards for this sport+season
    await prisma.decisionEVScores.deleteMany({
      where: { sportId: config.sportId, season: config.season },
    });

    // Group decisions by (coachId, decisionType) and (coachId, 'all')
    type Acc = { total: number; optimal: number; evSum: number; computedAt: Date };
    const byType = new Map<string, Acc>();
    const byCoach = new Map<number, Acc>();

    const allDecisions = await prisma.coachDecisions.findMany({
      where: { sportId: config.sportId, game: { season: config.season } },
      select: { coachId: true, decisionType: true, isOptimal: true, evDifference: true, createdAt: true },
    });

    for (const d of allDecisions) {
      const typeKey = `${d.coachId}:${d.decisionType}`;
      const typeAcc = byType.get(typeKey) ?? { total: 0, optimal: 0, evSum: 0, computedAt: d.createdAt };
      typeAcc.total += 1;
      if (d.isOptimal) typeAcc.optimal += 1;
      typeAcc.evSum += d.evDifference;
      byType.set(typeKey, typeAcc);

      const coachAcc = byCoach.get(d.coachId) ?? { total: 0, optimal: 0, evSum: 0, computedAt: d.createdAt };
      coachAcc.total += 1;
      if (d.isOptimal) coachAcc.optimal += 1;
      coachAcc.evSum += d.evDifference;
      byCoach.set(d.coachId, coachAcc);
    }

    const computedAt = new Date();
    const scorecards: Array<Prisma.DecisionEVScoresCreateManyInput> = [];

    for (const [key, acc] of byType) {
      const [coachIdStr, decisionType] = key.split(':');
      scorecards.push({
        coachId: Number(coachIdStr),
        sportId: config.sportId,
        season: config.season,
        gameType: 'all',
        decisionType: decisionType ?? 'unknown',
        totalDecisions: acc.total,
        optimalDecisions: acc.optimal,
        evRate: acc.total > 0 ? (acc.optimal / acc.total) * 100 : 0,
        avgEvDifference: acc.total > 0 ? acc.evSum / acc.total : 0,
        totalEvLeft: acc.evSum,
        rank: null,
        computedAt,
      });
    }

    // 'all'/'all' aggregate per coach
    for (const [coachId, acc] of byCoach) {
      scorecards.push({
        coachId,
        sportId: config.sportId,
        season: config.season,
        gameType: 'all',
        decisionType: 'all',
        totalDecisions: acc.total,
        optimalDecisions: acc.optimal,
        evRate: acc.total > 0 ? (acc.optimal / acc.total) * 100 : 0,
        avgEvDifference: acc.total > 0 ? acc.evSum / acc.total : 0,
        totalEvLeft: acc.evSum,
        rank: null,
        computedAt,
      });
    }

    for (let i = 0; i < scorecards.length; i += CHUNK) {
      await prisma.decisionEVScores.createMany({ data: scorecards.slice(i, i + CHUNK) });
    }
    console.log(`  Created ${scorecards.length} scorecards`);

    // 6. Assign ranks for 'all'/'all' aggregate
    const allRows = await prisma.decisionEVScores.findMany({
      where: { sportId: config.sportId, season: config.season, decisionType: 'all', gameType: 'all' },
      orderBy: [{ evRate: 'desc' }, { totalDecisions: 'desc' }],
      select: { id: true },
    });
    for (let i = 0; i < allRows.length; i++) {
      await prisma.decisionEVScores.update({
        where: { id: allRows[i].id },
        data: { rank: i + 1 },
      });
    }
    console.log(`  Assigned ranks to ${allRows.length} coaches`);

    // Fresh leaderboards on next request — the 24h cache would otherwise
    // serve the pre-seed empty board.
    await invalidateLeaderboard(config.code.toUpperCase(), config.season);
  }

  console.log('\nDone!');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async err => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
