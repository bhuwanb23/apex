import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';

export type IconName =
  | 'house.fill'
  | 'heart.text.square.fill'
  | 'checkmark.seal.fill'
  | 'bolt.fill'
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
  | 'exclamationmark.triangle.fill'
  | 'info.circle.fill'
  | 'timer'
  | 'wand.and.stars'
  | 'shield.checkered'
  | 'cross.case.fill'
  | 'slider.horizontal.3';

/** SF Symbol per icon key (iOS). Keys whose names are not valid SF Symbols map to a close valid one. */
const SF_NAMES: Record<IconName, string> = {
  'house.fill': 'house.fill',
  'heart.text.square.fill': 'heart.text.square.fill',
  'checkmark.seal.fill': 'checkmark.seal.fill',
  'bolt.fill': 'bolt.fill',
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
  'house.fill': 'home',
  'heart.text.square.fill': 'monitor_heart',
  'checkmark.seal.fill': 'verified',
  'bolt.fill': 'bolt',
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
  'exclamationmark.triangle.fill': 'warning',
  'info.circle.fill': 'info',
  timer: 'timer',
  'wand.and.stars': 'auto_fix_high',
  'shield.checkered': 'shield',
  'cross.case.fill': 'medical_services',
  'slider.horizontal.3': 'tune',
};

interface AppIconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
  weight?: 'ultraLight' | 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy' | 'black';
}

/** Cross-platform icon: SF Symbol on iOS, Material Symbol elsewhere. */
export function AppIcon({ name, size = 22, color = '#14121F', weight = 'medium' }: AppIconProps) {
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
      weight={weight}
    />
  );
}
