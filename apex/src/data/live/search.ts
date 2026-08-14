/**
 * Search live data (integration plan: "Search Screen — How It Works").
 *
 * After 2+ characters the app asks the backend for players/teams/coaches/
 * games. The backend caches queries; the app only displays what it returns.
 * When the backend has no matches the app falls back to its curated mock
 * data (tagged demo) so the demo stays complete.
 */

import { useEffect, useMemo, useState } from 'react';

import { api } from '@/lib/api';
import { PLAYERS, type Player } from '@/data/mock/players';
import { COACHES, type Coach } from '@/data/mock/coaches';
import { GAMES, type Game } from '@/data/mock/games';
import { SPORTS, type SportId } from '@/data/mock/sports';
import { useOnboarding } from '@/context/onboarding';

export interface SearchResults {
  players: Player[];
  teams: string[];
  coaches: Coach[];
  games: Game[];
}

export interface BackendSearchState {
  results: SearchResults;
  source: 'live' | 'demo';
  /** Debounce gate — only query when the term has 2+ chars. */
  active: boolean;
}

const DEBOUNCE_MS = 250;

export function useBackendSearch(term: string, scope: string): BackendSearchState {
  const { activeSport } = useOnboarding();
  const [source, setSource] = useState<'live' | 'demo'>('demo');

  const live = useMemo(() => ({ players: [] as Player[], teams: [] as string[], coaches: [] as Coach[], games: [] as Game[] }), []);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setSource('demo');
      return;
    }
    setSource('demo');
    const timer = setTimeout(async () => {
      try {
        const [players, teams, coaches, games] = await Promise.all([
          scope === 'All' || scope === 'Players' ? api.searchPlayers(q, activeSport, 8) : null,
          scope === 'All' || scope === 'Teams' ? api.searchTeams(q, activeSport) : null,
          scope === 'All' || scope === 'Coaches' ? api.searchCoaches(q, activeSport) : null,
          scope === 'All' || scope === 'Games' ? api.searchGames({ sport: activeSport, limit: 8 }) : null,
        ]);
        const hasAny =
          (players?.players.length ?? 0) > 0 ||
          (teams?.teams.length ?? 0) > 0 ||
          (coaches?.coaches.length ?? 0) > 0 ||
          (games?.games.length ?? 0) > 0;
        if (hasAny) {
          live.players = (players?.players ?? []).map(p => ({
            id: String(p.playerId),
            name: p.playerName,
            firstName: p.playerName.split(' ')[0] ?? p.playerName,
            lastName: p.playerName.split(' ').slice(1).join(' ') || p.playerName,
            team: p.teamName,
            sport: (p.sport as SportId) ?? activeSport,
            position: p.position ?? '',
            jersey: 0,
            riskScore: 0,
            zone: 'insufficient_data',
            triggerMetric: '—',
            explanation: '',
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
            daysInZone: 0,
          }));
          live.teams = (teams?.teams ?? []).map(t => t.teamName);
          live.coaches = (coaches?.coaches ?? []).map(c => ({
            id: String(c.coachId),
            name: c.coachName,
            team: c.teamName,
            sport: (c.sport as SportId) ?? activeSport,
            rank: 0,
            evRate: 0,
            totalDecisions: 0,
            optimalDecisions: 0,
            avgEvLeft: 0,
            trend: 'flat',
            matrix: { 'good-good': 0, 'good-bad': 0, 'bad-good': 0, 'bad-bad': 0 },
          }));
          live.games = (games?.games ?? []).map(g => ({
            id: String(g.gameId),
            sport: (g.sport as SportId) ?? activeSport,
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
          }));
          setSource('live');
        }
      } catch {
        // stay on demo fallback
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, scope, activeSport, live]);

  return { results: live, source, active: term.trim().length >= 2 };
}

/** Convenience: whether any mock data exists for a team name (used by team rows). */
export function sportForTeam(team: string): string {
  const sport = SPORTS.find(s => s.teams.includes(team));
  return sport ? sport.short : '';
}
