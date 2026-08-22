/**
 * Seeds the 32 NHL head coaches from a static list. Idempotent: upserts by
 * (externalId, sportId).
 *
 * Run with: npx tsx scripts/seed-nhl-coaches.ts
 */
import { prisma } from '../src/db/client.js';

interface CoachSeed {
  name: string;
  firstName: string;
  lastName: string;
  teamAbbreviation: string;
  externalId: string;
}

const NHL_HEAD_COACHES: CoachSeed[] = [
  { name: 'Greg Cronin', firstName: 'Greg', lastName: 'Cronin', teamAbbreviation: 'ANA', externalId: 'coach-ana-nhl-001' },
  { name: 'Jim Montgomery', firstName: 'Jim', lastName: 'Montgomery', teamAbbreviation: 'BOS', externalId: 'coach-bos-nhl-003' },
  { name: 'Lindy Ruff', firstName: 'Lindy', lastName: 'Ruff', teamAbbreviation: 'BUF', externalId: 'coach-buf-nhl-004' },
  { name: 'Ryan Huska', firstName: 'Ryan', lastName: 'Huska', teamAbbreviation: 'CGY', externalId: 'coach-cgy-nhl-005' },
  { name: 'Rod Brind\'Amour', firstName: 'Rod', lastName: 'Brind\'Amour', teamAbbreviation: 'CAR', externalId: 'coach-car-nhl-006' },
  { name: 'Luke Richardson', firstName: 'Luke', lastName: 'Richardson', teamAbbreviation: 'CHI', externalId: 'coach-chi-nhl-007' },
  { name: 'Jared Bednar', firstName: 'Jared', lastName: 'Bednar', teamAbbreviation: 'COL', externalId: 'coach-col-nhl-008' },
  { name: 'Pascal Vincent', firstName: 'Pascal', lastName: 'Vincent', teamAbbreviation: 'CBJ', externalId: 'coach-cbj-nhl-009' },
  { name: 'Peter DeBoer', firstName: 'Peter', lastName: 'DeBoer', teamAbbreviation: 'DAL', externalId: 'coach-dal-nhl-010' },
  { name: 'Derek Lalonde', firstName: 'Derek', lastName: 'Lalonde', teamAbbreviation: 'DET', externalId: 'coach-det-nhl-011' },
  { name: 'Kris Knoblauch', firstName: 'Kris', lastName: 'Knoblauch', teamAbbreviation: 'EDM', externalId: 'coach-edm-nhl-012' },
  { name: 'Paul Maurice', firstName: 'Paul', lastName: 'Maurice', teamAbbreviation: 'FLA', externalId: 'coach-fla-nhl-013' },
  { name: 'Jim Hiller', firstName: 'Jim', lastName: 'Hiller', teamAbbreviation: 'LAK', externalId: 'coach-lak-nhl-014' },
  { name: 'John Hynes', firstName: 'John', lastName: 'Hynes', teamAbbreviation: 'MIN', externalId: 'coach-min-nhl-015' },
  { name: 'Martin St. Louis', firstName: 'Martin', lastName: 'St. Louis', teamAbbreviation: 'MTL', externalId: 'coach-mtl-nhl-016' },
  { name: 'Andrew Brunette', firstName: 'Andrew', lastName: 'Brunette', teamAbbreviation: 'NSH', externalId: 'coach-nsh-nhl-017' },
  { name: 'Sheldon Keefe', firstName: 'Sheldon', lastName: 'Keefe', teamAbbreviation: 'NJD', externalId: 'coach-njd-nhl-018' },
  { name: 'Patrick Roy', firstName: 'Patrick', lastName: 'Roy', teamAbbreviation: 'NYI', externalId: 'coach-nyi-nhl-019' },
  { name: 'Peter Laviolette', firstName: 'Peter', lastName: 'Laviolette', teamAbbreviation: 'NYR', externalId: 'coach-nyr-nhl-020' },
  { name: 'Jacques Martin', firstName: 'Jacques', lastName: 'Martin', teamAbbreviation: 'OTT', externalId: 'coach-ott-nhl-021' },
  { name: 'John Tortorella', firstName: 'John', lastName: 'Tortorella', teamAbbreviation: 'PHI', externalId: 'coach-phi-nhl-022' },
  { name: 'Mike Sullivan', firstName: 'Mike', lastName: 'Sullivan', teamAbbreviation: 'PIT', externalId: 'coach-pit-nhl-023' },
  { name: 'Ryan Warsofsky', firstName: 'Ryan', lastName: 'Warsofsky', teamAbbreviation: 'SJS', externalId: 'coach-sjs-nhl-024' },
  { name: 'Dan Bylsma', firstName: 'Dan', lastName: 'Bylsma', teamAbbreviation: 'SEA', externalId: 'coach-sea-nhl-025' },
  { name: 'Drew Bannister', firstName: 'Drew', lastName: 'Bannister', teamAbbreviation: 'STL', externalId: 'coach-stl-nhl-026' },
  { name: 'Jon Cooper', firstName: 'Jon', lastName: 'Cooper', teamAbbreviation: 'TBL', externalId: 'coach-tbl-nhl-027' },
  { name: 'Craig Berube', firstName: 'Craig', lastName: 'Berube', teamAbbreviation: 'TOR', externalId: 'coach-tor-nhl-028' },
  { name: 'André Tourigny', firstName: 'André', lastName: 'Tourigny', teamAbbreviation: 'UTA', externalId: 'coach-uta-nhl-029' },
  { name: 'Rick Tocchet', firstName: 'Rick', lastName: 'Tocchet', teamAbbreviation: 'VAN', externalId: 'coach-van-nhl-030' },
  { name: 'Bruce Cassidy', firstName: 'Bruce', lastName: 'Cassidy', teamAbbreviation: 'VGK', externalId: 'coach-vgk-nhl-031' },
  { name: 'Spencer Carbery', firstName: 'Spencer', lastName: 'Carbery', teamAbbreviation: 'WSH', externalId: 'coach-wsh-nhl-032' },
  { name: 'Scott Arniel', firstName: 'Scott', lastName: 'Arniel', teamAbbreviation: 'WPG', externalId: 'coach-wpg-nhl-033' },
];

async function main(): Promise<void> {
  const nhl = await prisma.sports.findUnique({ where: { abbreviation: 'nhl' } });
  if (!nhl) {
    console.error('NHL sport not seeded — run npm run db:seed first');
    process.exit(1);
  }

  let count = 0;
  let skipped = 0;
  for (const coach of NHL_HEAD_COACHES) {
    const team = await prisma.teams.findFirst({
      where: { abbreviation: coach.teamAbbreviation, sportId: nhl.id },
    });
    if (!team) {
      console.warn(`  SKIP ${coach.name} — team '${coach.teamAbbreviation}' not seeded`);
      skipped += 1;
      continue;
    }

    await prisma.coaches.upsert({
      where: { externalId_sportId: { externalId: coach.externalId, sportId: nhl.id } },
      update: {
        name: coach.name,
        firstName: coach.firstName,
        lastName: coach.lastName,
        role: 'head_coach',
        teamId: team.id,
        isActive: true,
      },
      create: {
        sportId: nhl.id,
        teamId: team.id,
        name: coach.name,
        firstName: coach.firstName,
        lastName: coach.lastName,
        role: 'head_coach',
        externalId: coach.externalId,
        isActive: true,
      },
    });
    count += 1;
  }

  const total = await prisma.coaches.count({ where: { sportId: nhl.id } });
  console.log(`NHL coaches seeded: ${count} upserted, ${skipped} skipped (${total} total in DB)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async err => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
