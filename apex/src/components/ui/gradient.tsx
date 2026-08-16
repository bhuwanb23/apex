import { StyleSheet, type ColorValue, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface GradientViewProps extends ViewProps {
  /** Two or more gradient stops (CSS color strings). */
  colors: readonly [ColorValue, ColorValue, ...ColorValue[]];
  /** Direction of the linear gradient. Defaults to a diagonal top-left → bottom-right. */
  direction?: 'diagonal' | 'vertical' | 'horizontal';
}

const DIRECTION: Record<NonNullable<GradientViewProps['direction']>, { start: { x: number; y: number }; end: { x: number; y: number } }> = {
  diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  vertical: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  horizontal: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
};

/**
 * Linear gradient surface backed by expo-linear-gradient — renders on iOS,
 * Android and web (the old `experimental_backgroundImage` approach was
 * silently ignored by react-native-web, leaving gradients transparent).
 */
export function GradientView({ colors, direction = 'diagonal', style, ...rest }: GradientViewProps) {
  const { start, end } = DIRECTION[direction];
  return <LinearGradient colors={colors} start={start} end={end} style={[styles.base, style]} {...(rest as ViewProps)} />;
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
