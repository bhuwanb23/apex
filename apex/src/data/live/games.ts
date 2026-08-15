/**
 * Live game lists (integration plan: "Search → Game Replay" and the decisions
 * tab's "Game decision reviews").
 *
 * Both screens previously rendered the hardcoded mock `GAMES` array, so real
 * (backend) games could never appear. This hook fetches recent games for the
 * sport via the search-games endpoint and maps them into the screen's Game
 * shape, falling back to the curated mock list when the backend has none.
 */

import { useMemo } from 'react';

import { api } from '@/lib/api';
import { useApiData } from '@/hooks/use-api-data';
import { GAMES, type Game } from '@/data/mock/games';
import { type SportId } from '@/data/mock/sports';

/** Backend search-game row → screen Game shape (display fields). */
function gameRowToGame(row: {
  gameId: number;
  date: string;
  season: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore?: number | null;
  awayScore?: number | null;
}, sport: SportId): Game {
  return {
    id: String(row.gameId),
    sport,
    homeTeam: row.homeTeamName,
    awayTeam: row.awayTeamName,
    homeScore: row.homeScore ?? 0,
    awayScore: row.awayScore ?? 0,
    date: row.date.slice(0, 10),
    nightsAgo: 0,
    season: row.season,
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
  } as Game;
}

/**
 * Recent games for a sport, backend-first. The mock `GAMES` list is the
 * fallback so the screens keep working with demo data offline.
 */
export function useRecentGames(sport: SportId, limit = 10) {
  const fallback = useMemo(() => GAMES.filter(g => g.sport === sport).slice(0, limit), [sport, limit]);
  const result = useApiData<Game[]>(
    async () => {
      const res = await api.searchGames({ sport, limit });
      if (res.games.length === 0) return null;
      return res.games.map(g => gameRowToGame(g, sport));
    },
    fallback,
    [sport, limit],
    `recentGames:${sport}`
  );
  return result;
}
