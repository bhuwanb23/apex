import { prisma } from '../src/db/client.js';

async function main(): Promise<void> {
  const momentum = await prisma.momentumAnalysis.findMany({
    select: {
      sport: { select: { name: true } },
      season: true,
      isSignificant: true,
      hazardCoefficient: true,
      pValue: true,
      gamesAnalyzed: true,
      computedAt: true,
      plainExplanation: true,
    },
    orderBy: { computedAt: 'desc' },
    take: 20,
  });
  console.log('=== MOMENTUM ANALYSIS (recent 20) ===');
  for (const m of momentum) {
    console.log(
      `${m.sport?.name ?? '?'} ${m.season}: sig=${m.isSignificant} hazard=${m.hazardCoefficient?.toFixed(3)} p=${m.pValue?.toFixed(3)} games=${m.gamesAnalyzed} at=${m.computedAt.toISOString()}`
    );
    console.log(`    explain: ${(m.plainExplanation ?? '').slice(0, 90)}`);
  }

  const gamesBySport = await prisma.games.groupBy({ by: ['sportId'], _count: { _all: true } });
  console.log('\n=== GAMES BY SPORT ===', JSON.stringify(gamesBySport));

  const mgd = await prisma.momentumGameData.findMany({
    select: {
      gameId: true,
      game: {
        select: {
          id: true,
          sport: { select: { name: true } },
          date: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
    orderBy: { game: { date: 'desc' } },
    take: 15,
  });
  console.log('\n=== MOMENTUM GAME DATA (recent 15) ===');
  for (const m of mgd) {
    console.log(`game ${m.game?.id} ${m.game?.sport?.name} ${m.game?.date?.toISOString().slice(0, 10)} ${m.game?.homeTeam?.name} vs ${m.game?.awayTeam?.name}`);
  }

  const nbaPlayers = await prisma.players.findMany({
    where: { sportId: 1 },
    select: { name: true, team: { select: { name: true } }, position: true },
    take: 10,
  });
  console.log('\n=== NBA PLAYERS (first 10 of ' + await prisma.players.count({ where: { sportId: 1 } }) + ') ===');
  for (const p of nbaPlayers) console.log(`  ${p.name} — ${p.team?.name ?? '?'} ${p.position}`);

  const nbaTeams = await prisma.teams.findMany({
    where: { sportId: 1 },
    select: { name: true, abbreviation: true },
    orderBy: { name: 'asc' },
  });
  console.log('\n=== NBA TEAMS (' + nbaTeams.length + ') ===');
  console.log(nbaTeams.map(t => t.name).join(', '));

  // Recent games per sport to see what game replays would show
  const recentGames = await prisma.games.findMany({
    where: { sport: { name: 'NBA' } },
    select: { id: true, date: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } }, homeScore: true, awayScore: true },
    orderBy: { date: 'desc' },
    take: 10,
  });
  console.log('\n=== RECENT NBA GAMES ===');
  for (const g of recentGames) console.log(`  ${g.id} ${g.date.toISOString().slice(0, 10)} ${g.homeTeam?.name} ${g.homeScore} - ${g.awayScore} ${g.awayTeam?.name}`);
}

main().finally(() => prisma.$disconnect());
