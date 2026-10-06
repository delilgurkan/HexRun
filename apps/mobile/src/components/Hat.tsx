import { useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, G, Line, Pattern, Rect } from 'react-native-svg';
import { useTheme } from '../theme';
import { T } from './Text';
import { HAT_HEIGHT, HAT_SEGMENTS, hatA11y, hatLabel, hatSegments, type HatInput, type HatSize } from './hatMath';

export interface HatProps extends HatInput {
  /** Sahibin rengi (düz dolgu). */
  ownerColor: string;
  /** Saldırganın rengi (tarama). */
  attackerColor?: string;
  size?: HatSize;
  showLabel?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

let uid = 0;

/** "Hat" göstergesi: 10 segment; 4 pt harita etiketi, 8 pt sheet/liste, 16 pt kuşatma ekranı. */
export function Hat({ power, progress, ghost, ownerColor, attackerColor, size = 'md', showLabel = true, style, testID }: HatProps) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const [pid] = useState(() => `hat${++uid}`);
  const h = HAT_HEIGHT[size];
  const gap = size === 'sm' ? 1.5 : size === 'md' ? 2 : 3;
  const segs = hatSegments({ power, progress, ghost });
  const segW = w > 0 ? (w - gap * (HAT_SEGMENTS - 1)) / HAT_SEGMENTS : 0;
  const hatch = attackerColor ?? t.c.ink;
  const onLayout = (e: LayoutChangeEvent) => setW(Math.floor(e.nativeEvent.layout.width));
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={hatA11y({ power, progress, ghost })}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(power) }}
      testID={testID}
    >
      <View style={{ flex: 1, height: h }} onLayout={onLayout}>
        {w > 0 && (
          <Svg width={w} height={h}>
            <Defs>
              <Pattern id={pid} patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
                <Line x1={0} y1={0} x2={0} y2={5} stroke={hatch} strokeWidth={2.5} />
              </Pattern>
            </Defs>
            {segs.map((s, i) => {
              const x = i * (segW + gap);
              return (
                <G key={i}>
                  <Rect x={x} y={0} width={segW} height={h} rx={1} fill={t.c.track} />
                  {s.ghost > 0 && <Rect x={x} y={0} width={segW * s.ghost} height={h} rx={1} fill={ownerColor} opacity={0.32} />}
                  {s.owner > 0 && <Rect x={x} y={0} width={segW * s.owner} height={h} rx={1} fill={ownerColor} />}
                  {s.attack > 0 && <Rect x={x} y={0} width={segW * s.attack} height={h} rx={1} fill={`url(#${pid})`} />}
                </G>
              );
            })}
          </Svg>
        )}
      </View>
      {showLabel && (
        <T v="data" tabular style={size === 'lg' ? { fontSize: 15 } : undefined}>
          {hatLabel({ power, progress, ghost })}
        </T>
      )}
    </View>
  );
}
