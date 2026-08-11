// TEMPORARY smoke-test seed — deleted after validation.
import { prisma } from './src/db/client.js';

async function main(): Promise<void> {
  const sport = await prisma.sports.findUniqueOrThrow({ where: { abbreviation: 'nba' } });
  const team = await prisma.teams.upsert({
    where: { externalId_sportId: { externalId: 'smoke-team', sportId: sport.id } },
    create: { externalId: 'smoke-team', sportId: sport.id, name: 'Smoke City Hoopers', abbreviation: 'SCH', city: 'Smoke City' },
    update: {},
  });

  const mk = (name: string, externalId: string, pos: string) =>
    prisma.players.upsert({
      where: { externalId_sportId: { externalId, sportId: sport.id } },
      create: { externalId, sportId: sport.id, teamId: team.id, name, firstName: name.split(' ')[0]!, lastName: name.split(' ')[1] ?? name, position: pos },
      update: {},
    });

  const p1 = await mk('Test Player', 'smoke-player', 'PG');
  const p2 = await mk('No Logs Guy', 'smoke-player2', 'C');

  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.now() - (2 + i * 3) * 86_400_000);
    const g = await prisma.games.upsert({
      where: { externalId_sportId: { externalId: `smoke-game-${i}`, sportId: sport.id } },
      create: { externalId: `smoke-game-${i}`, sportId: sport.id, homeTeamId: team.id, awayTeamId: team.id, date: d, season: sport.season, gameType: 'regular', status: 'final', homeScore: 100, awayScore: 90 },
      update: {},
    });
    await prisma.playerGameLogs.upsert({
      where: { playerId_gameId: { playerId: p1.id, gameId: g.id } },
      create: {
        playerId: p1.id,
        gameId: g.id,
        teamId: team.id,
        date: d,
        minutesPlayed: 34 + i,
        backToBack: i === 1,
        daysRestBefore: i === 1 ? 0 : 2,
        points: 20 + i,
        assists: 5,
        rebounds: 6,
        rawBoxScore: {},
      },
      update: {},
    });
  }

  await prisma.injuryRiskScores.deleteMany({ where: { explanation: 'Cached smoke-test score' } });
  await prisma.injuryRiskScores.create({
    data: {
      playerId: p1.id,
      computedAt: new Date(Date.now() - 2 * 86_400_000),
      windowStart: new Date(Date.now() - 14 * 86_400_000),
      windowEnd: new Date(Date.now() - 7 * 86_400_000),
      riskScore: 62,
      zone: 'yellow',
      backToBackFlag: true,
      triggerMetric: 'minutes',
      explanation: 'Cached smoke-test score',
      isLatest: true,
    },
  });

  console.log(
    'SEED OK',
    JSON.stringify({
      teamId: team.id,
      p1: p1.id,
      p2: p2.id,
      teams: await prisma.teams.count(),
      players: await prisma.players.count(),
      games: await prisma.games.count(),
      logs: await prisma.playerGameLogs.count(),
      scores: await prisma.injuryRiskScores.count(),
    })
  );
}

main()
  .catch(err => {
    console.error('SEED FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
