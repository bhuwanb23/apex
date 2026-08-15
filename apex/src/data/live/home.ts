/**
 * Home screen data (integration plan: "Home Screen — How It Gets Its Data").
 *
 * Four parallel backend requests:
 *   1. Top injury alerts for the sport
 *   2. Best decision spotlight (leaderboard top coach + a notable decision)
 *   3. Momentum verdict for the sport
 *   4. Recent games (last 48h)
 *
 * Every hook is backend-first and falls back to curated mock data with the
 * source tagged 'live' | 'demo' so the UI can note "demo data" when needed.
 */

import { useMemo } from 'react';

import { api } from '@/lib/api';
import { useApiData, type DataSource } from '@/hooks/use-api-data';
import { useOnboarding } from '@/context/onboarding';
import { MOMENTUM_VERDICTS, type SportId } from '@/data/mock/sports';
import { PLAYERS, type Player } from '@/data/mock/players';
import { COACHES, DECISIONS, type Coach, type Decision } from '@/data/mock/coaches';
import { GAMES, type Game } from '@/data/mock/games';
import type { RiskAlert } from '@/lib/api';

// ---------------------------------------------------------------------------
// Adapters: backend shape → screen shape
// ---------------------------------------------------------------------------

function alertToPlayer(alert: RiskAlert, sport: SportId): Player {
  return {
    id: String(alert.playerId),
    name: alert.playerName,
    firstName: alert.playerName.split(' ')[0] ?? alert.playerName,
    lastName: alert.playerName.split(' ').slice(1).join(' ') || alert.playerName,
    team: alert.teamName,
    sport,
    position: alert.position ?? '',
    jersey: 0,
    riskScore: alert.riskScore ?? 0,
    zone: (alert.zone as Player['zone']) ?? 'red',
    triggerMetric: alert.triggerMetric ?? '↑ Workload',
    explanation: alert.explanation,
    minutesRecent: 0,
    minutesBaseline: 0,
    minutesZ: 0,
    distanceRecent: 0,
    distanceBaseline: 0,
    distanceZ: 0,
    intensityRecent: 0,
    intensityBaseline: 0,
    intensityZ: 0,
    backToBack: false,
    daysInZone: alert.daysInZone ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Hooks — one per Home section (run in parallel)
// ---------------------------------------------------------------------------

/** Top 3 red-zone players for the sport. */
export function useHomeInjuryWatch(sport: SportId) {
  const fallback = useMemo(
    () => PLAYERS.filter(p => p.sport === sport && p.zone === 'red').slice(0, 3),
    [sport]
  );
  const result = useApiData<Player[]>(
    async () => {
      const res = await api.leagueAlerts(sport, 'red', 3);
      return res.alerts.length > 0 ? res.alerts.map(a => alertToPlayer(a, sport)) : null;
    },
    fallback,
    [sport],
    `home:injury:${sport}`
  );
  return result;
}

/** Decision spotlight: top coach + their most notable optimal decision. */
export function useHomeDecisionSpotlight(sport: SportId) {
  const fallback = useMemo(() => {
    const decision = DECISIONS.find(d => d.sport === sport && d.isOptimal && d.outcomeSuccess) ?? DECISIONS[0];
    const coach = COACHES.find(c => c.sport === sport) ?? COACHES[0];
    return { decision, coach };
  }, [sport]);

  const result = useApiData<{ decision: Decision; coach: Coach }>(
    async () => {
      const board = await api.leaderboard(sport, { limit: 5 });
      const top = board.coaches[0];
      if (!top) return null;
      const detail = await api.coachDecisions(top.coachId, { limit: 30 });
      const notable = detail.decisions.find(d => d.isOptimal && d.outcomeSuccess) ?? detail.decisions[0];
      if (!notable) return null;
      return {
        decision: notable as Decision,
        coach: {
          id: String(top.coachId),
          name: top.coachName,
          team: top.teamName,
          sport,
          rank: top.rank ?? 1,
          evRate: top.evRate,
          totalDecisions: top.totalDecisions,
          optimalDecisions: top.optimalDecisions,
          avgEvLeft: (top.avgEvDifference ?? top.avgEvLeft ?? 0) * 100,
          trend: top.trend === 'up' || top.trend === 'down' ? top.trend : 'flat',
          matrix: { 'good-good': 0, 'good-bad': 0, 'bad-good': 0, 'bad-bad': 0 },
        } as Coach,
      };
    },
    fallback,
    [sport],
    `home:decision:${sport}`
  );
  return result;
}

/** Momentum verdict for the sport. */
export function useHomeMomentum(sport: SportId) {
  const fallback = useMemo(
    () => MOMENTUM_VERDICTS.find(v => v.sport === sport) ?? MOMENTUM_VERDICTS[0],
    [sport]
  );
  const result = useApiData(
    async () => {
      const v = await api.momentumAnalysis(sport);
      const hasStats = (v.context?.gamesAnalyzed ?? 0) > 0;
      if (!hasStats) return null;
      // The backend nests the verdict fields under `verdict`.
      const verdict = v.verdict ?? {};
      const label = verdict.isSignificant
        ? 'real'
        : verdict.verdictLabel === 'insufficient_data'
          ? 'inconclusive'
          : 'myth';
      return {
        sport: v.sport as SportId,
        verdict: label as 'real' | 'myth' | 'inconclusive',
        effectSize: v.statistics.effectSize ?? 0,
        pValue: v.statistics.pValue ?? 1,
        hazardCoefficient: v.statistics.hazardCoefficient ?? 1,
        ciLow: v.statistics.confidenceIntervalLow ?? 0,
        ciHigh: v.statistics.confidenceIntervalHigh ?? 0,
        gamesAnalyzed: v.context.gamesAnalyzed,
        season: v.season,
        explanation: v.plainExplanation,
      };
    },
    fallback,
    [sport],
    `home:momentum:${sport}`
  );
  return result;
}

/** Recent games (last 48h) for the sport. */
export function useHomeGames(sport: SportId) {
  const fallback = useMemo(
    () => GAMES.filter(g => g.sport === sport && g.nightsAgo <= 2).slice(0, 3),
    [sport]
  );
  const result = useApiData<Game[]>(
    async () => {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const res = await api.searchGames({ sport, dateFrom: twoDaysAgo, limit: 6 });
      if (res.games.length === 0) return null;
      return res.games.map(g => ({
        id: String(g.gameId),
        sport,
        homeTeam: g.homeTeamName,
        awayTeam: g.awayTeamName,
        homeScore: g.homeScore ?? 0,
        awayScore: g.awayScore ?? 0,
        date: g.date.slice(0, 10),
        nightsAgo: 0,
        season: g.season,
        homeCoach: '',
        awayCoach: '',
        homeEvRate: 0,
        awayEvRate: 0,
        momentumShifts: 0,
        longestStreak: '',
        momentumLeader: '',
        verdict: '',
        timeline: [],
        events: [],
        decisions: [],
      })) as Game[];
    },
    fallback,
    [sport],
    `home:games:${sport}`
  );
  return result;
}

// ---------------------------------------------------------------------------
// Convenience: all four in one (for skeletons + demo tags)
// ---------------------------------------------------------------------------

export interface HomeData {
  sport: SportId;
  injury: { players: Player[]; source: DataSource; loading: boolean };
  decision: { decision: Decision; coach: Coach; source: DataSource; loading: boolean };
  momentum: { verdict: (typeof MOMENTUM_VERDICTS)[number]; source: DataSource; loading: boolean };
  games: { games: Game[]; source: DataSource; loading: boolean };
}

export function useHomeData(): HomeData {
  const { activeSport } = useOnboarding();
  const injury = useHomeInjuryWatch(activeSport);
  const decision = useHomeDecisionSpotlight(activeSport);
  const momentum = useHomeMomentum(activeSport);
  const games = useHomeGames(activeSport);

  return {
    sport: activeSport,
    injury: { players: injury.data, source: injury.source, loading: injury.loading },
    decision: { decision: decision.data.decision, coach: decision.data.coach, source: decision.source, loading: decision.loading },
    momentum: { verdict: momentum.data, source: momentum.source, loading: momentum.loading },
    games: { games: games.data, source: games.source, loading: games.loading },
  };
}
