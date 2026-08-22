import { prisma } from '../src/db/client.js';

async function main() {
  const nhl = await prisma.sports.findUnique({ where: { abbreviation: 'nhl' } });
  if (!nhl) return;
  const sample = await prisma.games.findMany({
    where: { sportId: nhl.id },
    orderBy: { date: 'desc' },
    take: 5,
    select: { id: true, externalId: true, date: true, season: true, status: true },
  });
  console.log('NHL newest games:', JSON.stringify(sample, null, 2));
  const seasons = await prisma.games.groupBy({ by: ['season'], where: { sportId: nhl.id }, _count: true });
  console.log('NHL games per season:', seasons.map(s => `${s.season}: ${s._count}`).join(', '));
}

main().then(() => prisma.$disconnect());
