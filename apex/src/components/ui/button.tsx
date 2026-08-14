import { Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'light' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface PillButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const VARIANT_BG: Record<ButtonVariant, string> = {
  primary: '#5856D6',
  light: '#FFFFFF',
  outline: 'transparent',
  ghost: 'transparent',
  danger: '#E5484D',
};

const VARIANT_TEXT: Record<ButtonVariant, string> = {
  primary: '#FFFFFF',
  light: '#14121F',
  outline: '#5856D6',
  ghost: '#5856D6',
  danger: '#FFFFFF',
};

const SIZE_HEIGHT: Record<ButtonSize, number> = { sm: 38, md: 50, lg: 58 };
const SIZE_TEXT: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

/** Pill-shaped button — the primary CTA style from the reference design. */
export function PillButton({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  style,
  disabled,
  ...rest
}: PillButtonProps) {
  const isOutline = variant === 'outline';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: SIZE_HEIGHT[size],
          backgroundColor: VARIANT_BG[variant],
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        isOutline && styles.outline,
        style,
      ]}
      {...rest}>
      {icon}
      <Text style={[styles.label, { color: VARIANT_TEXT[variant], fontSize: SIZE_TEXT[size] }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  label: {
    fontWeight: '700',
  },
  outline: {
    borderWidth: 1.5,
    borderColor: '#5856D6',
  },
});
