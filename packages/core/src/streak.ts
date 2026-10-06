import { addDays, daysBetween } from './time.js';

/**
 * Seri: art arda koşulan günler. Kolaylık nişanları ayda N kaçırılan günü affeder
 * (en iyisi geçerli, toplanmaz). Affedilen gün seriyi uzatmaz ama bozmaz.
 */
export function computeStreak(runDays: Iterable<string>, today: string, freezesPerMonth: number): { current: number; best: number; frozenDays: string[] } {
  const days = [...new Set(runDays)].filter((d) => d <= today).sort();
  if (!days.length) return { current: 0, best: 0, frozenDays: [] };
  const usedPerMonth = new Map<string, number>();
  const frozen: string[] = [];
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const d of days) {
    if (prev === null) cur = 1;
    else {
      const gap = daysBetween(prev, d) - 1;
      if (gap === 0) cur += 1;
      else {
        // Boşluktaki her gün için o ayın dondurma hakkı yetiyor mu?
        const missing: string[] = [];
        for (let i = 1; i <= gap; i++) missing.push(addDays(prev, i));
        const need = new Map<string, number>();
        for (const m of missing) need.set(m.slice(0, 7), (need.get(m.slice(0, 7)) ?? 0) + 1);
        const fits = [...need].every(([mo, n]) => (usedPerMonth.get(mo) ?? 0) + n <= freezesPerMonth);
        if (fits) {
          for (const [mo, n] of need) usedPerMonth.set(mo, (usedPerMonth.get(mo) ?? 0) + n);
          frozen.push(...missing);
          cur += 1;
        } else cur = 1;
      }
    }
    best = Math.max(best, cur);
    prev = d;
  }
  // Bugün ya da dün koşulmadıysa (ve affedilemiyorsa) mevcut seri 0.
  const last = days[days.length - 1]!;
  const sinceLast = daysBetween(last, today);
  let current = cur;
  if (sinceLast >= 2) {
    const missing: string[] = [];
    for (let i = 1; i < sinceLast; i++) missing.push(addDays(last, i));
    const need = new Map<string, number>();
    for (const m of missing) need.set(m.slice(0, 7), (need.get(m.slice(0, 7)) ?? 0) + 1);
    const fits = [...need].every(([mo, n]) => (usedPerMonth.get(mo) ?? 0) + n <= freezesPerMonth);
    if (!fits) current = 0;
  }
  return { current, best, frozenDays: frozen };
}
