import { prisma } from '../src/db/client.js';

async function main() {
  const bad = await prisma.players.findMany({ where: { name: '', sportId: 2 } });
  console.log('Empty-name NFL records:', bad.length);
  if (bad.length > 0) {
    const ids = bad.map(p => p.id);
    console.log('Deleting IDs:', ids);
    await prisma.players.deleteMany({ where: { id: { in: ids } } });
    console.log('Deleted');
  }
}

main().finally(() => prisma.$disconnect());
