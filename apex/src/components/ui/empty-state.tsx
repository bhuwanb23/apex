import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { AppIcon, type IconName } from '@/components/ui/icon';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  accent?: string;
}

/** Friendly empty state used across lists (alerts, search results). */
export function EmptyState({ icon, title, subtitle, accent = '#2FA36B' }: EmptyStateProps) {
  return (
    <Card style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: `${accent}18` }]}>
        <AppIcon name={icon} size={28} color={accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#14121F',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#6E7280',
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 19,
  },
});
