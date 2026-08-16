/**
 * Decisions module live data (integration plan: "Coach Leaderboard / Coach
 * Detail / Game Decisions — How It Works").
 *
 * Backend-first with mock fallback. The backend computes EV rates, ranks and
 * the process-vs-outcome matrix; the app only renders them.
 */

import { useMemo, useState } from 'react';

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
    // Backend reports the average EV left as a fraction (avgEvDifference);
    // the screen shows it as a percentage.
    avgEvLeft: (score.avgEvDifference ?? score.avgEvLeft ?? 0) * 100,
    trend: trendToScreen(score.trend),
    matrix: { 'good-good': 0, 'good-bad': 0, 'bad-good': 0, 'bad-bad': 0 },
  };
}

function decisionToScreen(d: CoachDecision): Decision {
  return {
    id: String(d.id),
    gameId: String(d.gameId),
    coachId: d.coachId != null ? String(d.coachId) : '',
    coachName: d.coachName ?? '',
    team: d.team ?? '',
    sport: (d.sport as SportId) ?? 'NFL',
    // Backend sends gameDate / decisionType; tolerate the older names too.
    date: (d.gameDate ?? d.date ?? '').slice(0, 10),
    opponent: d.opponent ?? '',
    type: ((d.decisionType ?? d.type) as Decision['type']) ?? '4th_down',
    situation: d.situation ?? '',
    chosenAction: d.chosenAction,
    evChosen: d.evChosen,
    evBest: d.evBest,
    isOptimal: d.isOptimal,
    outcome: d.outcome ?? '',
    outcomeSuccess: d.outcomeSuccess ?? false,
    period: d.period != null ? String(d.period) : '',
    clock: d.clock ?? '',
    alternativeActions: Array.isArray(d.alternativeActions) ? d.alternativeActions : undefined,
    winProbabilityBefore: d.winProbabilityBefore ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export interface LeaderboardData {
  coaches: Coach[];
  source: DataSource;
  loading: boolean;
  /** When the backend last generated the ranking — drives freshness display. */
  generatedAt: string | null;
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
  // Set inside the async fetcher (not during render), so no refs-during-render.
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const result = useApiData<Coach[]>(
    async () => {
      const board = await api.leaderboard(sport, { ...opts, limit: 50 });
      if (board.coaches.length === 0) return null;
      setGeneratedAt(board.generatedAt ?? null);
      return board.coaches.map(c => scorecardToCoach(c, sport));
    },
    fallback,
    [sport, opts?.season, opts?.decisionType, opts?.gameType],
    `leaderboard:${sport}:${opts?.season ?? ''}:${opts?.decisionType ?? 'all'}:${opts?.gameType ?? 'all'}`
  );

  return {
    coaches: result.data,
    source: result.source,
    loading: result.loading,
    refetch: result.refetch,
    generatedAt: result.source === 'live' ? generatedAt : null,
  };
}

// ---------------------------------------------------------------------------
// Coach detail
// ---------------------------------------------------------------------------

export interface CoachDetailData {
  coach: Coach;
  decisions: Decision[];
  source: DataSource;
  loading: boolean;
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
      const { coach, summary, processVsOutcome } = detail;
      return {
        coach: {
          id: String(coach.coachId),
          name: coach.coachName,
          team: coach.teamName,
          sport: (coach.sport as SportId) ?? sport,
          rank: summary.rank ?? 0,
          evRate: summary.evRate,
          totalDecisions: summary.totalDecisions,
          optimalDecisions: summary.optimalDecisions,
          // Backend fraction → percentage for the stat box.
          avgEvLeft: (summary.avgEvDifference ?? 0) * 100,
          trend: 'flat',
          matrix: {
            'good-good': processVsOutcome?.goodProcessGoodOutcome ?? 0,
            'good-bad': processVsOutcome?.goodProcessBadOutcome ?? 0,
            'bad-good': processVsOutcome?.badProcessGoodOutcome ?? 0,
            'bad-bad': processVsOutcome?.badProcessBadOutcome ?? 0,
          },
        } as Coach,
        decisions: detail.decisions.map(decisionToScreen),
      };
    },
    fallback,
    [coachId, sport],
    coachId ? `coachDetail:${coachId}` : undefined
  );

  return { ...result.data, source: result.source, loading: result.loading, refetch: result.refetch };
}

// ---------------------------------------------------------------------------
// Game decisions
// ---------------------------------------------------------------------------

export function useGameDecisions(gameId: string | undefined, sport: SportId) {
  const fallback = useMemo(() => {
    const game = GAMES.find(g => g.id === gameId) ?? GAMES[0];
    const decisions = DECISIONS.filter(d => d.gameId === game.id);
    return { game, decisions };
  }, [gameId]);

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
    [gameId, sport],
    gameId ? `gameDecisions:${gameId}` : undefined
  );

  return { ...result.data, source: result.source, loading: result.loading, refetch: result.refetch };
}
