import { prisma } from '../src/db/client.js';
import { NbaFetcher } from '../src/data/nba/nba.fetcher.js';
import { transformPlays } from '../src/data/nba/nba.transformer.js';
import { writePlayByPlay } from '../src/data/db.writer.js';
import { computeAndStoreSeasonAnalysis } from '../src/services/momentum.service.js';

async function main(): Promise<void> {
  const sa = await prisma.teams.findFirst({ where: { sportId: 1, abbreviation: 'SAS' } });
  const ny = await prisma.teams.findFirst({ where: { sportId: 1, abbreviation: 'NYK' } });
  if (!sa || !ny) {
    console.log('SAS/NYK teams missing — aborting');
    return;
  }

  const sportRow = await prisma.sports.findUnique({ where: { id: 1 } });
  console.log('Sports row NBA season BEFORE:', sportRow?.season);

  const temp = await prisma.games.create({
    data: {
      sportId: 1,
      externalId: 'TEST-401859963',
      // Real synced games carry the NEW season — deliberately different from
      // the stale Sports-row seed to exercise the resolution fallback.
      season: '2026-27',
      date: new Date('2026-06-04T00:30:00Z'),
      status: 'final',
      gameType: 'playoff',
      homeTeamId: sa.id,
      awayTeamId: ny.id,
    },
  });

  try {
    const fetcher = new NbaFetcher();
    const plays = await fetcher.fetchPlayByPlay('TEST-401859963');
    console.log('fetched plays:', plays.length);
    await writePlayByPlay(transformPlays(plays), temp.id);

    const playsIn2026 = await prisma.playByPlay.count({
      where: { game: { sportId: 1, season: '2026-27' } },
    });
    const playsIn2024 = await prisma.playByPlay.count({
      where: { game: { sportId: 1, season: '2024-25' } },
    });
    console.log('plays in 2026-27:', playsIn2026, '| plays in 2024-25:', playsIn2024);

    // Call with the STALE Sports-row season — the service must resolve
    // 2026-27 (the season that actually has plays) and fit the Cox model.
    const t0 = Date.now();
    const { stats, season: resolvedSeason } = await computeAndStoreSeasonAnalysis('nba', 1, '2024-25');
    const tookMs = Date.now() - t0;
    console.log('resolvedSeason:', resolvedSeason, `(${tookMs}ms)`);
    console.log('verdict:', stats.verdictLabel, '| games:', stats.gamesAnalyzed, '| plays:', stats.playsAnalyzed);
    console.log('hazardCoefficient:', stats.hazardCoefficient, '| pValue:', stats.pValue);

    const row = await prisma.momentumAnalysis.findUnique({
      where: { sportId_season: { sportId: 1, season: resolvedSeason } },
    });
    console.log('stored MomentumAnalysis row:', row ? `season=${row.season} verdict=${row.verdictLabel} games=${row.gamesAnalyzed}` : 'MISSING');
  } finally {
    await prisma.playByPlay.deleteMany({ where: { gameId: temp.id } });
    await prisma.games.delete({ where: { id: temp.id } });
    await prisma.momentumAnalysis.deleteMany({ where: { sportId: 1, season: { startsWith: 'TEST' } } }).catch(() => undefined);
    console.log('temp data cleaned up');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
