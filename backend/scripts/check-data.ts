import { prisma } from '../src/db/client.js';

async function main(): Promise<void> {
  const sample = await prisma.coachDecisions.findMany({
    where: { sportId: 2 },
    take: 5,
    select: {
      id: true,
      decisionType: true,
      evChosen: true,
      evBest: true,
      isOptimal: true,
      outcomeSuccess: true,
    },
  });
  console.log('sample:', JSON.stringify(sample));

  const counts = await prisma.coachDecisions.groupBy({
    by: ['isOptimal'],
    where: { sportId: 2 },
    _count: { _all: true },
  });
  console.log('byOptimal:', JSON.stringify(counts));

  const evaluated = await prisma.coachDecisions.count({
    where: { sportId: 2, evBest: { not: 0 } },
  });
  console.log('withEvBestNonZero:', evaluated);

  const seasons = await prisma.coachDecisions.groupBy({
    by: ['season'],
    where: { sportId: 2 },
    _count: { _all: true },
  });
  console.log('seasons:', JSON.stringify(seasons));
}

main()
  .catch(err => {
    console.error('ERR', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
