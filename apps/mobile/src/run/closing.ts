import { RULES } from '@hexrun/core';

export type TickStrength = 'single' | 'double';

/**
 * Halkayı kapat modunda haptik tıklar: her 10 m'de hafif tık; yakalama alanına son 20 m'de
 * iki kat sık (5 m'de bir) ve çift tık. Yalnız yaklaşırken üretilir; en çok 3 tık döner.
 */
export function closingTicks(prevDistM: number, nextDistM: number, closeRadiusM: number = RULES.LOOP_CLOSE_M): TickStrength[] {
  if (!(nextDistM < prevDistM)) return [];
  if (nextDistM > RULES.CLOSING_MODE_M) return [];
  const out: TickStrength[] = [];
  const finalZone = closeRadiusM + 20;
  const from = Math.min(prevDistM, RULES.CLOSING_MODE_M);
  // [next, from) aralığındaki sınırlar.
  const marks = new Set<number>();
  for (let m = Math.floor(from / 5) * 5; m > nextDistM; m -= 5) {
    if (m >= from) continue;
    if (m <= finalZone || m % 10 === 0) marks.add(m);
  }
  for (const m of [...marks].sort((a, b) => b - a)) out.push(m <= finalZone ? 'double' : 'single');
  return out.slice(-3);
}

/** HUD'da gösterilen kalan mesafe: 5 m'ye yuvarlanmış başlangıca uzaklık. */
export function closingRemainingM(distToStartM: number): number {
  return Math.max(0, Math.round(distToStartM / 5) * 5);
}
