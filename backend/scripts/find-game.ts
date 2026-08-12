// Helper: find a recent final game for a sport: npx tsx scripts/find-game.ts mlb
import { prisma } from '../src/db/client.js';

async function main(): Promise<void> {
  const sport = (process.argv[2] ?? 'mlb').toLowerCase();
  const g = await prisma.games.findFirst({
    where: { sport: { abbreviation: sport }, status: 'final' },
    orderBy: { date: 'desc' },
    select: { id: true, externalId: true, date: true, homeScore: true, awayScore: true },
  });
  if (g) console.log(g.id);

  const sports = await prisma.sports.findMany({ select: { name: true, season: true } });
  console.log('SEASONS:', JSON.stringify(sports));

  const ma = await prisma.momentumAnalysis.findMany({
    select: { sportId: true, season: true, hazardCoefficient: true, pValue: true, isSignificant: true, gamesAnalyzed: true, computedAt: true },
  });
  console.log('MOMENTUM ROWS:', JSON.stringify(ma, null, 1));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exitCode = 1;
});
