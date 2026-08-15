import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue } from 'react-native';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: object;
}

/** Pulsing gray placeholder block — the building block for loading skeletons. */
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  // Lazy useState keeps one stable Animated.Value across renders (the refs-
  // during-render lint rule rejects useRef(...).current in the render body).
  const [opacity] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: '#E4E5EC', opacity }, style]}
    />
  );
}

/** Avatar + two text lines, like a player row. */
export function SkeletonRow({ lines = 2 }: { lines?: number }) {
  return (
    <View style={styles.row}>
      <Skeleton width={42} height={42} radius={21} />
      <View style={styles.rowBody}>
        <Skeleton width="60%" height={14} />
        {lines > 1 ? <Skeleton width="40%" height={11} radius={6} /> : null}
      </View>
    </View>
  );
}

/** Card-shaped skeleton (title line + body lines). */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={styles.card}>
      <Skeleton width="50%" height={15} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} height={11} radius={6} />
      ))}
    </View>
  );
}

/** Horizontal scroll of game-card skeletons. */
export function SkeletonGames() {
  return (
    <View style={styles.gamesRow}>
      {[0, 1, 2].map(i => (
        <View key={i} style={styles.gameCard}>
          <Skeleton width="60%" height={11} radius={6} />
          <Skeleton width="80%" height={15} />
          <Skeleton width="80%" height={15} />
          <Skeleton width="50%" height={11} radius={6} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
  },
  rowBody: {
    flex: 1,
    gap: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  gamesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  gameCard: {
    width: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
});
