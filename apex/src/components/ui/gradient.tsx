import { StyleSheet, View, type ViewProps } from 'react-native';

export interface GradientViewProps extends ViewProps {
  colors: [string, string];
  /** Direction of the linear gradient. Defaults to a diagonal top-left → bottom-right. */
  direction?: 'diagonal' | 'vertical' | 'horizontal';
}

const DIRECTION_ANGLE: Record<NonNullable<GradientViewProps['direction']>, string> = {
  diagonal: '135deg',
  vertical: '180deg',
  horizontal: '90deg',
};

/**
 * Linear gradient surface backed by RN's `experimental_backgroundImage`
 * (already used in this codebase — no extra dependency needed).
 */
export function GradientView({ colors, direction = 'diagonal', style, ...rest }: GradientViewProps) {
  return (
    <View
      style={[
        styles.base,
        {
          // @ts-expect-error -- experimental_backgroundImage is typed on ViewStyle in newer RN
          experimental_backgroundImage: `linear-gradient(${DIRECTION_ANGLE[direction]}, ${colors[0]}, ${colors[1]})`,
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
