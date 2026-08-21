/**
 * Removes non-manager MLB coaches that were created by the ESPN roster sync.
 * Only keeps coaches whose externalId matches the seed pattern 'coach-*-mlb-*'.
 *
 * Run with: npx tsx scripts/cleanup-mlb-coaches.ts
 */
import { prisma } from '../src/db/client.js';

async function main(): Promise<void> {
  const mlb = await prisma.sports.findUnique({ where: { abbreviation: 'mlb' } });
  if (!mlb) {
    console.error('MLB sport not found');
    process.exit(1);
  }

  const allCoaches = await prisma.coaches.findMany({
    where: { sportId: mlb.id },
    select: { id: true, name: true, externalId: true },
  });

  const managers = allCoaches.filter(c => c.externalId.startsWith('coach-') && c.externalId.includes('-mlb-'));
  const junk = allCoaches.filter(c => !c.externalId.startsWith('coach-') || !c.externalId.includes('-mlb-'));

  console.log(`Total MLB coaches: ${allCoaches.length}`);
  console.log(`Real managers (seed): ${managers.length}`);
  console.log(`Junk (roster sync): ${junk.length}`);

  if (junk.length > 0) {
    const ids = junk.map(c => c.id);

    // Delete dependent records first (FK constraints)
    const deletedEV = await prisma.decisionEVScores.deleteMany({
      where: { coachId: { in: ids } },
    });
    console.log(`Deleted ${deletedEV.count} DecisionEVScores for junk coaches`);

    const deletedDec = await prisma.coachDecisions.deleteMany({
      where: { coachId: { in: ids } },
    });
    console.log(`Deleted ${deletedDec.count} CoachDecisions for junk coaches`);

    const deleted = await prisma.coaches.deleteMany({
      where: { id: { in: ids } },
    });
    console.log(`Deleted ${deleted.count} junk coaches`);
  }

  const remaining = await prisma.coaches.count({ where: { sportId: mlb.id } });
  console.log(`Remaining MLB coaches: ${remaining}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async err => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
