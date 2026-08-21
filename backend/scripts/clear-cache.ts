import { prisma } from '../src/db/client.js';

async function main() {
  const nhl = await prisma.sports.findUnique({ where: { abbreviation: 'nhl' } });
  if (!nhl) { console.error('NHL not found'); process.exit(1); }

  const deleted = await prisma.cacheMetadata.deleteMany({
    where: { sportId: nhl.id, dataType: 'player_logs' },
  });
  console.log(`Deleted ${deleted.count} cache metadata rows for NHL player_logs`);

  const nfl = await prisma.sports.findUnique({ where: { abbreviation: 'nfl' } });
  if (nfl) {
    const deleted2 = await prisma.cacheMetadata.deleteMany({
      where: { sportId: nfl.id, dataType: 'player_logs' },
    });
    console.log(`Deleted ${deleted2.count} cache metadata rows for NFL player_logs`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
