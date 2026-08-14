import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { PLAYERS } from '@/data/mock/players';
import { COACHES } from '@/data/mock/coaches';

const CATEGORIES = ['All', 'Players', 'Teams', 'Coaches', 'Games'] as const;

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [recent, setRecent] = useState<string[]>(['LeBron James', 'Chiefs', '4th down']);

  const popular = PLAYERS.slice(0, 3);

  const submit = () => {
    const q = query.trim();
    if (!q) return;
    setRecent(prev => [q, ...prev.filter(r => r !== q)].slice(0, 5));
    router.push({ pathname: '/search/results', params: { q, type: category } });
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <AppIcon name="magnifyingglass" size={18} color="#9AA0B5" />
        <TextInput
          style={styles.input}
          placeholder="Search players, teams, coaches…"
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

      <View style={styles.categoryRow}>
        {CATEGORIES.map(cat => (
          <Chip key={cat} label={cat} small selected={category === cat} onPress={() => setCategory(cat)} />
        ))}
      </View>

      {recent.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>Recent searches</Text>
          <View style={styles.listGap}>
            {recent.map(item => (
              <Pressable
                key={item}
                onPress={() => {
                  setQuery(item);
                  router.push({ pathname: '/search/results', params: { q: item, type: category } });
                }}>
                <Card style={styles.recentRow}>
                  <View style={styles.recentIcon}>
                    <AppIcon name="clock.fill" size={15} color="#9AA0B5" />
                  </View>
                  <Text style={styles.recentText}>{item}</Text>
                  <AppIcon name="arrow.up.right" size={14} color="#9AA0B5" />
                </Card>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View>
        <Text style={styles.sectionTitle}>Popular right now</Text>
        <View style={styles.listGap}>
          {popular.map(player => (
            <Pressable
              key={player.id}
              onPress={() => {
                setQuery(player.name);
                router.push({ pathname: '/search/results', params: { q: player.name, type: 'Players' } });
              }}>
              <Card style={styles.popularRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{player.lastName.slice(0, 1)}</Text>
                </View>
                <View style={styles.popularBody}>
                  <Text style={styles.popularName}>{player.name}</Text>
                  <Text style={styles.popularMeta}>
                    {player.team} · {player.position}
                  </Text>
                </View>
                <Text style={[styles.popularScore, { color: player.zone === 'red' ? '#E5484D' : player.zone === 'yellow' ? '#B7791F' : '#1F8A52' }]}>
                  {player.riskScore}
                </Text>
              </Card>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.suggestionRow}>
        <Text style={styles.suggestionText}>Try: </Text>
        {COACHES.slice(0, 3).map(c => (
          <Pressable key={c.id} onPress={() => setQuery(c.name)}>
            <Text style={styles.suggestionLink}>{c.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F1F5',
    paddingHorizontal: 20,
    paddingTop: 60,
    gap: 18,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 50,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#14121F',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
    marginBottom: 10,
  },
  listGap: {
    gap: 10,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  recentIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#F0F1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#14121F',
  },
  popularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
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
    fontSize: 15,
    fontWeight: '800',
    color: '#5856D6',
  },
  popularBody: {
    flex: 1,
    gap: 1,
  },
  popularName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#14121F',
  },
  popularMeta: {
    fontSize: 12,
    color: '#6E7280',
  },
  popularScore: {
    fontSize: 16,
    fontWeight: '800',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionText: {
    fontSize: 13,
    color: '#6E7280',
  },
  suggestionLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5856D6',
  },
});
