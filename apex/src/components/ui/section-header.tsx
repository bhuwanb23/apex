import { StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { AppIcon, type IconName } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/button';

interface SectionHeaderProps {
  title: string;
  emoji?: string;
  /** Right-side action. Pass a label to render a link-style button. */
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: IconName;
}

/** Section title row with optional "See all" action. */
export function SectionHeader({ title, emoji, actionLabel, onAction, actionIcon = 'chevron.right' }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <ThemedText type="smallBold" style={styles.title}>
        {emoji ? `${emoji} ` : ''}
        {title}
      </ThemedText>
      {actionLabel && onAction ? (
        <PillButton
          label={actionLabel}
          variant="ghost"
          size="sm"
          onPress={onAction}
          icon={<AppIcon name={actionIcon} size={13} color="#5856D6" />}
        />
      ) : null}
    </View>
  );
}

export function HeaderRow({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.heading}>{title}</Text>
      {actionLabel && onAction ? (
        <Text style={styles.link} onPress={onAction}>
          {actionLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#14121F',
  },
  link: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5856D6',
  },
});
