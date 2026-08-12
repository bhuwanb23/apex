// Temporary sync runner:
//   npx tsx scripts/sync-check.ts                    → show current DB state
//   npx tsx scripts/sync-check.ts <sport> [season] [maxPbpGames] [maxLogPlayers]
import { prisma } from '../src/db/client.js';
import { syncSport, type SyncResult } from '../src/data/sync.coordinator.js';

const sport = process.argv[2]?.toLowerCase();
const season = process.argv[3];
const maxPbpGames = process.argv[4] ? Number(process.argv[4]) : undefined;
const maxLogPlayers = process.argv[5] ? Number(process.argv[5]) : undefined;

async function main(): Promise<void> {
  if (!sport) {
    const sports = await prisma.sports.findMany({
      include: { _count: { select: { teams: true, players: true, games: true } } },
    });
    console.log(
      sports.map(s => ({
        abbr: s.abbreviation,
        season: s.season,
        active: s.isActive,
        teams: s._count.teams,
        players: s._count.players,
        games: s._count.games,
      }))
    );
    await prisma.$disconnect();
    return;
  }

  console.log(
    `SYNC START: ${sport}${season ? ` season=${season}` : ''}${maxPbpGames ? ` maxPbp=${maxPbpGames}` : ''}${maxLogPlayers ? ` maxLogs=${maxLogPlayers}` : ''}`
  );
  const started = Date.now();
  const result: SyncResult = await syncSport(sport, season, {
    ...(maxPbpGames ? { maxPlayByPlayGames: maxPbpGames } : {}),
    ...(maxLogPlayers ? { maxGameLogPlayers: maxLogPlayers } : {}),
  });
  console.log(
    JSON.stringify(
      {
        sport: result.sport,
        season: result.season,
        status: result.status,
        wallSeconds: ((Date.now() - started) / 1000).toFixed(1),
        counts: result.counts,
        errors: result.errors,
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('SYNC FAILED:', err);
  process.exitCode = 1;
});
