import { prisma } from '../src/db/client.js';
import { NbaFetcher } from '../src/data/nba/nba.fetcher.js';
import { transformPlays } from '../src/data/nba/nba.transformer.js';

async function main(): Promise<void> {
  // 1. Create a temp game row mirroring a real Finals game (ESPN event 401859963).
  const sa = await prisma.teams.findFirst({ where: { sportId: 1, abbreviation: 'SAS' } });
  const ny = await prisma.teams.findFirst({ where: { sportId: 1, abbreviation: 'NYK' } });
  console.log('SA team:', sa?.abbreviation ?? 'MISSING', '| NY team:', ny?.abbreviation ?? 'MISSING');
  if (!sa || !ny) return;

  const temp = await prisma.games.create({
    data: {
      sportId: 1,
      externalId: 'TEST-401859963',
      season: '2025-26',
      date: new Date('2026-06-04T00:30:00Z'),
      status: 'completed',
      gameType: 'playoff',
      homeTeamId: sa.id,
      awayTeamId: ny.id,
    },
  });
  console.log('temp game id:', temp.id);

  try {
    // 2. Run the real fetcher (resolves ESPN event id from date + abbreviations).
    const fetcher = new NbaFetcher();
    const plays = await fetcher.fetchPlayByPlay('TEST-401859963');
    console.log('mapped plays:', plays.length);
    const withTeam = plays.filter(p => p.team);
    console.log('plays with team:', withTeam.length);
    const scoring = plays.filter(p => p.is_scoring);
    console.log('scoring plays:', scoring.length);
    console.log('sample first 3 plays:');
    for (const p of plays.slice(0, 3)) console.log(' ', JSON.stringify(p));
    console.log('sample scoring plays:');
    for (const p of scoring.slice(0, 3)) console.log(' ', JSON.stringify(p));
    const t = plays.filter(p => /rebound|turnover|timeout|foul/i.test(p.event_type));
    console.log('sample non-shot events:');
    for (const p of t.slice(0, 3)) console.log(' ', JSON.stringify(p));

    // 3. Run the transformer and sanity-check the DB-ready records.
    const records = transformPlays(plays);
    console.log('transformed records:', records.length);
    const ts = records.filter(r => r.isScoring);
    console.log('transformed scoring records:', ts.length);
    for (const r of records.slice(0, 3)) console.log(' ', JSON.stringify(r));
    console.log('teamExternalId non-null:', records.filter(r => r.teamExternalId).length);
    console.log('eventTimeSeconds non-null:', records.filter(r => r.eventTimeSeconds != null).length);
    const times = records.map(r => r.eventTimeSeconds ?? 0);
    console.log('time range:', Math.min(...times), '->', Math.max(...times));
  } finally {
    await prisma.games.delete({ where: { id: temp.id } });
    console.log('temp game cleaned up');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
