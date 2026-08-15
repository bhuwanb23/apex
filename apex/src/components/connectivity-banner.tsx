import { Pressable, StyleSheet, Text } from 'react-native';

import { AppIcon } from '@/components/ui/icon';
import { useBackend } from '@/context/backend';

/**
 * Connectivity banner — rendered at the top of the app when the backend is
 * offline or slow (integration plan: "If backend is completely unreachable →
 * show banner 'You are offline. Showing last known data'").
 */
export function ConnectivityBanner() {
  const { status, refresh, checking } = useBackend();
  if (status === 'online') return null;

  const offline = status === 'offline';
  return (
    <Pressable style={[styles.banner, offline ? styles.bannerOffline : styles.bannerSlow]} onPress={refresh} disabled={checking}>
      <AppIcon name={offline ? 'exclamationmark.triangle.fill' : 'clock.fill'} size={14} color={offline ? '#FFFFFF' : '#8A6116'} />
      <Text style={[styles.text, offline ? styles.textOffline : styles.textSlow]}>
        {offline
          ? checking
            ? 'Checking connection…'
            : 'You are offline. Showing last known data'
          : 'Loading latest data…'}
      </Text>
      <Text style={[styles.retry, offline ? styles.textOffline : styles.textSlow]}>{checking ? '…' : 'Retry'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerOffline: {
    backgroundColor: '#E5484D',
  },
  bannerSlow: {
    backgroundColor: '#FFF4DF',
  },
  text: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  textOffline: {
    color: '#FFFFFF',
  },
  textSlow: {
    color: '#8A6116',
  },
  retry: {
    fontSize: 12,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
