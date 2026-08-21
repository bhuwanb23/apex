import { prisma } from '../src/db/client.js';

async function main(): Promise<void> {
  const sports = await prisma.sports.findMany({ select: { id: true, abbreviation: true, name: true, season: true } });
  console.log('=== SPORTS ===');
  sports.forEach(s => console.log(JSON.stringify(s)));

  const counts = await prisma.teams.groupBy({ by: ['sportId'], _count: true });
  console.log('=== TEAMS BY SPORT ===');
  for (const c of counts) {
    const sport = sports.find(s => s.id === c.sportId);
    console.log(`sportId=${c.sportId} (${sport?.abbreviation ?? '?'}): ${c._count} teams`);
  }

  const sampleNba = await prisma.teams.findMany({ where: { sport: { abbreviation: 'nba' } }, select: { id: true, abbreviation: true, name: true, externalId: true }, take: 3 });
  console.log('=== NBA SAMPLE (first 3) ===');
  sampleNba.forEach(t => console.log(`  id=${t.id} ext=${t.externalId} ${t.abbreviation} ${t.name}`));

  const sampleNfl = await prisma.teams.findMany({ where: { sport: { abbreviation: 'nfl' } }, select: { id: true, abbreviation: true, name: true, externalId: true }, take: 3 });
  console.log('=== NFL SAMPLE (first 3) ===');
  sampleNfl.forEach(t => console.log(`  id=${t.id} ext=${t.externalId} ${t.abbreviation} ${t.name}`));

  const sampleNhl = await prisma.teams.findMany({ where: { sport: { abbreviation: 'nhl' } }, select: { id: true, abbreviation: true, name: true, externalId: true }, take: 3 });
  console.log('=== NHL SAMPLE (first 3) ===');
  sampleNhl.forEach(t => console.log(`  id=${t.id} ext=${t.externalId} ${t.abbreviation} ${t.name}`));

  const id19 = await prisma.teams.findUnique({ where: { id: 19 }, select: { id: true, abbreviation: true, name: true, sportId: true } });
  const id32 = await prisma.teams.findUnique({ where: { id: 32 }, select: { id: true, abbreviation: true, name: true, sportId: true } });
  const id149 = await prisma.teams.findUnique({ where: { id: 149 }, select: { id: true, abbreviation: true, name: true, sportId: true } });
  console.log('=== LOOKUP id=19 ===', JSON.stringify(id19 ?? 'NOT FOUND'));
  console.log('=== LOOKUP id=32 ===', JSON.stringify(id32 ?? 'NOT FOUND'));
  console.log('=== LOOKUP id=149 ===', JSON.stringify(id149 ?? 'NOT FOUND'));
}

main().finally(() => prisma.$disconnect());
