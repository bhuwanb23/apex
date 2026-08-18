/**
 * Seeds the 30 NBA head coaches from a static list (BallDontLie free tier
 * has no coach data). Idempotent: upserts by (externalId, sportId).
 *
 * Run with: npm run db:seed:nba-coaches
 */
import { prisma } from '../src/db/client.js';

interface CoachSeed {
  name: string;
  firstName: string;
  lastName: string;
  teamAbbreviation: string;
  externalId: string;
}

const NBA_HEAD_COACHES: CoachSeed[] = [
  { name: 'Quin Snyder', firstName: 'Quin', lastName: 'Snyder', teamAbbreviation: 'ATL', externalId: 'coach-atl-001' },
  { name: 'Joe Mazzulla', firstName: 'Joe', lastName: 'Mazzulla', teamAbbreviation: 'BOS', externalId: 'coach-bos-002' },
  { name: 'Jordi Fernández', firstName: 'Jordi', lastName: 'Fernández', teamAbbreviation: 'BKN', externalId: 'coach-bkn-003' },
  { name: 'Charles Lee', firstName: 'Charles', lastName: 'Lee', teamAbbreviation: 'CHA', externalId: 'coach-cha-004' },
  { name: 'Billy Donovan', firstName: 'Billy', lastName: 'Donovan', teamAbbreviation: 'CHI', externalId: 'coach-chi-005' },
  { name: 'Kenny Atkinson', firstName: 'Kenny', lastName: 'Atkinson', teamAbbreviation: 'CLE', externalId: 'coach-cle-006' },
  { name: 'Jason Kidd', firstName: 'Jason', lastName: 'Kidd', teamAbbreviation: 'DAL', externalId: 'coach-dal-007' },
  { name: 'Michael Malone', firstName: 'Michael', lastName: 'Malone', teamAbbreviation: 'DEN', externalId: 'coach-den-008' },
  { name: 'JB Bickerstaff', firstName: 'JB', lastName: 'Bickerstaff', teamAbbreviation: 'DET', externalId: 'coach-det-009' },
  { name: 'Steve Kerr', firstName: 'Steve', lastName: 'Kerr', teamAbbreviation: 'GSW', externalId: 'coach-gsw-010' },
  { name: 'Ime Udoka', firstName: 'Ime', lastName: 'Udoka', teamAbbreviation: 'HOU', externalId: 'coach-hou-011' },
  { name: 'Rick Carlisle', firstName: 'Rick', lastName: 'Carlisle', teamAbbreviation: 'IND', externalId: 'coach-ind-012' },
  { name: 'Tyronn Lue', firstName: 'Tyronn', lastName: 'Lue', teamAbbreviation: 'LAC', externalId: 'coach-lac-013' },
  { name: 'JJ Redick', firstName: 'JJ', lastName: 'Redick', teamAbbreviation: 'LAL', externalId: 'coach-lal-014' },
  { name: 'Taylor Jenkins', firstName: 'Taylor', lastName: 'Jenkins', teamAbbreviation: 'MEM', externalId: 'coach-mem-015' },
  { name: 'Erik Spoelstra', firstName: 'Erik', lastName: 'Spoelstra', teamAbbreviation: 'MIA', externalId: 'coach-mia-016' },
  { name: 'Doc Rivers', firstName: 'Doc', lastName: 'Rivers', teamAbbreviation: 'MIL', externalId: 'coach-mil-017' },
  { name: 'Chris Finch', firstName: 'Chris', lastName: 'Finch', teamAbbreviation: 'MIN', externalId: 'coach-min-018' },
  { name: 'Willie Green', firstName: 'Willie', lastName: 'Green', teamAbbreviation: 'NOP', externalId: 'coach-nop-019' },
  { name: 'Tom Thibodeau', firstName: 'Tom', lastName: 'Thibodeau', teamAbbreviation: 'NYK', externalId: 'coach-nyk-020' },
  { name: 'Mark Daigneault', firstName: 'Mark', lastName: 'Daigneault', teamAbbreviation: 'OKC', externalId: 'coach-okc-021' },
  { name: 'Jamahl Mosley', firstName: 'Jamahl', lastName: 'Mosley', teamAbbreviation: 'ORL', externalId: 'coach-orl-022' },
  { name: 'Nick Nurse', firstName: 'Nick', lastName: 'Nurse', teamAbbreviation: 'PHI', externalId: 'coach-phi-023' },
  { name: 'Mike Budenholzer', firstName: 'Mike', lastName: 'Budenholzer', teamAbbreviation: 'PHX', externalId: 'coach-phx-024' },
  { name: 'Chauncey Billups', firstName: 'Chauncey', lastName: 'Billups', teamAbbreviation: 'POR', externalId: 'coach-por-025' },
  { name: 'Mike Brown', firstName: 'Mike', lastName: 'Brown', teamAbbreviation: 'SAC', externalId: 'coach-sac-026' },
  { name: 'Gregg Popovich', firstName: 'Gregg', lastName: 'Popovich', teamAbbreviation: 'SAS', externalId: 'coach-sas-027' },
  { name: 'Darko Rajaković', firstName: 'Darko', lastName: 'Rajaković', teamAbbreviation: 'TOR', externalId: 'coach-tor-028' },
  { name: 'Will Hardy', firstName: 'Will', lastName: 'Hardy', teamAbbreviation: 'UTA', externalId: 'coach-uta-029' },
  { name: 'Brian Keefe', firstName: 'Brian', lastName: 'Keefe', teamAbbreviation: 'WAS', externalId: 'coach-was-030' },
];

async function main(): Promise<void> {
  const nba = await prisma.sports.findUnique({ where: { abbreviation: 'nba' } });
  if (!nba) {
    console.error('NBA sport not seeded — run npm run db:seed first');
    process.exit(1);
  }

  let count = 0;
  for (const coach of NBA_HEAD_COACHES) {
    // Find the team by abbreviation
    const team = await prisma.teams.findFirst({
      where: { abbreviation: coach.teamAbbreviation, sportId: nba.id },
    });
    if (!team) {
      console.warn(`  SKIP ${coach.name} — team '${coach.teamAbbreviation}' not seeded`);
      continue;
    }

    await prisma.coaches.upsert({
      where: { externalId_sportId: { externalId: coach.externalId, sportId: nba.id } },
      update: {
        name: coach.name,
        firstName: coach.firstName,
        lastName: coach.lastName,
        role: 'head_coach',
        teamId: team.id,
        isActive: true,
      },
      create: {
        sportId: nba.id,
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

  const total = await prisma.coaches.count({ where: { sportId: nba.id } });
  console.log(`NBA coaches seeded: ${count} upserted (${total} total in DB)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async err => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
