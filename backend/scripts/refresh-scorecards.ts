// Scorecard refresh runner (Step 11):
//   npx tsx scripts/refresh-scorecards.ts [sport]   (default: all active sports)
//
// Evaluates any unevaluated coaching decisions via the Python EV model and
// re-aggregates DecisionEVScores with ranks.
import { prisma } from '../src/db/client.js';
import { refreshCoachScorecard } from '../src/services/decisions.service.js';

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
    const started = Date.now();
    const abbr = sport.name as 'NBA' | 'NFL' | 'MLB';
    const result = await refreshCoachScorecard(abbr, sport.season);
    console.log(
      JSON.stringify({
        sport: sport.name,
        season: sport.season,
        ...result,
        seconds: ((Date.now() - started) / 1000).toFixed(1),
      })
    );
  }
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('SCORECARD REFRESH FAILED:', err);
  process.exitCode = 1;
});
