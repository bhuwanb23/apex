// Helper: find a team id: npx tsx scripts/find-team.ts <name-substring>
import { prisma } from '../src/db/client.js';

async function main(): Promise<void> {
  const q = process.argv[2] ?? 'Padres';
  const teams = await prisma.teams.findMany({
    where: { name: { contains: q } },
    take: 3,
    select: { id: true, name: true, sport: { select: { name: true } } },
  });
  for (const t of teams) console.log(`${t.id}|${t.name}|${t.sport.name}`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exitCode = 1;
});
