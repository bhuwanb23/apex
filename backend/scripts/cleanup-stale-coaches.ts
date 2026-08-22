/**
 * Removes stale NHL coach rows for defunct franchises (Arizona Coyotes —
 * replaced by Utah Hockey Club) plus any leftover non-manager MLB staff from
 * older roster syncs. Idempotent.
 *
 * Run with: npx tsx scripts/cleanup-stale-coaches.ts
 */
import { prisma } from '../src/db/client.js';

/** Team abbreviations whose coach rows are obsolete. */
const STALE_NHL_TEAM_ABBREVS = ['ARI'];

async function main(): Promise<void> {
  // --- NHL: defunct-franchise coaches ---
  const nhl = await prisma.sports.findUnique({ where: { abbreviation: 'nhl' } });
  if (nhl) {
    const teams = await prisma.teams.findMany({
      where: { sportId: nhl.id, abbreviation: { in: STALE_NHL_TEAM_ABBREVS } },
      select: { id: true },
    });
    const teamIds = teams.map(t => t.id);
    if (teamIds.length > 0) {
      const stale = await prisma.coaches.findMany({
        where: { sportId: nhl.id, teamId: { in: teamIds } },
        select: { id: true, name: true },
      });
      if (stale.length > 0) {
        const ids = stale.map(c => c.id);
        await prisma.decisionEVScores.deleteMany({ where: { coachId: { in: ids } } });
        await prisma.coachDecisions.deleteMany({ where: { coachId: { in: ids } } });
        const deleted = await prisma.coaches.deleteMany({ where: { id: { in: ids } } });
        console.log(`NHL: deleted ${deleted.count} stale coaches (${stale.map(c => c.name).join(', ')})`);
      } else {
        console.log('NHL: no stale coaches');
      }
    }
  }

  // --- MLB: non-manager leftovers (externalIds not from the manager seed) ---
  const mlb = await prisma.sports.findUnique({ where: { abbreviation: 'mlb' } });
  if (mlb) {
    const all = await prisma.coaches.findMany({
      where: { sportId: mlb.id },
      select: { id: true, name: true, externalId: true },
    });
    const junk = all.filter(c => !(c.externalId.startsWith('coach-') && c.externalId.includes('-mlb-')));
    if (junk.length > 0) {
      const ids = junk.map(c => c.id);
      await prisma.decisionEVScores.deleteMany({ where: { coachId: { in: ids } } });
      await prisma.coachDecisions.deleteMany({ where: { coachId: { in: ids } } });
      const deleted = await prisma.coaches.deleteMany({ where: { id: { in: ids } } });
      console.log(`MLB: deleted ${deleted.count} non-manager coaches`);
    } else {
      console.log(`MLB: clean (${all.length} managers)`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async err => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
