/**
 * Repairs placeholder games whose homeTeamId === awayTeamId (created by the
 * old writePlayerGameLogs auto-create path). Uses PlayerGameLogs grouped by
 * gameId to find each game's two distinct teams — no API calls needed.
 *
 * Run with: npx tsx scripts/backfill-placeholder-games.ts [sportCode]
 */
import { prisma } from '../src/db/client.js';

async function main(): Promise<void> {
  const sportArg = process.argv[2];

  // Find broken games (home === away) that actually have logs.
  const sports = await prisma.sports.findMany(
    sportArg ? { where: { abbreviation: sportArg } } : undefined
  );

  let repaired = 0;
  let stillSingle = 0;

  for (const sport of sports) {
    const broken = await prisma.games.findMany({
      where: { sportId: sport.id, homeTeamId: { equals: prisma.games.fields.awayTeamId } },
      select: { id: true, externalId: true },
    });
    if (broken.length === 0) {
      console.log(`${sport.abbreviation}: 0 home==away games`);
      continue;
    }

    console.log(`${sport.abbreviation}: ${broken.length} home==away games to repair`);
    const gameIds = broken.map(g => g.id);

    const byGame = new Map<number, Set<number>>();
    const CHUNK = 500;
    for (let i = 0; i < gameIds.length; i += CHUNK) {
      const slice = gameIds.slice(i, i + CHUNK);
      const logTeams = await prisma.playerGameLogs.groupBy({
        by: ['gameId', 'teamId'],
        where: { gameId: { in: slice } },
      });
      for (const row of logTeams) {
        const set = byGame.get(row.gameId) ?? new Set<number>();
        set.add(row.teamId);
        byGame.set(row.gameId, set);
      }
    }

    for (const game of broken) {
      const [home, away] = [...(byGame.get(game.id) ?? [])].sort((a, b) => a - b);
      if (home !== undefined && away !== undefined) {
        await prisma.games.update({
          where: { id: game.id },
          data: { homeTeamId: home, awayTeamId: away },
        });
        repaired++;
      } else {
        stillSingle++;
      }
    }
    console.log(`${sport.abbreviation}: done`);
  }

  console.log(`\nRepaired: ${repaired}, still single-team (no opponent in logs): ${stillSingle}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async err => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
