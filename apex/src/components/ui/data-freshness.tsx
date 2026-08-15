/**
 * Data freshness indicator (integration plan: "Data Freshness").
 *
 * Renders nothing for data under 1 hour old, a small gray note for 1-6h, and
 * a colored banner (yellow 6-24h / orange 24-48h / red 48h+) with an
 * optional tap-to-refresh action. Timestamps come from the backend; this
 * component only decides how to communicate them.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/ui/icon';
import { useFreshness } from '@/hooks/use-freshness';

const TONES = {
  yellow: { bg: '#FFF4DF', border: '#F5A623', text: '#8A6116' },
  orange: { bg: '#FFF1E0', border: '#FF8A5C', text: '#8A4B12' },
  red: { bg: '#FDEBEC', border: '#E5484D', text: '#8F2A2E' },
} as const;

export function DataFreshness({
  timestamp,
  onRefresh,
}: {
  /** Backend timestamp (ISO) — null/undefined renders nothing. */
  timestamp: string | null | undefined;
  /** Called when the user taps the banner (or the refresh icon). */
  onRefresh?: () => void;
}) {
  const { tier, note, banner } = useFreshness(timestamp);

  // < 1h — show normally, no indication.
  if (tier === 'fresh') return null;

  // 1-6h — small gray note.
  if (tier === 'recent') return <Text style={styles.note}>{note}</Text>;
  if (!banner) return null;

  const tone = TONES[banner.tone];
  return (
    <Pressable
      onPress={onRefresh}
      disabled={!onRefresh}
      style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <AppIcon name="clock.fill" size={14} color={tone.text} />
      <View style={styles.bannerBody}>
        <Text style={[styles.bannerTitle, { color: tone.text }]}>{banner.title}</Text>
        <Text style={[styles.bannerDetail, { color: tone.text }]}>{banner.detail}</Text>
      </View>
      {onRefresh ? <AppIcon name="refresh" size={15} color={tone.text} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  note: {
    fontSize: 11.5,
    color: '#9AA0B5',
    fontWeight: '500',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerBody: {
    flex: 1,
    gap: 1,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  bannerDetail: {
    fontSize: 11.5,
    lineHeight: 16,
    opacity: 0.85,
  },
});
