import { haversineM, type TrackPoint } from './geo.js';

/**
 * Hız ya da GPS tutarsızsa halka "inceleniyor" durumuna geçer; cezalandırılmaz, bekletilir.
 * Kurallar bilerek tutucu: yanlış pozitif bir koşucuyu kızdırır, yanlış negatif bir düelloyu bozar.
 */
export type ReviewReason =
  | 'pace_too_fast'
  | 'teleport'
  | 'sparse_gps'
  | 'non_monotonic_time'
  | 'too_few_points';

export interface ReviewFinding {
  reason: ReviewReason;
  /** İnsan okunur kısa açıklama. */
  detail: string;
  /** Şüpheli bölümün uzunluğu (m), varsa. */
  segmentM?: number;
  /** Şüpheli bölümün temposu (sn/km), varsa. */
  paceSecPerKm?: number;
}

export interface ReviewResult {
  status: 'ok' | 'review';
  findings: ReviewFinding[];
}

export const ANTICHEAT = {
  /** 2'30"/km'den hızlı sürdürülen tempo insan koşusu sayılmaz (elit 5K ≈ 2'35"). */
  MIN_PACE_SEC_PER_KM: 150,
  /** Tempo kontrolü için kayan pencere (m). */
  PACE_WINDOW_M: 400,
  /** Tek adımda bu hızın üstü ışınlanmadır (m/s). */
  TELEPORT_MPS: 15,
  TELEPORT_MIN_M: 80,
  /** Bu süreden uzun boşlukta bu mesafeden fazla yol: GPS kopuk. */
  GAP_S: 90,
  GAP_M: 400,
  MIN_POINTS: 10,
} as const;

export function reviewTrack(points: readonly TrackPoint[]): ReviewResult {
  const findings: ReviewFinding[] = [];
  if (points.length < ANTICHEAT.MIN_POINTS) {
    findings.push({ reason: 'too_few_points', detail: `${points.length} nokta` });
    return { status: 'review', findings };
  }
  let worstPace: { pace: number; len: number } | null = null;
  let teleports = 0;
  let gaps = 0;
  // Kayan pencere: [j, i]
  let j = 0;
  let winLen = 0;
  const segLens: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) {
      findings.push({ reason: 'non_monotonic_time', detail: `nokta ${i}` });
      return { status: 'review', findings };
    }
    const d = haversineM(a, b);
    segLens.push(d);
    if (d >= ANTICHEAT.TELEPORT_MIN_M && d / dt > ANTICHEAT.TELEPORT_MPS) teleports++;
    if (dt > ANTICHEAT.GAP_S && d > ANTICHEAT.GAP_M) gaps++;
    winLen += d;
    while (j < i && winLen - segLens[j + 1]! >= ANTICHEAT.PACE_WINDOW_M) {
      j++;
      winLen -= segLens[j]!;
    }
    if (winLen >= ANTICHEAT.PACE_WINDOW_M) {
      const secs = (b.t - points[j]!.t) / 1000;
      const pace = secs / (winLen / 1000);
      if (pace < ANTICHEAT.MIN_PACE_SEC_PER_KM && (!worstPace || pace < worstPace.pace)) {
        worstPace = { pace, len: winLen };
      }
    }
  }
  if (worstPace) {
    // Şüpheli bölümün toplam uzunluğunu bul (ardışık hızlı pencereler).
    findings.push({
      reason: 'pace_too_fast',
      detail: 'Tempo koşu temposunun çok üstünde',
      paceSecPerKm: Math.round(worstPace.pace),
      segmentM: Math.round(fastStretchM(points)),
    });
  }
  if (teleports > 0) findings.push({ reason: 'teleport', detail: `${teleports} GPS sıçraması` });
  if (gaps > 0) findings.push({ reason: 'sparse_gps', detail: `${gaps} uzun GPS boşluğu` });
  return { status: findings.length ? 'review' : 'ok', findings };
}

/** Ardışık "çok hızlı" adımların en uzun toplam uzunluğu. */
function fastStretchM(points: readonly TrackPoint[]): number {
  let best = 0;
  let cur = 0;
  const limit = 1000 / ANTICHEAT.MIN_PACE_SEC_PER_KM; // m/s
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = haversineM(a, b);
    const v = d / ((b.t - a.t) / 1000);
    if (v > limit) {
      cur += d;
      if (cur > best) best = cur;
    } else cur = 0;
  }
  return best;
}
