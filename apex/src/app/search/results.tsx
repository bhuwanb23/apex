import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useRecentSearches } from '@/hooks/use-recent-searches';
import { PLAYERS } from '@/data/mock/players';
import { COACHES } from '@/data/mock/coaches';
import { GAMES } from '@/data/mock/games';
import { SPORTS } from '@/data/mock/sports';
import { useBackendSearch, type SearchResults } from '@/data/live/search';

type Category = 'All' | 'Players' | 'Teams' | 'Coaches' | 'Games';

/** Look up which sport a team belongs to (for team rows + games). */
function sportForTeam(team: string): string {
  const sport = SPORTS.find(s => s.teams.includes(team));
  return sport ? sport.short : '';
}

export default function SearchResultsScreen() {
  const router = useRouter();
  const { q, type } = useLocalSearchParams<{ q?: string; type?: string }>();
  const [query, setQuery] = useState(q ?? '');
  const { addRecentSearch } = useRecentSearches();

  const scope: Category = (type as Category) ?? 'All';
  const term = query.trim().toLowerCase();

  const liveSearch = useBackendSearch(term, scope);

  const results = useMemo<SearchResults>(() => {
    if (!term) return { players: [], teams: [], coaches: [], games: [] };
    if (liveSearch.source === 'live') return liveSearch.results;
    // Demo fallback: filter the curated mock data locally (presentation only).
    const players =
      scope === 'All' || scope === 'Players'
        ? PLAYERS.filter(p => p.name.toLowerCase().includes(term) || p.team.toLowerCase().includes(term))
        : [];
    const teams =
      scope === 'All' || scope === 'Teams'
        ? SPORTS.flatMap(s =>
            s.teams
              .filter(t => t.toLowerCase().includes(term))
              .map(t => ({ name: t, sport: s.short }))
          )
        : [];
    const coaches =
      scope === 'All' || scope === 'Coaches'
        ? COACHES.filter(c => c.name.toLowerCase().includes(term) || c.team.toLowerCase().includes(term))
        : [];
    const games =
      scope === 'All' || scope === 'Games'
        ? GAMES.filter(g => (g.homeTeam + g.awayTeam).toLowerCase().includes(term))
        : [];
    return { players, teams, coaches, games };
  }, [term, scope, liveSearch.source, liveSearch.results]);

  const total = results.players.length + results.teams.length + results.coaches.length + results.games.length;

  const submit = () => {
    const value = query.trim();
    if (value) {
      addRecentSearch(value);
      router.setParams({ q: value });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <AppIcon name="magnifyingglass" size={18} color="#9AA0B5" />
        <TextInput
          style={styles.input}
          placeholder="Search…"
          placeholderTextColor="#9AA0B5"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submit}
          returnKeyType="search"
          autoFocus
        />
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <AppIcon name="xmark" size={18} color="#6E7280" />
        </Pressable>
      </View>

      {total === 0 ? (
        <EmptyState
          icon="magnifyingglass"
          title={term ? `No results for "${query}"` : 'Start typing to search'}
          subtitle="Try a player name, team, coach, or game — or search with fewer letters."
          accent="#5856D6"
        />
      ) : (
        <View style={styles.results}>
          {results.players.length > 0 ? (
            <ResultGroup title={`Players (${results.players.length})`}>
              {results.players.map(player => (
                <Pressable
                  key={player.id}
                  onPress={() => router.push({ pathname: '/injury/player', params: { playerId: player.id } })}>
                  <Card style={styles.row}>
                    <View style={[styles.dot, { backgroundColor: zoneColor(player.zone) }]} />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{player.name}</Text>
                      <Text style={styles.rowMeta}>
                        {player.team} · {player.position}
                      </Text>
                    </View>
                    <AppIcon name="chevron.right" size={14} color="#9AA0B5" />
                  </Card>
                </Pressable>
              ))}
            </ResultGroup>
          ) : null}

          {results.teams.length > 0 ? (
            <ResultGroup title={`Teams (${results.teams.length})`}>
              {results.teams.map(team => (
                <Pressable
                  key={team.name}
                  onPress={() =>
                    router.push({ pathname: '/injury/team', params: { team: team.id ? String(team.id) : team.name } })
                  }>
                  <Card style={styles.row}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{team.name.slice(0, 1)}</Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{team.name}</Text>
                      <Text style={styles.rowMeta}>{team.sport} · Team risk dashboard</Text>
                    </View>
                    <AppIcon name="chevron.right" size={14} color="#9AA0B5" />
                  </Card>
                </Pressable>
              ))}
            </ResultGroup>
          ) : null}

          {results.coaches.length > 0 ? (
            <ResultGroup title={`Coaches (${results.coaches.length})`}>
              {results.coaches.map(coach => (
                <Pressable
                  key={coach.id}
                  onPress={() => router.push({ pathname: '/decisions/coach', params: { coachId: coach.id } })}>
                  <Card style={styles.row}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {coach.name.split(' ').map(w => w[0]).join('')}
                      </Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{coach.name}</Text>
                      <Text style={styles.rowMeta}>
                        {coach.team} · {coach.evRate > 0 ? `${coach.evRate}% EV rate` : 'Coach'}
                      </Text>
                    </View>
                    <AppIcon name="chevron.right" size={14} color="#9AA0B5" />
                  </Card>
                </Pressable>
              ))}
            </ResultGroup>
          ) : null}

          {results.games.length > 0 ? (
            <ResultGroup title={`Games (${results.games.length})`}>
              {results.games.map(game => (
                <Pressable
                  key={game.id}
                  onPress={() => router.push({ pathname: '/momentum/replay', params: { gameId: game.id } })}>
                  <Card style={styles.row}>
                    <View style={styles.avatar}>
                      <AppIcon name="gamecontroller.fill" size={16} color="#5856D6" />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>
                        {game.homeTeam} {game.homeScore} – {game.awayScore} {game.awayTeam}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {sportForTeam(game.homeTeam) || game.sport} · {game.date} · Momentum replay
                      </Text>
                    </View>
                    <AppIcon name="chevron.right" size={14} color="#9AA0B5" />
                  </Card>
                </Pressable>
              ))}
            </ResultGroup>
          ) : null}
        </View>
      )}
    </View>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.listGap}>{children}</View>
    </View>
  );
}

function zoneColor(zone: string): string {
  if (zone === 'red') return '#E5484D';
  if (zone === 'yellow') return '#F5A623';
  if (zone === 'green') return '#2FA36B';
  return '#9AA0B5';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F1F5',
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 50,
    marginBottom: 18,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#14121F',
  },
  results: {
    gap: 18,
    paddingBottom: 40,
  },
  group: {
    gap: 10,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6E7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listGap: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFEEFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#5856D6',
  },
  rowBody: {
    flex: 1,
    gap: 1,
  },
  rowTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#14121F',
  },
  rowMeta: {
    fontSize: 12,
    color: '#6E7280',
  },
});
