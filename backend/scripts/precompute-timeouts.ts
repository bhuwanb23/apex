// Timeout precompute runner:
//   npx tsx scripts/precompute-timeouts.ts [sport]   (default: all active sports)
//
// Calls the Python /timeout/precompute endpoint (2250 scenarios per sport),
// then persists the returned rows into TimeoutRecommendations so the API
// serves instant cache-first recommendations.
import { prisma } from '../src/db/client.js';
import { momentumML } from '../src/ml/momentum.ml.js';
import type { TimeoutScenarioResult } from '../src/ml/momentum.ml.js';

const BATCH_SIZE = 100;

async function persistScenarios(sportId: number, scenarios: TimeoutScenarioResult[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < scenarios.length; i += BATCH_SIZE) {
    const batch = scenarios.slice(i, i + BATCH_SIZE);
    const ops = batch.map(s =>
      prisma.timeoutRecommendations.upsert({
        where: { sportId_scenarioKey: { sportId, scenarioKey: s.scenarioKey } },
        update: {
          consecutiveScores: s.consecutiveScores,
          scoreDiff: s.scoreDiff,
          timeRemaining: s.timeRemaining,
          period: s.period,
          shouldCallTimeout: s.shouldCallTimeout,
          stopProbabilityWith: s.stopProbabilityWith,
          stopProbabilityWithout: s.stopProbabilityWithout,
          probabilityDiff: s.probabilityDiff,
          recommendationText: s.recommendationText,
          confidenceLevel: s.confidenceLevel,
          computedAt: new Date(s.computedAt),
        },
        create: {
          sportId,
          scenarioKey: s.scenarioKey,
          consecutiveScores: s.consecutiveScores,
          scoreDiff: s.scoreDiff,
          timeRemaining: s.timeRemaining,
          period: s.period,
          shouldCallTimeout: s.shouldCallTimeout,
          stopProbabilityWith: s.stopProbabilityWith,
          stopProbabilityWithout: s.stopProbabilityWithout,
          probabilityDiff: s.probabilityDiff,
          recommendationText: s.recommendationText,
          confidenceLevel: s.confidenceLevel,
          computedAt: new Date(s.computedAt),
        },
      })
    );
    await prisma.$transaction(ops);
    written += batch.length;
  }
  return written;
}

async function main(): Promise<void> {
  const sportArg = process.argv[2]?.toLowerCase();
  const sports = await prisma.sports.findMany({ where: { isActive: true } });
  const targets = sportArg ? sports.filter(s => s.name.toLowerCase() === sportArg) : sports;

  if (targets.length === 0) {
    console.error(`No active sport matches '${sportArg}'`);
    process.exitCode = 1;
    return;
  }

  for (const sport of targets) {
    const abbr = sport.name.toLowerCase(); // Python expects 'nfl' | 'nba' | 'mlb'
    const started = Date.now();
    console.log(`PRECOMPUTE START: ${sport.name} (${abbr})`);
    const res = await momentumML.precomputeTimeouts(abbr);
    const written = await persistScenarios(sport.id, res.scenarios);
    const total = await prisma.timeoutRecommendations.count({ where: { sportId: sport.id } });
    console.log(
      JSON.stringify({
        sport: sport.name,
        computed: res.count,
        written,
        totalInTable: total,
        seconds: ((Date.now() - started) / 1000).toFixed(1),
      })
    );
  }
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('PRECOMPUTE FAILED:', err);
  process.exitCode = 1;
});
