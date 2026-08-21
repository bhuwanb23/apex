import { prisma } from '../src/db/client.js';

async function main() {
  const nfl = await prisma.sports.findUnique({ where: { abbreviation: 'nfl' } });
  if (nfl) {
    const deleted = await prisma.cacheMetadata.deleteMany({
      where: { sportId: nfl.id },
    });
    console.log('Deleted', deleted.count, 'NFL cache metadata rows');
  }
}

main().then(() => prisma.$disconnect());
