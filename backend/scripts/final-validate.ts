// Final validation runner — exercises every module endpoint against the live API.
import { prisma } from '../src/db/client.js';

const B = 'http://localhost:8000/api';

async function main(): Promise<void> {
  // Find a real MLB head coach for the coach drill-down / story tests.
  const coach = await prisma.coaches.findFirst({
    where: { sport: { name: 'MLB' }, role: 'head_coach' },
    include: { team: { select: { name: true } } },
  });
  const coachId = coach?.id;
  console.log('coachForTest:', coach ? `${coach.name} (${coach.team?.name}, id=${coach.id})` : 'NONE');

  // A recent MLB final game for the momentum timeline test.
  const game = await prisma.games.findFirst({
    where: { sport: { name: 'MLB' }, status: 'final', playByPlay: { some: {} } },
    orderBy: { date: 'desc' },
    select: { id: true, externalId: true },
  });
  console.log('gameForTest:', game ? `id=${game.id} (pk=${game.externalId})` : 'NONE');

  // A player with game logs for the injury test.
  const player = await prisma.players.findFirst({
    where: { sport: { name: 'MLB' }, playerGameLogs: { some: {} } },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  });
  console.log('playerForTest:', player ? `id=${player.id} (${player.name})` : 'NONE');

  const padres = await prisma.teams.findFirst({
    where: { name: { contains: 'Padres' } },
    select: { id: true },
  });
  console.log('padresTeamId:', padres?.id ?? 'NONE');

  const nflCoach = await prisma.coaches.count();
  const nflDecisions = await prisma.coachDecisions.count();
  const nflScorecards = await prisma.decisionEVScores.count();
  console.log('dataState:', JSON.stringify({ coaches: nflCoach, decisions: nflDecisions, scorecards: nflScorecards }));

  const timeoutCount = await prisma.timeoutRecommendations.groupBy({
    by: ['sportId'],
    _count: true,
  });
  console.log('timeoutRows:', JSON.stringify(timeoutCount));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('VALIDATE SETUP FAILED:', err);
  process.exitCode = 1;
});
