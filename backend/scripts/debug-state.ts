import { prisma } from '../src/db/client.js';

async function main() {
  // Check NHL player external IDs
  const players = await prisma.players.findMany({
    where: { sportId: 7 },
    take: 5,
    select: { id: true, name: true, externalId: true },
  });
  console.log('NHL players (first 5):', JSON.stringify(players, null, 2));

  // Check game log records from API - what external IDs look like
  const gameCount = await prisma.games.count({ where: { sportId: 7 } });
  console.log('NHL games in DB:', gameCount);

  // Check game logs
  const logCount = await prisma.playerGameLogs.count();
  console.log('Total game logs in DB:', logCount);

  // Check what a specific game log fetch produces
  // Player 8481568 had 82 records, all skipped
  const testPlayer = await prisma.players.findFirst({
    where: { sportId: 7, externalId: '8481568' },
    select: { id: true, name: true, externalId: true },
  });
  console.log('Player 8481568:', testPlayer);

  // Check game 2024021293
  const testGame = await prisma.games.findFirst({
    where: { sportId: 7, externalId: '2024021293' },
    select: { id: true, externalId: true },
  });
  console.log('Game 2024021293:', testGame);

  // Check team EDM
  const testTeam = await prisma.teams.findFirst({
    where: { sportId: 7, abbreviation: 'EDM' },
    select: { id: true, name: true, abbreviation: true, externalId: true },
  });
  console.log('Team EDM:', testTeam);
}

main().then(() => prisma.$disconnect());
