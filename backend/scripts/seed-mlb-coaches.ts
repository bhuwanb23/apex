/**
 * Seeds the 30 MLB managers from a static list (ESPN public API has no
 * coach data). Idempotent: upserts by (externalId, sportId).
 *
 * Run with: npx tsx scripts/seed-mlb-coaches.ts
 */
import { prisma } from '../src/db/client.js';

interface CoachSeed {
  name: string;
  firstName: string;
  lastName: string;
  teamAbbreviation: string;
  externalId: string;
}

const MLB_MANAGERS: CoachSeed[] = [
  { name: 'Brian Snitker', firstName: 'Brian', lastName: 'Snitker', teamAbbreviation: 'ATL', externalId: 'coach-atl-mlb-001' },
  { name: 'Brandon Hyde', firstName: 'Brandon', lastName: 'Hyde', teamAbbreviation: 'BAL', externalId: 'coach-bal-mlb-002' },
  { name: 'Alex Cora', firstName: 'Alex', lastName: 'Cora', teamAbbreviation: 'BOS', externalId: 'coach-bos-mlb-003' },
  { name: 'Craig Counsell', firstName: 'Craig', lastName: 'Counsell', teamAbbreviation: 'CHC', externalId: 'coach-chc-mlb-004' },
  { name: 'Pedro Grifol', firstName: 'Pedro', lastName: 'Grifol', teamAbbreviation: 'CWS', externalId: 'coach-cws-mlb-005' },
  { name: 'David Bell', firstName: 'David', lastName: 'Bell', teamAbbreviation: 'CIN', externalId: 'coach-cin-mlb-006' },
  { name: 'Stephen Vogt', firstName: 'Stephen', lastName: 'Vogt', teamAbbreviation: 'CLE', externalId: 'coach-cle-mlb-007' },
  { name: 'Bud Black', firstName: 'Bud', lastName: 'Black', teamAbbreviation: 'COL', externalId: 'coach-col-mlb-008' },
  { name: 'AJ Hinch', firstName: 'AJ', lastName: 'Hinch', teamAbbreviation: 'DET', externalId: 'coach-det-mlb-009' },
  { name: 'Joe Espada', firstName: 'Joe', lastName: 'Espada', teamAbbreviation: 'HOU', externalId: 'coach-hou-mlb-010' },
  { name: 'Matt Quatraro', firstName: 'Matt', lastName: 'Quatraro', teamAbbreviation: 'KC', externalId: 'coach-kc-mlb-011' },
  { name: 'Ron Washington', firstName: 'Ron', lastName: 'Washington', teamAbbreviation: 'LAA', externalId: 'coach-laa-mlb-012' },
  { name: 'Dave Roberts', firstName: 'Dave', lastName: 'Roberts', teamAbbreviation: 'LAD', externalId: 'coach-lad-mlb-013' },
  { name: 'Skip Schumaker', firstName: 'Skip', lastName: 'Schumaker', teamAbbreviation: 'MIA', externalId: 'coach-mia-mlb-014' },
  { name: 'Pat Murphy', firstName: 'Pat', lastName: 'Murphy', teamAbbreviation: 'MIL', externalId: 'coach-mil-mlb-015' },
  { name: 'Rocco Baldelli', firstName: 'Rocco', lastName: 'Baldelli', teamAbbreviation: 'MIN', externalId: 'coach-min-mlb-016' },
  { name: 'Carlos Mendoza', firstName: 'Carlos', lastName: 'Mendoza', teamAbbreviation: 'NYM', externalId: 'coach-nym-mlb-017' },
  { name: 'Aaron Boone', firstName: 'Aaron', lastName: 'Boone', teamAbbreviation: 'NYY', externalId: 'coach-nyy-mlb-018' },
  { name: 'Rob Thomson', firstName: 'Rob', lastName: 'Thomson', teamAbbreviation: 'PHI', externalId: 'coach-phi-mlb-019' },
  { name: 'Derek Shelton', firstName: 'Derek', lastName: 'Shelton', teamAbbreviation: 'PIT', externalId: 'coach-pit-mlb-020' },
  { name: 'Mike Shildt', firstName: 'Mike', lastName: 'Shildt', teamAbbreviation: 'SD', externalId: 'coach-sd-mlb-021' },
  { name: 'Bob Melvin', firstName: 'Bob', lastName: 'Melvin', teamAbbreviation: 'SF', externalId: 'coach-sf-mlb-022' },
  { name: 'Scott Servais', firstName: 'Scott', lastName: 'Servais', teamAbbreviation: 'SEA', externalId: 'coach-sea-mlb-023' },
  { name: 'Oliver Marmol', firstName: 'Oliver', lastName: 'Marmol', teamAbbreviation: 'STL', externalId: 'coach-stl-mlb-024' },
  { name: 'Kevin Cash', firstName: 'Kevin', lastName: 'Cash', teamAbbreviation: 'TB', externalId: 'coach-tb-mlb-025' },
  { name: 'Bruce Bochy', firstName: 'Bruce', lastName: 'Bochy', teamAbbreviation: 'TEX', externalId: 'coach-tex-mlb-026' },
  { name: 'John Schneider', firstName: 'John', lastName: 'Schneider', teamAbbreviation: 'TOR', externalId: 'coach-tor-mlb-027' },
  { name: 'Dave Martinez', firstName: 'Dave', lastName: 'Martinez', teamAbbreviation: 'WSH', externalId: 'coach-wsh-mlb-028' },
  { name: 'Mark Kotsay', firstName: 'Mark', lastName: 'Kotsay', teamAbbreviation: 'ATH', externalId: 'coach-ath-mlb-029' },
];

async function main(): Promise<void> {
  const mlb = await prisma.sports.findUnique({ where: { abbreviation: 'mlb' } });
  if (!mlb) {
    console.error('MLB sport not seeded — run npm run db:seed first');
    process.exit(1);
  }

  let count = 0;
  let skipped = 0;
  for (const coach of MLB_MANAGERS) {
    const team = await prisma.teams.findFirst({
      where: { abbreviation: coach.teamAbbreviation, sportId: mlb.id },
    });
    if (!team) {
      console.warn(`  SKIP ${coach.name} — team '${coach.teamAbbreviation}' not seeded`);
      skipped += 1;
      continue;
    }

    await prisma.coaches.upsert({
      where: { externalId_sportId: { externalId: coach.externalId, sportId: mlb.id } },
      update: {
        name: coach.name,
        firstName: coach.firstName,
        lastName: coach.lastName,
        role: 'head_coach',
        teamId: team.id,
        isActive: true,
      },
      create: {
        sportId: mlb.id,
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

  const total = await prisma.coaches.count({ where: { sportId: mlb.id } });
  console.log(`MLB coaches seeded: ${count} upserted, ${skipped} skipped (${total} total in DB)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async err => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
