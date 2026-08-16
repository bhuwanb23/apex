import { SymbolView } from 'expo-symbols';
import extraLight from 'expo-symbols/androidWeights/extraLight';
import light from 'expo-symbols/androidWeights/light';
import medium from 'expo-symbols/androidWeights/medium';
import regular from 'expo-symbols/androidWeights/regular';
import semiBold from 'expo-symbols/androidWeights/semiBold';
import thin from 'expo-symbols/androidWeights/thin';
import bold from 'expo-symbols/androidWeights/bold';
import { Platform, type ColorValue } from 'react-native';

/**
 * The tab bar renders an outline glyph when a tab is inactive and a filled
 * glyph when active (Instagram-style). iOS has real SF Symbol pairs; the
 * Material Symbols font only ships outline-style glyphs for most names, so on
 * Android/web the "filled" names resolve to the same glyph but render with a
 * heavier weight for a clear active state.
 */
export type IconName =
  | 'house'
  | 'house.fill'
  | 'heart'
  | 'heart.fill'
  | 'checkmark.circle'
  | 'checkmark.circle.fill'
  | 'bolt'
  | 'bolt.fill'
  | 'heart.text.square.fill'
  | 'checkmark.seal.fill'
  | 'magnifyingglass'
  | 'bell.fill'
  | 'gearshape.fill'
  | 'chart.bar.fill'
  | 'chart.line.uptrend.xyaxis'
  | 'flame.fill'
  | 'figure.run'
  | 'clock.fill'
  | 'calendar'
  | 'chevron.right'
  | 'chevron.left'
  | 'chevron.down'
  | 'arrow.up.right'
  | 'arrow.down.right'
  | 'arrow.right'
  | 'xmark'
  | 'square.and.arrow.up'
  | 'doc.fill'
  | 'sparkles'
  | 'book.fill'
  | 'star.fill'
  | 'trophy.fill'
  | 'dumbbell.fill'
  | 'flag.checkered'
  | 'gamecontroller.fill'
  | 'person.2.fill'
  | 'newspaper.fill'
  | 'play.fill'
  | 'pause.fill'
  | 'plus'
  | 'minus'
  | 'refresh'
  | 'location.fill'
  | 'mappin.and.ellipse'
  | 'person.crop.circle.fill'
  | 'checkmark'
  | 'questionmark.circle'
  | 'exclamationmark.triangle.fill'
  | 'info.circle.fill'
  | 'timer'
  | 'wand.and.stars'
  | 'shield.checkered'
  | 'cross.case.fill'
  | 'slider.horizontal.3';

/** SF Symbol per icon key (iOS). Keys whose names are not valid SF Symbols map to a close valid one. */
const SF_NAMES: Record<IconName, string> = {
  house: 'house',
  'house.fill': 'house.fill',
  heart: 'heart',
  'heart.fill': 'heart.fill',
  'checkmark.circle': 'checkmark.circle',
  'checkmark.circle.fill': 'checkmark.circle.fill',
  bolt: 'bolt',
  'bolt.fill': 'bolt.fill',
  'heart.text.square.fill': 'heart.text.square.fill',
  'checkmark.seal.fill': 'checkmark.seal.fill',
  magnifyingglass: 'magnifyingglass',
  'bell.fill': 'bell.fill',
  'gearshape.fill': 'gearshape.fill',
  'chart.bar.fill': 'chart.bar.fill',
  'chart.line.uptrend.xyaxis': 'chart.line.uptrend.xyaxis',
  'flame.fill': 'flame.fill',
  'figure.run': 'figure.run',
  'clock.fill': 'clock.fill',
  calendar: 'calendar',
  'chevron.right': 'chevron.right',
  'chevron.left': 'chevron.left',
  'chevron.down': 'chevron.down',
  'arrow.up.right': 'arrow.up.right',
  'arrow.down.right': 'arrow.down.right',
  'arrow.right': 'arrow.right',
  xmark: 'xmark',
  'square.and.arrow.up': 'square.and.arrow.up',
  'doc.fill': 'doc.fill',
  sparkles: 'sparkles',
  'book.fill': 'book.fill',
  'star.fill': 'star.fill',
  'trophy.fill': 'trophy.fill',
  'dumbbell.fill': 'dumbbell.fill',
  'flag.checkered': 'flag.checkered',
  'gamecontroller.fill': 'gamecontroller.fill',
  'person.2.fill': 'person.2.fill',
  'newspaper.fill': 'newspaper.fill',
  'play.fill': 'play.fill',
  'pause.fill': 'pause.fill',
  plus: 'plus',
  minus: 'minus',
  refresh: 'arrow.clockwise',
  'location.fill': 'location.fill',
  'mappin.and.ellipse': 'mappin.and.ellipse',
  'person.crop.circle.fill': 'person.crop.circle.fill',
  checkmark: 'checkmark',
  'questionmark.circle': 'questionmark.circle',
  'exclamationmark.triangle.fill': 'exclamationmark.triangle.fill',
  'info.circle.fill': 'info.circle.fill',
  timer: 'timer',
  'wand.and.stars': 'wand.and.stars',
  'shield.checkered': 'shield.fill',
  'cross.case.fill': 'cross.case.fill',
  'slider.horizontal.3': 'slider.horizontal.3',
};

/** Material Symbol name per icon (android + web fallback). */
const MATERIAL_NAMES: Record<IconName, string> = {
  house: 'home',
  'house.fill': 'home',
  heart: 'favorite_border',
  'heart.fill': 'favorite',
  'checkmark.circle': 'check_circle_outline',
  'checkmark.circle.fill': 'check_circle',
  bolt: 'bolt',
  'bolt.fill': 'bolt',
  'heart.text.square.fill': 'monitor_heart',
  'checkmark.seal.fill': 'verified',
  magnifyingglass: 'search',
  'bell.fill': 'notifications',
  'gearshape.fill': 'settings',
  'chart.bar.fill': 'bar_chart',
  'chart.line.uptrend.xyaxis': 'trending_up',
  'flame.fill': 'local_fire_department',
  'figure.run': 'directions_run',
  'clock.fill': 'schedule',
  calendar: 'calendar_month',
  'chevron.right': 'chevron_right',
  'chevron.left': 'chevron_left',
  'chevron.down': 'expand_more',
  'arrow.up.right': 'north_east',
  'arrow.down.right': 'south_east',
  'arrow.right': 'arrow_forward',
  xmark: 'close',
  'square.and.arrow.up': 'ios_share',
  'doc.fill': 'description',
  sparkles: 'auto_awesome',
  'book.fill': 'menu_book',
  'star.fill': 'star',
  'trophy.fill': 'emoji_events',
  'dumbbell.fill': 'fitness_center',
  'flag.checkered': 'flag',
  'gamecontroller.fill': 'sports_esports',
  'person.2.fill': 'group',
  'newspaper.fill': 'newspaper',
  'play.fill': 'play_arrow',
  'pause.fill': 'pause',
  plus: 'add',
  minus: 'remove',
  refresh: 'refresh',
  'location.fill': 'location_on',
  'mappin.and.ellipse': 'location_searching',
  'person.crop.circle.fill': 'account_circle',
  checkmark: 'check',
  'questionmark.circle': 'help',
  'exclamationmark.triangle.fill': 'warning',
  'info.circle.fill': 'info',
  timer: 'timer',
  'wand.and.stars': 'auto_fix_high',
  'shield.checkered': 'shield',
  'cross.case.fill': 'medical_services',
  'slider.horizontal.3': 'tune',
};

export type IconWeight = 'ultraLight' | 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy' | 'black';

interface AppIconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
  weight?: IconWeight;
}

/** Material Symbol font descriptor per weight (android + web fallback). */
const ANDROID_WEIGHT: Record<IconWeight, { name: string; font: number }> = {
  ultraLight: extraLight,
  thin,
  light,
  regular,
  medium,
  semibold: semiBold,
  bold,
  heavy: bold,
  black: bold,
};

/** Cross-platform icon: SF Symbol on iOS, Material Symbol elsewhere. */
export function AppIcon({ name, size = 22, color = '#14121F', weight = 'medium' }: AppIconProps) {
  // expo-symbols applies the weight to the SF Symbol on iOS, but on Android and
  // web it only uses the object form ({ ios, android }) to pick the font file.
  // Passing the plain string would silently fall back to the 400Regular font.
  const weightProp =
    Platform.OS === 'ios'
      ? weight
      : { ios: weight, android: ANDROID_WEIGHT[weight] };
  return (
    <SymbolView
      // expo-symbols types only know a subset of SF Symbols; our names are
      // mapped to valid symbols per platform, so cast the object.
      name={
        {
          ios: SF_NAMES[name],
          android: MATERIAL_NAMES[name],
          web: MATERIAL_NAMES[name],
        } as never
      }
      size={size}
      tintColor={color}
      weight={weightProp as never}
    />
  );
}
