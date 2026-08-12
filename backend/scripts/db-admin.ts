// DB admin: `npx tsx scripts/db-admin.ts [clearPbpCache]`
import { prisma } from '../src/db/client.js';

async function main(): Promise<void> {
  const mode = process.argv[2];

  if (mode === 'clearPbpCache') {
    // Invalidate cached play-by-play fetches so the next sync re-fetches with
    // the fixed transformer (eventTimeSeconds derived from atBatIndex).
    const del = await prisma.cacheMetadata.deleteMany({
      where: { dataType: 'play_by_play', cacheKey: { startsWith: 'play_by_play:mlb' } },
    });
    console.log('DELETED play_by_play cache rows:', del.count);
    await prisma.$disconnect();
    return;
  }

  if (mode === 'clearLogCache') {
    const del = await prisma.cacheMetadata.deleteMany({
      where: { dataType: 'player_logs' },
    });
    console.log('DELETED player_logs cache rows:', del.count);
    await prisma.$disconnect();
    return;
  }

  // Default: report state.
  const sports = await prisma.sports.findMany({ select: { name: true, season: true } });
  console.log('SPORT SEASONS:', JSON.stringify(sports));
  const mlbPlayers = await prisma.players.count({ where: { sport: { name: 'MLB' } } });
  const logs = await prisma.playerGameLogs.count();
  const plays = await prisma.playByPlay.count();
  const games = await prisma.games.count();
  console.log(JSON.stringify({ mlbPlayers, logs, plays, games }));
  const cutoff = new Date(Date.now() - 21 * 86_400_000);
  const recentLogs = await prisma.playerGameLogs.count({ where: { date: { gte: cutoff } } });
  console.log('LOGS LAST 21 DAYS:', recentLogs);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('ADMIN FAILED:', err);
  process.exitCode = 1;
});
