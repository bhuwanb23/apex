import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radius, Shadows } from '@/constants/theme';

export interface CardProps extends ViewProps {
  /** Add the soft card shadow. Defaults to true. */
  shadow?: boolean;
  /** Background color; defaults to white (backgroundElement). */
  color?: string;
  /** Horizontal + vertical padding. Pass 0 to control padding from the parent. */
  padded?: boolean;
}

/** White rounded surface with the app's soft card shadow. */
export function Card({ style, shadow = true, color = '#FFFFFF', padded = true, ...rest }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: color },
        shadow && Shadows.card,
        padded && styles.padded,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
  },
  padded: {
    padding: 20,
  },
});
