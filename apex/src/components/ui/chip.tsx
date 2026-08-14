import { Pressable, StyleSheet, Text } from 'react-native';

import { Radius } from '@/constants/theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Compact chips for horizontal filter rows. */
  small?: boolean;
}

/** Filter chip — purple fill when selected, white with gray border otherwise. */
export function Chip({ label, selected = false, onPress, small = false }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        small ? styles.small : styles.regular,
        selected ? styles.selected : styles.unselected,
        pressed && { opacity: 0.75 },
      ]}>
      <Text style={[styles.label, small && styles.labelSmall, selected ? styles.selectedText : styles.unselectedText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regular: {
    paddingHorizontal: 18,
    height: 40,
  },
  small: {
    paddingHorizontal: 14,
    height: 32,
  },
  selected: {
    backgroundColor: '#5856D6',
  },
  unselected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5EC',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  labelSmall: {
    fontSize: 13,
  },
  selectedText: {
    color: '#FFFFFF',
  },
  unselectedText: {
    color: '#6E7280',
  },
});
