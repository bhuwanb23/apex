import { prisma } from '../src/db/client.js';

async function main(): Promise<void> {
  // Player counts per sport
  const playerCounts = await prisma.players.groupBy({ by: ['sportId'], _count: true });
  console.log('=== PLAYERS BY SPORT ===');
  for (const c of playerCounts) {
    const sport = await prisma.sports.findUnique({ where: { id: c.sportId }, select: { abbreviation: true } });
    console.log(`  ${sport?.abbreviation ?? '?'}: ${c._count} players`);
  }

  // Game log counts per sport
  const gameLogCounts = await prisma.playerGameLogs.groupBy({ by: ['sportId' as never], _count: true }).catch(() => []);
  console.log('=== GAME LOGS BY SPORT ===');
  for (const c of gameLogCounts) {
    const sport = await prisma.sports.findUnique({ where: { id: (c as Record<string, unknown>).sportId as number }, select: { abbreviation: true } });
    console.log(`  ${sport?.abbreviation ?? '?'}: ${c._count} game logs`);
  }

  // Injury risk score counts
  const riskCounts = await prisma.injuryRiskScores.count();
  console.log(`=== INJURY RISK SCORES: ${riskCounts} total ===`);

  // Coach decisions per sport
  const coachCounts = await prisma.coachDecisions.groupBy({ by: ['sportId' as never], _count: true }).catch(() => []);
  console.log('=== COACH DECISIONS BY SPORT ===');
  for (const c of coachCounts) {
    const sport = await prisma.sports.findUnique({ where: { id: (c as Record<string, unknown>).sportId as number }, select: { abbreviation: true } });
    console.log(`  ${sport?.abbreviation ?? '?'}: ${c._count} decisions`);
  }

  // Momentum analysis per sport
  const momentumCounts = await prisma.momentumAnalysis.findMany({ select: { sportId: true, season: true } });
  console.log('=== MOMENTUM ANALYSIS ===');
  for (const m of momentumCounts) {
    const sport = await prisma.sports.findUnique({ where: { id: m.sportId }, select: { abbreviation: true } });
    console.log(`  ${sport?.abbreviation ?? '?'} season=${m.season}`);
  }

  // Play by play counts per sport
  const pbpCount = await prisma.$queryRaw`SELECT sportId, COUNT(*) as cnt FROM PlayByPlay GROUP BY sportId`;
  console.log('=== PLAY BY PLAY BY SPORT ===');
  for (const row of pbpCount as Array<{ sportId: number; cnt: bigint }>) {
    const sport = await prisma.sports.findUnique({ where: { id: row.sportId }, select: { abbreviation: true } });
    console.log(`  ${sport?.abbreviation ?? '?'}: ${row.cnt} plays`);
  }
}

main().finally(() => prisma.$disconnect());
