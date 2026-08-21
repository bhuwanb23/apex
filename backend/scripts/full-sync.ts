/**
 * Full sync script for all 4 sports.
 * Calls syncSport directly with reasonable caps to avoid excessive API calls.
 *
 * Run with: npx tsx scripts/full-sync.ts
 */
import { syncSport } from '../src/data/sync.coordinator.js';
import { prisma } from '../src/db/client.js';

const SPORTS = ['nba', 'nfl', 'mlb', 'nhl'];

async function main(): Promise<void> {
  console.log('=== Full Data Sync ===\n');

  for (const sport of SPORTS) {
    console.log(`\n--- Syncing ${sport.toUpperCase()} ---`);
    try {
      const result = await syncSport(sport, undefined, {
        triggeredBy: 'manual-script',
        maxPlayByPlayGames: 20,
        maxGameLogPlayers: 50,
      });
      console.log(`Status: ${result.status} in ${result.durationSeconds.toFixed(1)}s`);
      console.log(`Counts:`, JSON.stringify(result.counts, null, 2));
      if (result.errors.length > 0) {
        console.warn(`Errors (${result.errors.length}):`, result.errors.slice(0, 5));
      }
    } catch (err) {
      console.error(`FAILED:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('\n=== Sync Complete ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
