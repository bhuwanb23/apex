import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppIcon } from '@/components/ui/icon';

interface StackHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  /** Hide the back button (used in modals that close instead). */
  transparent?: boolean;
}

/** Title bar for pushed stack screens: back chevron + centered title. */
export function StackHeader({ title, subtitle, right, onBack, transparent = false }: StackHeaderProps) {
  const router = useRouter();

  if (transparent) {
    return (
      <View style={[styles.row, styles.transparentRow]}>
        {right ?? <View style={styles.side} />}
      </View>
    );
  }

  return (
    <View style={[styles.row, styles.paddedRow]}>
      <Pressable onPress={onBack ?? (() => router.back())} hitSlop={12} style={styles.backButton}>
        <AppIcon name="chevron.left" size={20} color="#14121F" />
      </Pressable>
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.side}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paddedRow: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  transparentRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: 'flex-end',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#14121F',
  },
  subtitle: {
    fontSize: 12,
    color: '#6E7280',
    fontWeight: '500',
  },
  side: {
    width: 38,
    alignItems: 'flex-end',
  },
});
