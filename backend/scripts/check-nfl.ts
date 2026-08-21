import { prisma } from '../src/db/client.js';

async function main() {
  const games = await prisma.games.count({ where: { sportId: 2 } });
  console.log('NFL games:', games);
  const logs = await prisma.playerGameLogs.count({ where: { player: { sportId: 2 } } });
  console.log('NFL game logs:', logs);
  const decisions = await prisma.coachDecisions.count({ where: { game: { sportId: 2 } } });
  console.log('NFL decisions:', decisions);
  const evScores = await prisma.decisionEVScores.count({ where: { sportId: 2 } });
  console.log('NFL EV scores:', evScores);
}

main().then(() => prisma.$disconnect());
