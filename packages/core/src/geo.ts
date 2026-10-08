/** Basit küresel geometri yardımcıları (WGS84 küre yaklaşımı yeterli: metre altı hata). */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TrackPoint extends LatLng {
  /** Epoch ms. */
  t: number;
  /** Yatay doğruluk (m), bilinmiyorsa undefined. */
  acc?: number;
}

const R = 6_371_008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function pathLengthM(points: readonly LatLng[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineM(points[i - 1]!, points[i]!);
  return d;
}

/** Bir noktayı verilen yön (derece, kuzeyden saat yönünde) ve mesafe ile taşır. */
export function destination(p: LatLng, bearingDeg: number, distM: number): LatLng {
  const δ = distM / R;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(p.lat);
  const λ1 = toRad(p.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: (φ2 * 180) / Math.PI, lng: ((((λ2 * 180) / Math.PI + 540) % 360) - 180) };
}

/** Küçük poligonlar için yerel düzlem yaklaşımıyla alan (m²). */
export function polygonAreaM2(ring: readonly LatLng[]): number {
  if (ring.length < 3) return 0;
  const lat0 = toRad(ring[0]!.lat);
  const kx = Math.cos(lat0) * R;
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = toRad(ring[i]!.lng) * kx;
    const yi = toRad(ring[i]!.lat) * R;
    const xj = toRad(ring[j]!.lng) * kx;
    const yj = toRad(ring[j]!.lat) * R;
    s += xj * yi - xi * yj;
  }
  return Math.abs(s / 2);
}

/** Dairesel bir halka üretir (testler ve öneri rotaları için). */
export function circleTrack(center: LatLng, radiusM: number, n: number, t0: number, speedMps: number): TrackPoint[] {
  const pts: TrackPoint[] = [];
  const step = (2 * Math.PI * radiusM) / n;
  // Başlangıç: merkezin güneyindeki nokta; saat yönünde tam tur + başlangıca dönüş.
  for (let i = 0; i <= n; i++) {
    const p = destination(center, 180 + (360 * i) / n, radiusM);
    pts.push({ ...p, t: t0 + Math.round(((i * step) / speedMps) * 1000), acc: 5 });
  }
  return pts;
}
