/**
 * Injury module live data (integration plan: "Injury Dashboard / Player Risk /
 * Team Risk / League Alerts — How It Works").
 *
 * Backend-first with mock fallback; the app only displays what the backend
 * returns (zones, triggers, scores) — it never computes them itself.
 */

import { useMemo } from 'react';

import { api, type RiskAlert, type PlayerRiskProfile, type TeamRiskResponse } from '@/lib/api';
import { useApiData, type DataSource } from '@/hooks/use-api-data';
import { PLAYERS, type Player, type RiskZone } from '@/data/mock/players';
import { SPORT_BY_ID, type SportId } from '@/data/mock/sports';

// ---------------------------------------------------------------------------
// Adapters: backend shapes → screen shapes
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
    zone: (alert.zone as RiskZone) ?? 'red',
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

function profileToPlayer(
  profile: PlayerRiskProfile,
  sport: SportId,
  extras?: {
    riskHistory?: { computedAt: string; riskScore: number }[];
    gameLogs?: { date: string; minutesPlayed: number | null; backToBack: boolean; isSpike: boolean }[];
  }
): Player {
  const name = profile.playerName;
  return {
    id: String(profile.playerId),
    name,
    firstName: name.split(' ')[0] ?? name,
    lastName: name.split(' ').slice(1).join(' ') || name,
    team: profile.teamName,
    sport,
    position: profile.position ?? '',
    jersey: 0,
    riskScore: profile.riskScore ?? 0,
    zone: (profile.zone as RiskZone) ?? 'insufficient_data',
    triggerMetric: profile.triggerMetric ?? '—',
    explanation: profile.explanation ?? '',
    // The backend computes both sides of the workload bars: the 7-day recent
    // mean vs the 21-day baseline mean (fix: previously recent = baseline).
    minutesRecent: profile.recentMeanMinutes ?? profile.baselineMeanMinutes ?? 0,
    minutesBaseline: profile.baselineMeanMinutes ?? 0,
    minutesZ: profile.minutesZScore ?? 0,
    distanceRecent: profile.recentMeanDistance ?? 0,
    distanceBaseline: 0,
    distanceZ: profile.distanceZScore ?? 0,
    intensityRecent: profile.recentMeanIntensity ?? 0,
    intensityBaseline: 0,
    intensityZ: profile.intensityZScore ?? 0,
    backToBack: profile.backToBackFlag ?? false,
    daysInZone: 0,
    computedAt: profile.computedAt ?? undefined,
    riskHistory: extras?.riskHistory ?? undefined,
    gameLogs: extras?.gameLogs ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// League view (dashboard + alerts)
// ---------------------------------------------------------------------------

export interface LeaguePlayers {
  players: Player[];
  counts: { red: number; yellow: number; green: number };
  source: DataSource;
  lastUpdated: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const FALLBACK_LEAGUE: Player[] = PLAYERS;

function countsOf(players: Player[]): { red: number; yellow: number; green: number } {
  return {
    red: players.filter(p => p.zone === 'red').length,
    yellow: players.filter(p => p.zone === 'yellow').length,
    green: players.filter(p => p.zone === 'green').length,
  };
}

interface LeaguePayload {
  players: Player[];
  counts: { red: number; yellow: number; green: number };
  generatedAt: string | null;
}

/**
 * League view: red + yellow alerts from the backend, zone counts, and the
 * backend's generatedAt timestamp. Green count = roster minus flagged.
 */
export function useLeaguePlayers(sport: SportId) {
  const fallback = useMemo<LeaguePayload>(
    () => ({ players: FALLBACK_LEAGUE.filter(p => p.sport === sport), counts: countsOf(FALLBACK_LEAGUE.filter(p => p.sport === sport)), generatedAt: null }),
    [sport]
  );
  const result = useApiData<LeaguePayload>(
    async opts => {
      const recalc = opts?.recalculate ?? false;
      // Counts come from a dedicated endpoint covering the WHOLE league (no
      // 100-row cap), and the alert lists for the flagged players. A league
      // with zero alerts (all green) still returns real counts — the old code
      // returned null and the whole dashboard fell back to demo data.
      const [red, yellow, counts] = await Promise.all([
        api.leagueAlerts(sport, 'red', 50, recalc),
        api.leagueAlerts(sport, 'yellow', 50, recalc),
        api.injuryCounts(sport),
      ]);
      const alertPlayers = [...red.alerts, ...yellow.alerts].map(a => alertToPlayer(a, sport));
      return {
        players: alertPlayers,
        counts: counts.counts,
        generatedAt: red.generatedAt,
      };
    },
    fallback,
    [sport],
    `league:${sport}`
  );
  return {
    players: result.data.players,
    counts: result.data.counts,
    source: result.source,
    lastUpdated: result.source === 'live' ? result.data.generatedAt : null,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  } satisfies LeaguePlayers;
}

/** League alerts list (red or yellow) for the alerts screen. */
export function useLeagueAlerts(sport: SportId, zone: 'red' | 'yellow' | 'all') {
  const fallback = useMemo(
    () => PLAYERS.filter(p => p.sport === sport && (zone === 'all' ? p.zone !== 'green' : p.zone === zone)),
    [sport, zone]
  );
  const result = useApiData<{ players: Player[]; generatedAt: string | null }>(
    async () => {
      // "All" = red + yellow — the backend validates zone as red|yellow, so
      // fetch both and merge. Each player has exactly one latest score, so
      // there is no overlap to dedupe.
      const zones: ('red' | 'yellow')[] = zone === 'all' ? ['red', 'yellow'] : [zone];
      const responses = await Promise.all(zones.map(z => api.leagueAlerts(sport, z, 50)));
      const players = responses.flatMap(r => r.alerts.map(a => alertToPlayer(a, sport)));
      if (players.length === 0) return null;
      return { players, generatedAt: responses[0]?.generatedAt ?? null };
    },
    { players: fallback, generatedAt: null },
    [sport, zone],
    `alerts:${sport}:${zone}`
  );
  return {
    ...result,
    players: result.data.players,
    generatedAt: result.source === 'live' ? result.data.generatedAt : null,
  };
}

// ---------------------------------------------------------------------------
// Player risk profile
// ---------------------------------------------------------------------------

export function usePlayerRisk(playerId: string | undefined, sport: SportId) {
  const fallback = useMemo(
    () => PLAYERS.find(p => p.id === playerId) ?? PLAYERS.find(p => p.sport === sport) ?? PLAYERS[0],
    [playerId, sport]
  );
  const result = useApiData<Player>(
    async () => {
      if (!playerId) return null;
      // Two requests fire simultaneously (plan: Request A = risk profile,
      // Request B = last 60 days of risk history for the trend chart).
      const [profile, historyRes] = await Promise.all([
        api.playerRisk(playerId),
        api.playerRiskHistory(playerId, 60),
      ]);
      if (!profile.riskScore && !profile.explanation) return null;
      return profileToPlayer(profile, sport, {
        riskHistory: historyRes.history.map(h => ({ computedAt: h.computedAt, riskScore: h.riskScore ?? 0 })),
        gameLogs: profile.gameLogs?.map(g => ({
          date: g.date,
          minutesPlayed: g.minutesPlayed,
          backToBack: g.backToBack,
          isSpike: g.isSpike,
        })),
      });
    },
    fallback,
    [playerId, sport],
    playerId ? `player:${playerId}` : undefined
  );
  return result;
}

// ---------------------------------------------------------------------------
// Team roster
// ---------------------------------------------------------------------------

export interface TeamRosterResult {
  players: Player[];
  /** Resolved backend team id (used by the PDF export + trend endpoints). */
  teamId: number | null;
  source: DataSource;
  lastUpdated: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Resolves a team reference to a backend team row. Accepts a DB id, an exact
 * name, a city or abbreviation, or a fuzzy fragment ("Chiefs" → "Kansas City
 * Chiefs") so the mock team names used by the dashboard still reach the real
 * backend teams.
 */
function resolveTeam(
  teams: { id: number; name: string; abbreviation: string; city: string }[],
  ref: string
): { id: number; name: string } | null {
  const q = ref.trim().toLowerCase();
  if (!q) return null;
  const exact = teams.find(t => t.name.toLowerCase() === q || t.abbreviation.toLowerCase() === q || t.city.toLowerCase() === q);
  if (exact) return { id: exact.id, name: exact.name };
  // Last-word fragment: "Chiefs" matches "Kansas City Chiefs".
  const fragment = teams.find(t => t.name.toLowerCase().includes(q) || t.name.toLowerCase().split(' ').some(w => w.toLowerCase() === q));
  return fragment ? { id: fragment.id, name: fragment.name } : null;
}

/**
 * Team view: accepts either a backend team id (search results carry it) or a
 * team name / abbreviation (dashboard picker, home navigation). Resolves to
 * the backend teamId, fetches the full roster with every player's zone (green
 * included) and the backend's lastUpdated time.
 */
export function useTeamRoster(teamRef: string | undefined, sport: SportId) {
  const teamId = teamRef !== undefined && /^\d+$/.test(teamRef) ? Number(teamRef) : undefined;
  const fallback = useMemo(
    () => (teamId !== undefined ? [] : PLAYERS.filter(p => p.team === teamRef)),
    [teamRef, teamId]
  );
  const result = useApiData<{ players: Player[]; teamId: number | null; lastUpdated: string | null }>(
    async opts => {
      if (!teamRef) return null;
      let roster: TeamRiskResponse | null = null;
      let resolvedId: number | null = null;
      if (teamId !== undefined) {
        roster = await api.teamRisk(teamId, opts?.recalculate ?? false);
        resolvedId = teamId;
      } else {
        const teams = await api.teams(sport);
        const team = resolveTeam(teams.teams, teamRef);
        if (!team) return null;
        resolvedId = team.id;
        roster = await api.teamRisk(team.id, opts?.recalculate ?? false);
      }
      if (!roster || roster.players.length === 0) return null;
      return {
        players: roster.players.map(p => profileToPlayer(p, sport)),
        teamId: resolvedId,
        lastUpdated: roster.lastUpdated,
      };
    },
    { players: fallback, teamId: null, lastUpdated: null },
    [teamRef, sport, teamId],
    teamRef ? `team:${teamRef}` : undefined
  );
  return {
    players: result.data.players,
    teamId: result.data.teamId,
    source: result.source,
    lastUpdated: result.source === 'live' ? result.data.lastUpdated : null,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  } satisfies TeamRosterResult;
}

/** Real team-average risk trend from the backend (the chart's points). */
export function useTeamRiskHistory(teamId: number | null, sport: SportId) {
  const result = useApiData<{ points: { date: string; score: number; playersScored: number }[]; generatedAt: string | null }>(
    async () => {
      if (teamId == null) return null;
      const res = await api.teamRiskHistory(teamId, 30);
      if (res.history.length === 0) return null;
      return {
        points: res.history.map(h => ({ date: h.date, score: h.avgRiskScore, playersScored: h.playersScored })),
        generatedAt: null,
      };
    },
    { points: [], generatedAt: null },
    [teamId, sport]
  );
  return {
    points: result.data.points,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}

/** Real team names for the sport (dashboard team picker) — mock names often
 *  don't exist in the backend, so the picker should offer backend teams. */
export function useTeams(sport: SportId) {
  const fallback = useMemo(
    () => SPORT_BY_ID[sport].teams.map(name => ({ name, id: undefined as number | undefined })),
    [sport]
  );
  const result = useApiData<{ name: string; id?: number }[]>(
    async () => {
      const res = await api.teams(sport);
      if (res.teams.length === 0) return null;
      return res.teams.map(t => ({ name: t.name, id: t.id }));
    },
    fallback,
    [sport],
    `teams:${sport}`
  );
  return result;
}
