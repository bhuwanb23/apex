/**
 * Injury module live data (integration plan: "Injury Dashboard / Player Risk /
 * Team Risk / League Alerts — How It Works").
 *
 * Backend-first with mock fallback; the app only displays what the backend
 * returns (zones, triggers, scores) — it never computes them itself.
 */

import { useMemo } from 'react';

import { api, type RiskAlert, type PlayerRiskProfile } from '@/lib/api';
import { useApiData, type DataSource } from '@/hooks/use-api-data';
import { PLAYERS, type Player, type RiskZone } from '@/data/mock/players';
import { type SportId } from '@/data/mock/sports';

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

function profileToPlayer(profile: PlayerRiskProfile, sport: SportId): Player {
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
    minutesRecent: profile.baselineMeanMinutes ?? 0,
    minutesBaseline: profile.baselineMeanMinutes ?? 0,
    minutesZ: profile.minutesZScore ?? 0,
    distanceRecent: 0,
    distanceBaseline: 0,
    distanceZ: profile.distanceZScore ?? 0,
    intensityRecent: 0,
    intensityBaseline: 0,
    intensityZ: profile.intensityZScore ?? 0,
    backToBack: profile.backToBackFlag ?? false,
    daysInZone: 0,
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
      const [red, yellow, players] = await Promise.all([
        api.leagueAlerts(sport, 'red', 50, recalc),
        api.leagueAlerts(sport, 'yellow', 50, recalc),
        api.players(sport).catch(() => null),
      ]);
      const alertPlayers = [...red.alerts, ...yellow.alerts].map(a => alertToPlayer(a, sport));
      if (alertPlayers.length === 0) return null;
      const total = players?.length ?? red.totalAlerts + yellow.totalAlerts;
      return {
        players: alertPlayers,
        counts: {
          red: red.totalAlerts,
          yellow: yellow.totalAlerts,
          green: Math.max(0, total - red.totalAlerts - yellow.totalAlerts),
        },
        generatedAt: red.generatedAt,
      };
    },
    fallback,
    [sport]
  );
  return {
    players: result.data.players,
    counts: result.data.counts,
    source: result.source,
    lastUpdated: result.source === 'live' ? result.data.generatedAt : null,
    refetch: result.refetch,
  } satisfies LeaguePlayers;
}

/** League alerts list (red or yellow) for the alerts screen. */
export function useLeagueAlerts(sport: SportId, zone: 'red' | 'yellow' | 'all') {
  const fallback = useMemo(
    () => PLAYERS.filter(p => p.sport === sport && (zone === 'all' ? p.zone !== 'green' : p.zone === zone)),
    [sport, zone]
  );
  const result = useApiData<Player[]>(
    async () => {
      // "All" = red + yellow — the backend validates zone as red|yellow, so
      // fetch both and merge. Each player has exactly one latest score, so
      // there is no overlap to dedupe.
      const zones: ('red' | 'yellow')[] = zone === 'all' ? ['red', 'yellow'] : [zone];
      const responses = await Promise.all(zones.map(z => api.leagueAlerts(sport, z, 50)));
      const players = responses.flatMap(r => r.alerts.map(a => alertToPlayer(a, sport)));
      if (players.length === 0) return null;
      return players;
    },
    fallback,
    [sport, zone]
  );
  return result;
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
      const profile = await api.playerRisk(playerId);
      if (!profile.riskScore && !profile.explanation) return null;
      return profileToPlayer(profile, sport);
    },
    fallback,
    [playerId, sport]
  );
  return result;
}

// ---------------------------------------------------------------------------
// Team roster
// ---------------------------------------------------------------------------

export interface TeamRosterResult {
  players: Player[];
  source: DataSource;
  lastUpdated: string | null;
  refetch: () => void;
}

/**
 * Team view: resolve team name → backend teamId, fetch the full roster with
 * every player's zone (green included) and the backend's lastUpdated time.
 */
export function useTeamRoster(teamName: string | undefined, sport: SportId) {
  const fallback = useMemo(() => PLAYERS.filter(p => p.team === teamName), [teamName]);
  const result = useApiData<{ players: Player[]; lastUpdated: string | null }>(
    async opts => {
      if (!teamName) return null;
      const teams = await api.teams(sport);
      const team = teams.teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
      if (!team) return null;
      const roster = await api.teamRisk(team.id, opts?.recalculate ?? false);
      if (roster.players.length === 0) return null;
      return {
        players: roster.players.map(p => profileToPlayer(p, sport)),
        lastUpdated: roster.lastUpdated,
      };
    },
    { players: fallback, lastUpdated: null },
    [teamName, sport]
  );
  return {
    players: result.data.players,
    source: result.source,
    lastUpdated: result.source === 'live' ? result.data.lastUpdated : null,
    refetch: result.refetch,
  } satisfies TeamRosterResult;
}
