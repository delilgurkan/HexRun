/**
 * Hat göstergesi: 10 segment = 10'ar puan. Sahibin gücü düz dolgu, en önde giden saldırganın
 * ilerlemesi taralı, son 7 günde eriyen güç soluk "hayalet". Her segment için 0–100 doluluk yüzdesi.
 */
export interface HatSegment {
  owner: number;
  siege: number;
  ghost: number;
}

const fill = (x: number, i: number) => Math.max(0, Math.min(10, x - i * 10)) * 10;

export function hatSegments(power: number, progress = 0, ghostTo = 0): HatSegment[] {
  const p = Math.max(0, Math.min(100, power || 0));
  const s = Math.max(0, Math.min(100, progress || 0));
  const g = Math.max(0, Math.min(100, ghostTo || 0));
  return Array.from({ length: 10 }, (_, i) => ({ owner: fill(p, i), siege: fill(s, i), ghost: fill(g, i) }));
}
