import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { AppIcon } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/button';

interface ErrorStateProps {
  /** Specific message, e.g. \"Could not load player data\". */
  message?: string;
  /** Shown under the icon when message is absent. */
  title?: string;
  /** Re-runs the failed request. */
  onRetry: () => void;
  /** Compact horizontal layout for in-list sections (e.g. Home). */
  compact?: boolean;
}

/** Friendly error card with a retry action — shown when a request fails. */
export function ErrorState({
  message,
  title = 'Something went wrong',
  onRetry,
  compact = false,
}: ErrorStateProps) {
  const accent = '#E5484D';
  return (
    <Card style={[styles.card, compact && styles.compact]}>
      <View style={[styles.iconWrap, compact && styles.iconWrapCompact, { backgroundColor: `${accent}14` }]}>
        <AppIcon name="exclamationmark.triangle.fill" size={compact ? 20 : 30} color={accent} />
      </View>
      <View style={[styles.body, compact && styles.bodyCompact]}>
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
      <PillButton
        label="Try again"
        variant="outline"
        size={compact ? 'sm' : 'md'}
        onPress={onRetry}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapCompact: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  bodyCompact: {
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#14121F',
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 14,
    textAlign: 'left',
  },
  message: {
    fontSize: 13,
    color: '#6E7280',
    textAlign: 'center',
    lineHeight: 19,
  },
});
