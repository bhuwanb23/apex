/**
 * Apex design system — inspired by the Dribbble reference: light gray canvas,
 * white rounded cards with soft shadows, purple (#5856D6) primary, and
 * pink/purple/orange gradient accents.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // Base surfaces
    text: '#14121F', // near-black body text
    background: '#F0F1F5', // light gray canvas
    backgroundElement: '#FFFFFF', // white cards
    backgroundSelected: '#EDECFB', // soft purple — selected/hover fills
    textSecondary: '#6E7280', // muted gray text
    border: '#E4E5EC', // hairline borders on white surfaces

    // Brand
    primary: '#5856D6', // Apex purple
    primaryDark: '#4643C4',
    primarySoft: '#EFEEFB', // pale purple fill
    onPrimary: '#FFFFFF',

    // Gradient stops (logo orb, banners)
    gradientPink: '#FF5C8A',
    gradientPurple: '#5856D6',
    gradientOrange: '#FFA058',

    // Semantic
    danger: '#E5484D', // red zone / bad decisions
    dangerSoft: '#FDEBEC',
    warning: '#F5A623', // yellow zone
    warningSoft: '#FFF4DF',
    success: '#2FA36B', // green zone / good decisions
    successSoft: '#E3F6EC',
    info: '#3C87F7',
    infoSoft: '#E7F1FE',

    // Cards / overlays
    cardShadow: '#9AA0B5',
    overlay: 'rgba(20, 18, 31, 0.35)',
    tabBar: '#FFFFFF',
    inputFill: '#F4F4F8',
    gold: '#D9A21B', // best-option highlight
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 48,
  seven: 64,
} as const;

/** Corner radii — cards 20, inputs 14, pills full. */
export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

/** Soft card shadow used across the app. */
export const Shadows = {
  card: {
    shadowColor: '#9AA0B5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  floating: {
    shadowColor: '#5856D6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;

/** Risk zone → semantic color/soft fill pair. */
export const ZoneColors: Record<string, { color: string; soft: string; label: string }> = {
  red: { color: '#E5484D', soft: '#FDEBEC', label: 'HIGH RISK' },
  yellow: { color: '#F5A623', soft: '#FFF4DF', label: 'ELEVATED' },
  green: { color: '#2FA36B', soft: '#E3F6EC', label: 'NORMAL' },
  insufficient_data: { color: '#9AA0B5', soft: '#EFEFF4', label: 'NO DATA' },
};

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 640;
