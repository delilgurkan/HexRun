import Svg, { Circle, G, Path } from 'react-native-svg';
import { PALETTE } from '@hexrun/core';
import { useTheme } from '../theme';

const LOOP = [
  [96, 250],
  [84, 190],
  [104, 132],
  [170, 104],
  [246, 120],
  [276, 190],
  [254, 262],
  [186, 300],
  [128, 286],
];

const line = (pts: number[][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');

function hex(x: number, y: number, R: number) {
  const a = (R * Math.sqrt(3)) / 2;
  const b = R / 2;
  return `M${x} ${y - R}l${a} ${b}v${R}l${-a} ${b}l${-a} ${-b}v${-R}z`;
}

function inPoly(x: number, y: number, p: number[][]) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i] as [number, number];
    const [xj, yj] = p[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Onboarding çizimleri: her ekran bir öncekinin devamı (iz → halka → fetih). */
export function OnboardingArt({ step }: { step: 0 | 1 | 2 }) {
  const t = useTheme();
  const own = t.isDark ? PALETTE.keh.darkEdge : PALETTE.keh.hex;
  const R = 11;
  const dx = R * Math.sqrt(3);
  const dy = R * 1.5;
  const cells: string[] = [];
  const grid: string[] = [];
  for (let r = 0; r < 24; r++) {
    for (let q = 0; q < 14; q++) {
      const x = q * dx + (r % 2 ? dx / 2 : 0);
      const y = r * dy;
      grid.push(hex(x, y, R));
      if (step === 2 && inPoly(x, y, [...LOOP, [96, 250]])) cells.push(hex(x, y, R));
    }
  }
  const trace = step === 0 ? line(LOOP.slice(0, 6)) : `${line(LOOP)}L96 250`;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 360 360" accessibilityElementsHidden>
      <Path d={grid.join('')} stroke={t.c.tex} strokeWidth={1} fill="none" />
      {step === 2 ? (
        <G>
          <Path d={cells.join('')} fill={own} opacity={t.isDark ? 0.5 : 0.55} />
          <Path d={cells.join('')} stroke={t.c.casing} strokeWidth={1} fill="none" opacity={0.6} />
        </G>
      ) : null}
      {step === 1 ? <Path d={`${line(LOOP)}Z`} fill={t.c.ink} opacity={0.08} /> : null}
      <Path d={trace} stroke={t.c.ink} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={trace} stroke={t.c.trace} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {step >= 1 ? (
        <G>
          <Circle cx={96} cy={250} r={26} stroke={t.c.ink} strokeWidth={1.5} fill="none" />
          <Circle cx={96} cy={250} r={20} stroke={t.c.ink} strokeWidth={1.5} fill="none" />
        </G>
      ) : null}
      <Path d="M96 238l11 19h-22z" fill={t.c.ink} />
    </Svg>
  );
}
