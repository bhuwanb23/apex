import { prisma } from '../src/db/client.js';
import { NflFetcher } from '../src/data/nfl/nfl.fetcher.js';
import { NhlFetcher } from '../src/data/nhl/nhl.fetcher.js';
import { transformPlayer as transformNflPlayer } from '../src/data/nfl/nfl.transformer.js';
import { transformPlayer as transformNhlPlayer } from '../src/data/nhl/nhl.transformer.js';

const NFL_SPORT_ID = 2;
const NHL_SPORT_ID = 7;

async function main(): Promise<void> {
  console.log('=== Debug Player Sync ===\n');

  // NFL test
  console.log('--- NFL Test ---');
  const nflTeam = await prisma.teams.findFirst({ where: { sportId: NFL_SPORT_ID } });
  if (!nflTeam) { console.error('No NFL team found'); return; }
  console.log(`Using team: ${nflTeam.abbreviation} id=${nflTeam.id} externalId=${nflTeam.externalId}`);

  const nflFetcher = new NflFetcher();
  const athletes = await nflFetcher.fetchRosters(nflTeam.externalId);
  console.log(`Fetched ${athletes.length} athletes`);

  if (athletes.length > 0) {
    const record = transformNflPlayer(athletes[0], nflTeam.externalId);
    console.log('Transformed record:', JSON.stringify(record, null, 2));

    try {
      const result = await prisma.players.upsert({
        where: {
          externalId_sportId: {
            externalId: record.externalId,
            sportId: NFL_SPORT_ID,
          },
        },
        update: {
          name: record.name,
          firstName: record.firstName,
          lastName: record.lastName,
          position: record.position,
          jerseyNumber: record.jerseyNumber,
          teamId: nflTeam.id,
        },
        create: {
          sportId: NFL_SPORT_ID,
          teamId: nflTeam.id,
          name: record.name,
          firstName: record.firstName,
          lastName: record.lastName,
          position: record.position,
          jerseyNumber: record.jerseyNumber,
          age: record.age,
          heightInches: record.heightInches,
          weightLbs: record.weightLbs,
          externalId: record.externalId,
        },
      });
      console.log('UPSERT OK, id:', result.id);
    } catch (e) {
      console.log('UPSERT FAILED:', e);
    }
  }

  // NHL test
  console.log('\n--- NHL Test ---');
  const nhlFetcher = new NhlFetcher();
  try {
    const entries = await nhlFetcher.fetchRosters('BOS');
    console.log(`Fetched ${entries.length} NHL entries`);
    if (entries.length > 0) {
      console.log('First entry:', JSON.stringify(entries[0], null, 2));
    }
  } catch (e) {
    console.log('NHL roster FAILED:', e instanceof Error ? e.message : e);
  }
}

main().finally(() => prisma.$disconnect());
