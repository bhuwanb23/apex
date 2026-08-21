import { prisma } from '../src/db/client.js';

async function main() {
  // Check most recent NHL game log dates
  const recent = await prisma.$queryRaw`
    SELECT date, COUNT(*) as cnt 
    FROM PlayerGameLogs 
    WHERE playerId IN (SELECT id FROM Players WHERE sportId = 7)
    GROUP BY date 
    ORDER BY date DESC 
    LIMIT 5
  `;
  console.log('Recent NHL game log dates:', recent);

  // Check most recent NBA game log dates for comparison
  const nbaRecent = await prisma.$queryRaw`
    SELECT date, COUNT(*) as cnt 
    FROM PlayerGameLogs 
    WHERE playerId IN (SELECT id FROM Players WHERE sportId = 1)
    GROUP BY date 
    ORDER BY date DESC 
    LIMIT 5
  `;
  console.log('Recent NBA game log dates:', nbaRecent);
}

main().then(() => prisma.$disconnect());
