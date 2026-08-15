import { prisma } from '../src/db/client.js';

async function main(): Promise<void> {
  const sa = await prisma.teams.findFirst({ where: { sportId: 1, abbreviation: 'SAS' } });
  const ny = await prisma.teams.findFirst({ where: { sportId: 1, abbreviation: 'NYK' } });
  if (!sa || !ny) {
    console.log('SAS/NYK teams missing — aborting');
    return;
  }

  const before = await prisma.sports.findUnique({ where: { id: 1 } });
  console.log('Sports row NBA season BEFORE:', before?.season);

  // A real synced game would carry the newer season.
  const temp = await prisma.games.create({
    data: {
      sportId: 1,
      externalId: 'TEST-SEASON',
      season: '2026-27',
      date: new Date('2026-06-04T00:30:00Z'),
      status: 'final',
      gameType: 'playoff',
      homeTeamId: sa.id,
      awayTeamId: ny.id,
    },
  });

  try {
    // Exact logic from syncSport's self-heal block.
    const newest = await prisma.games.findFirst({
      where: { sportId: 1 },
      orderBy: { season: 'desc' },
      select: { season: true },
    });
    console.log('newest season in games table:', newest?.season);

    if (newest && newest.season && newest.season !== before?.season) {
      await prisma.sports.update({
        where: { id: 1 },
        data: { season: newest.season },
      });
      const after = await prisma.sports.findUnique({ where: { id: 1 } });
      console.log('Sports row NBA season AFTER self-heal:', after?.season);
      // Revert — no real 2026-27 NBA games exist yet; leave the dev DB as-is.
      await prisma.sports.update({ where: { id: 1 }, data: { season: before?.season ?? '2024-25' } });
      const reverted = await prisma.sports.findUnique({ where: { id: 1 } });
      console.log('Sports row NBA season reverted to:', reverted?.season);
    } else {
      console.log('self-heal would not fire (no newer season found)');
    }
  } finally {
    await prisma.games.delete({ where: { id: temp.id } });
    console.log('temp game cleaned up');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
