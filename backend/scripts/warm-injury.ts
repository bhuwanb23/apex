// Injury warm-up runner:
//   npx tsx scripts/warm-injury.ts [sport] [concurrency]
//   (default: MLB, 8 concurrent)
//
// Pre-computes a fresh risk score for every active player so the team / league
// dashboards are populated instead of showing "No risk score computed yet".
import { prisma } from '../src/db/client.js';
import { getPlayerRisk } from '../src/services/injury.service.js';

async function main(): Promise<void> {
  const sportName = (process.argv[2] ?? 'MLB').toUpperCase();
  const concurrency = Math.max(1, Number(process.argv[3] ?? 8));
  const sport = await prisma.sports.findUnique({
    where: { name: sportName },
    select: { id: true, name: true },
  });
  if (!sport) {
    console.error(`Sport '${sportName}' not found`);
    process.exitCode = 1;
    return;
  }

  const players = await prisma.players.findMany({
    where: { sportId: sport.id, isActive: true },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  console.log(`WARMUP START: ${sport.name} — ${players.length} players (concurrency ${concurrency})`);

  let index = 0;
  let scored = 0;
  let insufficient = 0;
  let failed = 0;
  const started = Date.now();

  async function worker(): Promise<void> {
    for (;;) {
      const i = index;
      index += 1;
      if (i >= players.length) return;
      const player = players[i];
      if (player === undefined) return;
      try {
        const profile = await getPlayerRisk(player.id, true);
        if (profile.riskScore != null) scored += 1;
        else insufficient += 1;
      } catch {
        failed += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log(
    JSON.stringify({
      sport: sport.name,
      players: players.length,
      scored,
      insufficient,
      failed,
      seconds: ((Date.now() - started) / 1000).toFixed(1),
    })
  );
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('WARMUP FAILED:', err);
  process.exitCode = 1;
});
