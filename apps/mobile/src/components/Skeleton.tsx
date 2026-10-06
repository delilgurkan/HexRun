import { useEffect, useRef } from 'react';
import { Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { MOTION, RADII, useTheme } from '../theme';

/** Yer tutucu blok; "Hareketi azalt" açıkken sabit. */
export function Skeleton({ width = '100%', height = 16, radius = RADII.xs, style }: { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const a = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (t.reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: MOTION.breathe / 2, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.5, duration: MOTION.breathe / 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a, t.reduceMotion]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: t.c.surf2, opacity: a }, style]} />;
}

/** Petek dokusu (yükleme iskeleti ve boş durumlar). */
export function HexTexture({ color, opacity = 1, style }: { color?: string; opacity?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const R = 12;
  const dx = 20.785;
  const dy = 18;
  const a = (R * Math.sqrt(3)) / 2;
  const b = R / 2;
  const hex = (x: number, y: number) => `M${x} ${y - R}l${a} ${b}v${R}l${-a} ${b}l${-a} ${-b}v${-R}z`;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="hexTex" patternUnits="userSpaceOnUse" width={dx} height={dy * 2}>
            <Path d={`${hex(dx / 2, R)}${hex(0, R + dy)}${hex(dx, R + dy)}`} stroke={color ?? t.c.tex} strokeWidth={1} fill="none" />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#hexTex)" />
      </Svg>
    </View>
  );
}
