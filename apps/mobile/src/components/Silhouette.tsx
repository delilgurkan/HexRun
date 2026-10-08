import { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';

type Ring = ReadonlyArray<{ lat: number; lng: number }>;

/** Yerel düzleme izdüşüm: bölge silüetleri (harita yok, yalnız biçim). */
export function silhouettePath(rings: readonly Ring[], w: number, h: number, pad = 8): string {
  const pts = rings.flat();
  if (!pts.length) return '';
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p.lng * k);
  const ys = pts.map((p) => -p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sw = maxX - minX || 1e-9;
  const sh = maxY - minY || 1e-9;
  const s = Math.min((w - pad * 2) / sw, (h - pad * 2) / sh);
  const ox = (w - sw * s) / 2;
  const oy = (h - sh * s) / 2;
  return rings
    .filter((r) => r.length >= 3)
    .map(
      (r) =>
        r
          .map((p, i) => `${i ? 'L' : 'M'}${(ox + (p.lng * k - minX) * s).toFixed(1)} ${(oy + (-p.lat - minY) * s).toFixed(1)}`)
          .join('') + 'Z',
    )
    .join('');
}

export function Silhouette({ rings, width, height, color, stroke }: { rings: readonly Ring[]; width: number; height: number; color: string; stroke?: string }) {
  const d = useMemo(() => silhouettePath(rings, width, height), [rings, width, height]);
  return (
    <Svg width={width} height={height} accessibilityElementsHidden>
      {d ? <Path d={d} fill={color} stroke={stroke ?? 'none'} strokeWidth={1.5} strokeLinejoin="round" fillRule="evenodd" /> : null}
    </Svg>
  );
}
