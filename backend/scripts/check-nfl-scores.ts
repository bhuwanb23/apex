import { prisma } from '../src/db/client.js';

async function main() {
  const nfl = await prisma.sports.findUnique({ where: { abbreviation: 'nfl' } });
  if (!nfl) return;
  const rows = await prisma.decisionEVScores.findMany({
    where: { sportId: nfl.id, decisionType: 'all', gameType: 'all' },
    orderBy: [{ evRate: 'desc' }],
    take: 5,
    select: { coachId: true, season: true, totalDecisions: true, optimalDecisions: true },
  });
  console.log('NFL all/all rows:', JSON.stringify(rows, null, 2));

  const bySeason = await prisma.decisionEVScores.groupBy({
    by: ['season', 'decisionType', 'gameType'],
    where: { sportId: nfl.id },
    _count: true,
  });
  console.log('NFL scorecard groups:', JSON.stringify(bySeason, null, 2));
}

main().then(() => prisma.$disconnect());
