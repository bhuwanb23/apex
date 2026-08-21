import { prisma } from '../src/db/client.js';

async function main() {
  const logCount = await prisma.playerGameLogs.count();
  console.log('Total game logs:', logCount);
  const nhlGames = await prisma.games.count({ where: { sportId: 7 } });
  console.log('NHL games:', nhlGames);
}

main().then(() => prisma.$disconnect());
