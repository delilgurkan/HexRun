import { Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';

/** 24 pt ızgara, 2 pt çizgi, yuvarlak uç ve birleşim (Tokens · İkonlar). */
export const ICON_PATHS = {
  map: 'M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z M12 8.5l3.5 6h-7z',
  league: 'M4 20v-7h5v7 M9 20V7h6v13 M15 20v-9h5v9 M3 20h18',
  team: 'M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5 M16 5.2a3 3 0 0 1 0 5.6 M17.5 14.2c1.9.6 3.1 2.2 3.5 5.3',
  events: 'M5 5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 5z M3.5 10h17 M8 3v4 M16 3v4 M12.8 12l-2 3h3l-2 3',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0',
  streak: 'M12 21c3.6 0 6-2.4 6-5.6 0-3.6-2.8-5.4-3.6-9.4-1.9 1.3-3 3.2-3 5.2-1-.6-1.7-1.6-1.9-2.8C7.7 10.1 6 12.4 6 15.4 6 18.6 8.4 21 12 21z',
  locate: 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M12 2v3 M12 19v3 M2 12h3 M19 12h3',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  start: 'M12 4l8.5 15h-17z',
  loop: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z',
  pause: 'M8.5 5v14 M15.5 5v14',
  stop: 'M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
  siege: 'M20 12a8 8 0 1 1-2.3-5.7 M20 3.5V7.5h-4 M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  defend: 'M12 3l7 3v5.5c0 4.4-3 7.7-7 9.5-4-1.8-7-5.1-7-9.5V6z M9 12l2 2 4-4',
  heading: 'M12 3l6.5 17L12 16l-6.5 4z',
  area: 'M4 7l5-3 6 3 5-3v13l-5 3-6-3-5 3z M9 4v13 M15 7v13',
  time: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 9v4l2.5 2 M10 2h4',
  pace: 'M4 17a8 8 0 1 1 16 0 M12 17l4-5 M7 17h.01 M17 17h.01',
  shareIos: 'M12 3v12 M8 7l4-4 4 4 M6 11v9h12v-9',
  shareAndroid:
    'M18 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M6 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18 21.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M8.2 10.8l7.6-4.4 M8.2 13.2l7.6 4.4',
  backIos: 'M15 4.5L7.5 12l7.5 7.5',
  backAndroid: 'M20 12H5 M11 5l-7 7 7 7',
  close: 'M6 6l12 12 M18 6L6 18',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  // Tasarım ızgarasına uygun ek ikonlar.
  play: 'M8 5l11 7-11 7z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14 M5 12h14',
  chevron: 'M9 5l7 7-7 7',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  clap: 'M8 13l-2.5-2.5a1.5 1.5 0 0 1 2.1-2.1L11 11.8 M9.3 9.6L7.4 7.7a1.5 1.5 0 0 1 2.1-2.1l4.6 4.6 M12.6 8.7l-.9-.9a1.5 1.5 0 0 1 2.1-2.1l3.6 3.6c2.5 2.5 2.5 6.1 0 8.6s-6.1 2.5-8.6 0L5 14.6 M17 3.5l.8-1.5 M19.5 5.5l1.5-.8 M14.5 3l-.2-1.6',
  watch: 'M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M9 6l.7-3h4.6l.7 3 M9 18l.7 3h4.6l.7-3 M12 10v2.5l1.5 1',
  ghost: 'M5 12h3 M10 12h3 M15 12h4',
  swap: 'M5 9h12l-3-3 M19 15H7l3 3',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function platformIcon(name: 'back' | 'share'): IconName {
  if (name === 'back') return Platform.OS === 'ios' ? 'backIos' : 'backAndroid';
  return Platform.OS === 'ios' ? 'shareIos' : 'shareAndroid';
}

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Dolu çizim (aktif durumlar, başlangıç üçgeni). */
  fill?: string;
}

export function Icon({ name, size = 24, color, strokeWidth = 2, fill = 'none' }: IconProps) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path
        d={ICON_PATHS[name]}
        stroke={color ?? t.c.ink}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={fill}
      />
    </Svg>
  );
}
