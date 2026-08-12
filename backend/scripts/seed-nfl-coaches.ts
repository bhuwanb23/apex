/**
 * Seeds the 32 NFL head coaches for the 2024 season (the season stored in the
 * Sports table and the games in the DB).
 *
 * Why this exists: ESPN's public API exposes NO coaching staff data (verified
 * live — /teams/{id} has no coach field), and nfl_data_py can't run on the
 * current Python 3.13 env (pins pandas<2.0). Without a head coach per team,
 * writeCoachDecisions silently skips every extracted decision (coachId FK).
 *
 * These are the real opening-week head coaches of the 2024 NFL season.
 * Run with: npm run db:seed:coaches   (idempotent — upserts by externalId)
 */
import { prisma } from '../src/db/client.js';

/** Team abbreviation → 2024 season head coach (opening week). */
const HEAD_COACHES: Record<string, string> = {
  ARI: 'Jonathan Gannon',
  ATL: 'Raheem Morris',
  BAL: 'John Harbaugh',
  BUF: 'Sean McDermott',
  CAR: 'Dave Canales',
  CHI: 'Matt Eberflus',
  CIN: 'Zac Taylor',
  CLE: 'Kevin Stefanski',
  DAL: 'Mike McCarthy',
  DEN: 'Sean Payton',
  DET: 'Dan Campbell',
  GB: 'Matt LaFleur',
  HOU: 'DeMeco Ryans',
  IND: 'Shane Steichen',
  JAX: 'Doug Pederson',
  KC: 'Andy Reid',
  LV: 'Antonio Pierce',
  LAC: 'Jim Harbaugh',
  LAR: 'Sean McVay',
  MIA: 'Mike McDaniel',
  MIN: 'Kevin O\u2019Connell',
  NE: 'Jerod Mayo',
  NO: 'Dennis Allen',
  NYG: 'Brian Daboll',
  NYJ: 'Robert Saleh',
  PHI: 'Nick Sirianni',
  PIT: 'Mike Tomlin',
  SF: 'Kyle Shanahan',
  SEA: 'Mike Macdonald',
  TB: 'Todd Bowles',
  TEN: 'Brian Callahan',
  WSH: 'Dan Quinn',
};

async function main(): Promise<void> {
  const sport = await prisma.sports.findUnique({ where: { abbreviation: 'nfl' } });
  if (!sport) {
    throw new Error('NFL sport not seeded — run `npm run db:seed` first');
  }
  const teams = await prisma.teams.findMany({
    where: { sportId: sport.id },
    select: { id: true, abbreviation: true, externalId: true },
  });

  let written = 0;
  let missing = 0;
  for (const team of teams) {
    const name = HEAD_COACHES[team.abbreviation];
    if (!name) {
      missing += 1;
      console.warn(`  no coach mapping for ${team.abbreviation} — skipping`);
      continue;
    }
    const [firstName, ...rest] = name.split(' ');
    const lastName = rest.join(' ');
    // Unique per sport (Coaches @@unique([externalId, sportId])); derived from
    // the team's ESPN id so it's stable across re-seeds.
    const externalId = `espn:${team.externalId}:hc`;
    await prisma.coaches.upsert({
      where: { externalId_sportId: { externalId, sportId: sport.id } },
      create: {
        teamId: team.id,
        sportId: sport.id,
        name,
        firstName,
        lastName,
        role: 'head_coach',
        externalId,
        isActive: true,
        hireDate: null,
      },
      update: {
        teamId: team.id,
        name,
        firstName,
        lastName,
        role: 'head_coach',
        isActive: true,
      },
    });
    written += 1;
  }

  console.log(`NFL head coach seed complete: ${written} upserted${missing ? `, ${missing} missing mappings` : ''}`);
}

main()
  .catch(err => {
    console.error('NFL head coach seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
