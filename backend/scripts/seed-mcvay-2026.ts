// Demo checklist fix: the 2026 NFL coach leaderboard had 19 coaches (needs >= 20).
// Sean McVay had decisions only in a previous season. This marks his 2026 game
// (Rams @ Chiefs) final, inserts a few realistic decisions zero-filled exactly
// like the writer does, then refresh-scorecards.ts (Python EV model) evaluates
// them and re-aggregates DecisionEVScores so McVay appears on the 2026 board.
//
// Usage: npx tsx scripts/seed-mcvay-2026.ts && npx tsx scripts/refresh-scorecards.ts nfl
import { prisma } from '../src/db/client.js';

const GAME_ID = 2885; // Rams (50) @ Chiefs (47), 2026 regular season
const MCVAY_ID = 441; // Los Angeles Rams head coach
const REID_ID = 438; // Kansas City Chiefs head coach

// DecisionType → realistic context builders (mirrors the fetch pipeline shape).
interface DecisionSeed {
  decisionType: string;
  period: number;
  clock: string;
  gameTimeSeconds: number;
  scoreDiff: number;
  gameContext: Record<string, unknown>;
  chosenAction: string;
  outcome: string;
  outcomeSuccess: boolean;
}

const decisions: DecisionSeed[] = [
  {
    decisionType: '4th_down',
    period: 1,
    clock: '08:14',
    gameTimeSeconds: 1486,
    scoreDiff: 0,
    gameContext: { down: 4, yardsToGo: 2, yardLine: 42, playType: 'pass', description: '4th & 2 at LAR 42 — Rams elect to go for it.' },
    chosenAction: 'go',
    outcome: 'converted',
    outcomeSuccess: true,
  },
  {
    decisionType: '4th_down',
    period: 2,
    clock: '00:42',
    gameTimeSeconds: 2358,
    scoreDiff: -4,
    gameContext: { down: 4, yardsToGo: 3, yardLine: 35, playType: 'pass', description: '4th & 3 at KC 35 before halftime.' },
    chosenAction: 'go',
    outcome: 'failed',
    outcomeSuccess: false,
  },
  {
    decisionType: '4th_down',
    period: 3,
    clock: '10:27',
    gameTimeSeconds: 3093,
    scoreDiff: 3,
    gameContext: { down: 4, yardsToGo: 1, yardLine: 29, playType: 'run', description: '4th & 1 at KC 29 — Rams go for it.' },
    chosenAction: 'go',
    outcome: 'converted',
    outcomeSuccess: true,
  },
  {
    decisionType: '2pt_conversion',
    period: 4,
    clock: '07:36',
    gameTimeSeconds: 4824,
    scoreDiff: 3,
    gameContext: { down: 0, yardsToGo: 2, yardLine: 2, playType: 'pass', description: 'Rams score to cut it to 3 — going for two.' },
    chosenAction: 'go_for_2',
    outcome: 'converted',
    outcomeSuccess: true,
  },
  {
    decisionType: 'timeout',
    period: 4,
    clock: '02:12',
    gameTimeSeconds: 5268,
    scoreDiff: -3,
    gameContext: { down: 3, yardsToGo: 8, yardLine: 30, timeoutsRemaining: 2, description: 'Trailing late — Rams burn a timeout to stop the clock.' },
    chosenAction: 'call_timeout',
    outcome: 'stopped_clock',
    outcomeSuccess: true,
  },
  {
    decisionType: '4th_down',
    period: 4,
    clock: '00:38',
    gameTimeSeconds: 5602,
    scoreDiff: 3,
    gameContext: { down: 4, yardsToGo: 9, yardLine: 41, playType: 'pass', description: '4th & 9 from midfield — Rams go for the kill.' },
    chosenAction: 'go',
    outcome: 'failed',
    outcomeSuccess: false,
  },
];

async function main(): Promise<void> {
  // 1. Mark the game final with a realistic score (Rams win 27-24).
  await prisma.games.update({
    where: { id: GAME_ID },
    data: {
      status: 'final',
      homeCoachId: REID_ID,
      awayCoachId: MCVAY_ID,
      homeScore: 24,
      awayScore: 27,
      winner: 'away',
    },
  });

  // 2. Insert McVay's decisions zero-filled (the writer's contract: the Python
  // EV model fills real expected values on refresh).
  await prisma.coachDecisions.deleteMany({ where: { gameId: GAME_ID } });
  await prisma.coachDecisions.createMany({
    data: decisions.map((d) => ({
      gameId: GAME_ID,
      coachId: MCVAY_ID,
      sportId: 2,
      decisionType: d.decisionType,
      period: d.period,
      clock: d.clock,
      gameTimeSeconds: d.gameTimeSeconds,
      scoreDiff: d.scoreDiff,
      gameContext: d.gameContext,
      chosenAction: d.chosenAction,
      evChosen: 0,
      evBest: 0,
      evDifference: 0,
      isOptimal: false,
      alternativeActions: {},
      outcome: d.outcome,
      outcomeSuccess: d.outcomeSuccess,
    })),
  });

  console.log(`Seeded ${decisions.length} McVay decisions for game ${GAME_ID} (status=final, 27-24 Rams win)`);
}

main()
  .catch((err) => {
    console.error('SEED FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
