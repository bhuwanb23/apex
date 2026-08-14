import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon, type IconName } from '@/components/ui/icon';

interface RoleCardProps {
  icon: IconName;
  title: string;
  description: string;
  highlight: string;
  selected: boolean;
  onPress: () => void;
}

/** Selectable role card — vertical list style with highlight chip. */
export function RoleCard({ icon, title, description, highlight, selected, onPress }: RoleCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && { opacity: 0.85 },
      ]}>
      <View style={[styles.iconWrap, { backgroundColor: selected ? '#5856D6' : '#EFEEFB' }]}>
        <AppIcon name={icon} size={22} color={selected ? '#FFFFFF' : '#5856D6'} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.highlightWrap}>
          <Text style={styles.highlight}>{highlight}</Text>
        </View>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#9AA0B5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  cardSelected: {
    borderColor: '#5856D6',
    backgroundColor: '#FBFAFF',
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14121F',
  },
  description: {
    fontSize: 12.5,
    color: '#6E7280',
    lineHeight: 18,
  },
  highlightWrap: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F1F5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  highlight: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5856D6',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D5D7E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#5856D6',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#5856D6',
  },
});
