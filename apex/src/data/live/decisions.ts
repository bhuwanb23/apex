/**
 * Decisions module live data (integration plan: "Coach Leaderboard / Coach
 * Detail / Game Decisions — How It Works").
 *
 * Backend-first with mock fallback. The backend computes EV rates, ranks and
 * the process-vs-outcome matrix; the app only renders them.
 */

import { useMemo } from 'react';

import { api, type CoachDecision, type CoachScorecard } from '@/lib/api';
import { useApiData, type DataSource } from '@/hooks/use-api-data';
import { COACHES, DECISIONS, type Coach, type Decision } from '@/data/mock/coaches';
import { GAMES, type Game } from '@/data/mock/games';
import { type SportId } from '@/data/mock/sports';

// ---------------------------------------------------------------------------
// Adapters: backend shapes → screen shapes
// ---------------------------------------------------------------------------

/** Backend trend ('up'/'down'/'same') → screen trend ('up'/'down'/'flat'). */
function trendToScreen(trend?: CoachScorecard['trend']): Coach['trend'] {
  return trend === 'up' || trend === 'down' ? trend : 'flat';
}

function scorecardToCoach(score: CoachScorecard, sport: SportId): Coach {
  return {
    id: String(score.coachId),
    name: score.coachName,
    team: score.teamName,
    sport,
    rank: score.rank ?? 0,
    evRate: score.evRate,
    totalDecisions: score.totalDecisions,
    optimalDecisions: score.optimalDecisions,
    avgEvLeft: score.avgEvLeft ?? 0,
    trend: trendToScreen(score.trend),
    matrix: { 'good-good': 0, 'good-bad': 0, 'bad-good': 0, 'bad-bad': 0 },
  };
}

function decisionToScreen(d: CoachDecision): Decision {
  return {
    id: String(d.id),
    gameId: String(d.gameId),
    coachId: String(d.coachId),
    coachName: d.coachName,
    team: d.team,
    sport: d.sport as SportId,
    date: d.date,
    opponent: d.opponent,
    type: (d.type as Decision['type']) ?? '4th_down',
    situation: d.situation,
    chosenAction: d.chosenAction,
    evChosen: d.evChosen,
    evBest: d.evBest,
    isOptimal: d.isOptimal,
    outcome: d.outcome,
    outcomeSuccess: d.outcomeSuccess,
    period: d.period,
    clock: d.clock,
  };
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export interface LeaderboardData {
  coaches: Coach[];
  source: DataSource;
}

export function useCoachLeaderboard(
  sport: SportId,
  opts?: { season?: string; decisionType?: string; gameType?: string }
) {
  const fallback = useMemo(
    () =>
      COACHES.filter(c => c.sport === sport)
        .slice()
        .sort((a, b) => a.rank - b.rank),
    [sport]
  );

  const result = useApiData<Coach[]>(
    async () => {
      const board = await api.leaderboard(sport, { ...opts, limit: 50 });
      if (board.coaches.length === 0) return null;
      return board.coaches.map(c => scorecardToCoach(c, sport));
    },
    fallback,
    [sport, opts?.season, opts?.decisionType, opts?.gameType]
  );

  return { coaches: result.data, source: result.source, refetch: result.refetch };
}

// ---------------------------------------------------------------------------
// Coach detail
// ---------------------------------------------------------------------------

export interface CoachDetailData {
  coach: Coach;
  decisions: Decision[];
  source: DataSource;
}

export function useCoachDetail(coachId: string | undefined, sport: SportId) {
  const fallback = useMemo(() => {
    const coach = COACHES.find(c => c.id === coachId) ?? COACHES.find(c => c.sport === sport) ?? COACHES[0];
    const decisions = DECISIONS.filter(d => d.coachId === coach.id);
    return { coach, decisions };
  }, [coachId, sport]);

  const result = useApiData<{ coach: Coach; decisions: Decision[] }>(
    async () => {
      if (!coachId) return null;
      const detail = await api.coachDecisions(Number(coachId), { limit: 50 });
      if (!detail.coach) return null;
      const { processVsOutcome } = detail;
      const liveSport = (detail.coach as { sport?: string }).sport as SportId | undefined;
      return {
        coach: {
          ...scorecardToCoach(detail.coach, liveSport ?? sport),
          matrix: {
            'good-good': processVsOutcome?.goodProcessGoodOutcome ?? 0,
            'good-bad': processVsOutcome?.goodProcessBadOutcome ?? 0,
            'bad-good': processVsOutcome?.badProcessGoodOutcome ?? 0,
            'bad-bad': processVsOutcome?.badProcessBadOutcome ?? 0,
          },
        },
        decisions: detail.decisions.map(decisionToScreen),
      };
    },
    fallback,
    [coachId, sport]
  );

  return { ...result.data, source: result.source, refetch: result.refetch };
}

// ---------------------------------------------------------------------------
// Game decisions
// ---------------------------------------------------------------------------

export function useGameDecisions(gameId: string | undefined, sport: SportId) {
  const fallback = useMemo(() => {
    const game = GAMES.find(g => g.id === gameId) ?? GAMES[0];
    const decisions = DECISIONS.filter(d => d.gameId === game.id);
    return { game, decisions };
  }, [gameId, sport]);

  const result = useApiData<{ game: Game; decisions: Decision[] }>(
    async () => {
      if (!gameId) return null;
      const detail = await api.gameDecisions(Number(gameId));
      if (detail.decisions.length === 0) return null;
      return {
        game: {
          id: String(detail.gameId),
          sport,
          homeTeam: detail.homeCoach?.team ?? 'Home',
          awayTeam: detail.awayCoach?.team ?? 'Away',
          homeScore: 0,
          awayScore: 0,
          date: '',
          nightsAgo: 0,
          season: '',
          homeCoach: detail.homeCoach?.name ?? '',
          awayCoach: detail.awayCoach?.name ?? '',
          homeEvRate: 0,
          awayEvRate: 0,
          momentumShifts: 0,
          longestStreak: '',
          momentumLeader: '',
          verdict: '',
          timeline: [],
          events: [],
          decisions: detail.decisions.map(decisionToScreen),
        } as Game,
        decisions: detail.decisions.map(decisionToScreen),
      };
    },
    fallback,
    [gameId, sport]
  );

  return { ...result.data, source: result.source, refetch: result.refetch };
}
