// DB admin: `npx tsx scripts/db-admin.ts` — update sports seasons + player checks
import { prisma } from '../src/db/client.js';

async function main(): Promise<void> {
  // 1. Point sports seasons at the data we actually synced (real current seasons).
  await prisma.sports.update({ where: { abbreviation: 'mlb' }, data: { season: '2026' } });
  await prisma.sports.update({ where: { abbreviation: 'nfl' }, data: { season: '2025' } });
  const sports = await prisma.sports.findMany({ select: { name: true, season: true } });
  console.log('SPORT SEASONS:', JSON.stringify(sports));

  // 2. Player + log sanity checks.
  const mlbPlayers = await prisma.players.count({ where: { sport: { name: 'MLB' } } });
  const mlbActive = await prisma.players.count({
    where: { sport: { name: 'MLB' }, isActive: true },
  });
  const logs = await prisma.playerGameLogs.count();
  const plays = await prisma.playByPlay.count();
  const games = await prisma.games.count();
  console.log(
    JSON.stringify({ mlbPlayers, mlbActive, logs, plays, games })
  );

  // 3. Do MLB players actually have recent (last 21 days) game logs for injury risk?
  const cutoff = new Date(Date.now() - 21 * 86_400_000);
  const recentLogs = await prisma.playerGameLogs.count({ where: { date: { gte: cutoff } } });
  console.log('LOGS LAST 21 DAYS:', recentLogs);
  const playersWithRecent = await prisma.playerGameLogs.groupBy({
    by: ['playerId'],
    where: { date: { gte: cutoff } },
    _count: { _all: true },
    orderBy: { _count: { playerId: 'desc' } },
    take: 5,
  });
  console.log('TOP PLAYERS W/ RECENT LOGS:', JSON.stringify(playersWithRecent));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('ADMIN FAILED:', err);
  process.exitCode = 1;
});
