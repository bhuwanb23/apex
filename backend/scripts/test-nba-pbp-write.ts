import { prisma } from '../src/db/client.js';
import { NbaFetcher } from '../src/data/nba/nba.fetcher.js';
import { transformPlays } from '../src/data/nba/nba.transformer.js';
import { writePlayByPlay } from '../src/data/db.writer.js';

async function main(): Promise<void> {
  const sa = await prisma.teams.findFirst({ where: { sportId: 1, abbreviation: 'SAS' } });
  const ny = await prisma.teams.findFirst({ where: { sportId: 1, abbreviation: 'NYK' } });
  if (!sa || !ny) {
    console.log('SAS/NYK teams missing — aborting');
    return;
  }

  const temp = await prisma.games.create({
    data: {
      sportId: 1,
      externalId: 'TEST-401859963',
      season: '2025-26',
      date: new Date('2026-06-04T00:30:00Z'),
      status: 'final',
      gameType: 'playoff',
      homeTeamId: sa.id,
      awayTeamId: ny.id,
    },
  });
  console.log('temp game id:', temp.id);

  try {
    const fetcher = new NbaFetcher();
    const plays = await fetcher.fetchPlayByPlay('TEST-401859963');
    console.log('fetched plays:', plays.length);

    const records = transformPlays(plays);
    const written = await writePlayByPlay(records, temp.id);
    console.log('writePlayByPlay returned:', written);

    const rows = await prisma.playByPlay.findMany({
      where: { gameId: temp.id },
      select: { id: true, teamId: true, eventType: true, isScoring: true, eventTimeSeconds: true },
    });
    console.log('rows in DB:', rows.length);
    const withTeam = rows.filter(r => r.teamId != null);
    console.log('rows with resolved teamId:', withTeam.length);
    const scoring = rows.filter(r => r.isScoring);
    console.log('scoring rows:', scoring.length);
    console.log('sample scoring rows:');
    for (const r of scoring.slice(0, 5)) console.log(' ', JSON.stringify(r));
    console.log('sample non-scoring rows:');
    for (const r of rows.filter(x => !x.isScoring).slice(0, 3)) console.log(' ', JSON.stringify(r));
  } finally {
    await prisma.playByPlay.deleteMany({ where: { gameId: temp.id } });
    await prisma.games.delete({ where: { id: temp.id } });
    console.log('temp data cleaned up');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
