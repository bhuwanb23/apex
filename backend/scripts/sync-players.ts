/**
 * Targeted sync script: NFL + NHL players (the missing data).
 * Uses ESPN (NFL) and NHL API (both free, no rate limits).
 */
import { prisma } from '../src/db/client.js';
import { NflFetcher } from '../src/data/nfl/nfl.fetcher.js';
import { NhlFetcher } from '../src/data/nhl/nhl.fetcher.js';
import { transformPlayer as transformNflPlayer } from '../src/data/nfl/nfl.transformer.js';
import { transformPlayer as transformNhlPlayer } from '../src/data/nhl/nhl.transformer.js';

const NFL_SPORT_ID = 2;
const NHL_SPORT_ID = 7;

async function main(): Promise<void> {
  console.log('=== Targeted Player Sync (NFL + NHL) ===\n');

  // NFL: per-team rosters via ESPN
  console.log('--- NFL Players ---');
  const nflTeams = await prisma.teams.findMany({ where: { sportId: NFL_SPORT_ID } });
  console.log(`Found ${nflTeams.length} NFL teams`);

  const nflFetcher = new NflFetcher();
  let nflCount = 0;
  for (const team of nflTeams) {
    try {
      const athletes = await nflFetcher.fetchRosters(team.externalId);
      for (const athlete of athletes) {
        const record = transformNflPlayer(athlete, team.externalId);
        await prisma.players.upsert({
          where: { externalId_sportId: { externalId: record.externalId, sportId: NFL_SPORT_ID } },
          update: {
            name: record.name,
            firstName: record.firstName,
            lastName: record.lastName,
            position: record.position,
            jerseyNumber: record.jerseyNumber,
            teamId: team.id,
          },
          create: {
            sportId: NFL_SPORT_ID,
            teamId: team.id,
            name: record.name,
            firstName: record.firstName,
            lastName: record.lastName,
            position: record.position,
            jerseyNumber: record.jerseyNumber,
            externalId: record.externalId,
          },
        });
        nflCount++;
      }
      process.stdout.write(`  ${team.abbreviation}: ${athletes.length} players\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ${team.abbreviation}: ${msg.slice(0, 100)}`);
    }
  }
  console.log(`NFL: ${nflCount} players synced\n`);

  // NHL: per-team rosters via NHL API
  console.log('--- NHL Players ---');
  const nhlTeams = await prisma.teams.findMany({ where: { sportId: NHL_SPORT_ID } });
  console.log(`Found ${nhlTeams.length} NHL teams`);

  const nhlFetcher = new NhlFetcher();
  let nhlCount = 0;
  for (const team of nhlTeams) {
    try {
      const entries = await nhlFetcher.fetchRosters(team.abbreviation);
      for (const entry of entries) {
        const record = transformNhlPlayer(entry, team.externalId);
        await prisma.players.upsert({
          where: { externalId_sportId: { externalId: record.externalId, sportId: NHL_SPORT_ID } },
          update: {
            name: record.name,
            firstName: record.firstName,
            lastName: record.lastName,
            position: record.position,
            jerseyNumber: record.jerseyNumber,
            heightInches: record.heightInches,
            weightLbs: record.weightLbs,
            teamId: team.id,
          },
          create: {
            sportId: NHL_SPORT_ID,
            teamId: team.id,
            name: record.name,
            firstName: record.firstName,
            lastName: record.lastName,
            position: record.position,
            jerseyNumber: record.jerseyNumber,
            heightInches: record.heightInches,
            weightLbs: record.weightLbs,
            externalId: record.externalId,
          },
        });
        nhlCount++;
      }
      process.stdout.write(`  ${team.abbreviation}: ${entries.length} players\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ${team.abbreviation}: ${msg.slice(0, 100)}`);
    }
  }
  console.log(`NHL: ${nhlCount} players synced\n`);

  console.log('=== Done ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
