import { prisma } from '../src/db/client.js';

/**
 * Idempotent seed for the Sports master reference table (Table 1).
 * Run with: npm run db:seed   (safe to re-run — upserts by abbreviation)
 *
 * Each sport gets its full config per the schema contract in sports.prisma:
 *   decisionTypes   — decision categories for that sport (values for CoachDecisions.decisionType)
 *   dataSource      — which API fetcher supplies this sport's data
 *   momentumMetric  — what counts as a scoring event for the momentum / Cox hazard model
 *   workloadMetrics — which PlayerGameLogs workload fields feed injury-risk calculations
 */

interface SportSeed {
  name: string;
  abbreviation: string;
  season: string;
  isActive: boolean;
  config: {
    decisionTypes: string[];
    dataSource: string;
    momentumMetric: string;
    workloadMetrics: string[];
  };
}

const SPORTS: SportSeed[] = [
  {
    name: 'NBA',
    abbreviation: 'nba',
    // Current season — the Sports row's season drives every sync fetch and
    // season-filtered query. The sync coordinator also self-heals this value
    // to the newest season present in the games table after each run.
    season: '2026-27',
    isActive: true,
    config: {
      // Coach decisions the decision model can extract for basketball.
      decisionTypes: ['timeout', 'challenge', 'lineup', 'foul_strategy'],
      // BallDontLie API — matches the manager's 'balldontlie' rate-limit bucket.
      dataSource: 'balldontlie',
      // A scoring event in the play-by-play (any made basket / free throw).
      momentumMetric: 'made_shot',
      // Free tier has no tracking data, so distance/intensity are excluded.
      workloadMetrics: [
        'minutesPlayed',
        'backToBack',
        'daysRestBefore',
        'gamesLast7Days',
        'gamesLast14Days',
        'gamesLast21Days',
      ],
    },
  },
  {
    name: 'NFL',
    abbreviation: 'nfl',
    season: '2024',
    isActive: true,
    config: {
      // Exactly the decision types Step 5.3 extracts from play-by-play.
      decisionTypes: ['4th_down', 'timeout', '2pt_conversion'],
      // ESPN public API (direct from Node), with the Python microservice
      // as the play-by-play source — matches the 'espn' rate-limit bucket.
      dataSource: 'espn',
      // A scoring event = any score change (TD, FG, safety, 2pt conversion).
      momentumMetric: 'score',
      workloadMetrics: [
        'minutesPlayed',
        'backToBack',
        'daysRestBefore',
        'gamesLast7Days',
        'gamesLast14Days',
        'gamesLast21Days',
      ],
    },
  },
  {
    name: 'MLB',
    abbreviation: 'mlb',
    season: '2024',
    isActive: true,
    config: {
      // Manager decisions the model can score.
      decisionTypes: ['intentional_walk', 'challenge'],
      // Official MLB Stats API (no auth) — matches the 'mlb' rate-limit bucket.
      dataSource: 'mlb',
      // A scoring event = a run crossing the plate.
      momentumMetric: 'run',
      // Rest-based workload matters most for pitchers (innings, pitch counts live in rawBoxScore).
      workloadMetrics: [
        'backToBack',
        'daysRestBefore',
        'gamesLast7Days',
        'gamesLast14Days',
        'gamesLast21Days',
      ],
    },
  },
  {
    // Seeded so the momentum comparison panel shows all four sports the app
    // supports (the frontend SportId includes NHL). Now with a working sync
    // adapter using the public NHL API (api-web.nhle.com).
    name: 'NHL',
    abbreviation: 'nhl',
    season: '2024',
    isActive: true,
    config: {
      decisionTypes: ['timeout', 'challenge', 'line_change'],
      dataSource: 'nhle',
      momentumMetric: 'goal',
      workloadMetrics: [
        'backToBack',
        'daysRestBefore',
        'gamesLast7Days',
        'gamesLast14Days',
        'gamesLast21Days',
      ],
    },
  },
];

async function main(): Promise<void> {
  const results: { abbreviation: string; id: number; action: 'created' | 'updated' }[] = [];

  for (const sport of SPORTS) {
    const existing = await prisma.sports.findUnique({
      where: { abbreviation: sport.abbreviation },
    });
    const row = await prisma.sports.upsert({
      where: { abbreviation: sport.abbreviation },
      // On update, DON'T clobber `season` — the sync coordinator self-heals it
      // to the newest season present in the games table, and a re-seed must
      // not regress that to the seed's static value (e.g. 2024 → real 2026).
      update: {
        name: sport.name,
        isActive: sport.isActive,
        config: sport.config,
      },
      create: sport,
    });
    results.push({
      abbreviation: sport.abbreviation,
      id: row.id,
      action: existing ? 'updated' : 'created',
    });
  }

  console.log('Sports seed complete:');
  for (const r of results) {
    console.log(`  ${r.action.padEnd(7)} id=${r.id}  ${r.abbreviation}`);
  }
}

main()
  .catch(err => {
    console.error('Sports seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
