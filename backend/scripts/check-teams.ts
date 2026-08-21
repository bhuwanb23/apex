import { prisma } from '../src/db/client.js';

async function main() {
  const teams = await prisma.teams.findMany({
    where: { sportId: 7 },
    take: 5,
    select: { id: true, name: true, abbreviation: true, externalId: true },
  });
  console.log(JSON.stringify(teams, null, 2));
}

main().then(() => prisma.$disconnect());
