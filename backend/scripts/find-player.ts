// Helper: find an MLB player with recent game logs: npx tsx scripts/find-player.ts
import { prisma } from '../src/db/client.js';

async function main(): Promise<void> {
  const cutoff = new Date(Date.now() - 21 * 86_400_000);
  const groups = await prisma.playerGameLogs.groupBy({
    by: ['playerId'],
    where: { date: { gte: cutoff } },
    _count: { _all: true },
    orderBy: { _count: { playerId: 'desc' } },
    take: 3,
  });
  for (const g of groups) {
    const p = await prisma.players.findUnique({
      where: { id: g.playerId },
      select: { id: true, name: true, position: true, team: { select: { name: true } } },
    });
    console.log(`${p?.id}|${p?.name}|${p?.position}|${p?.team?.name}|logs=${g._count._all}`);
  }
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exitCode = 1;
});
