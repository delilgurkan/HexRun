import { RULES } from '@hexrun/core';

/**
 * Hat: güç ve kuşatma için tek gösterge. 10 segment = 10'ar puan.
 * - sahip: düz dolgu (sahibin gücü)
 * - saldırı: taralı (en önde giden saldırganın ilerlemesi), dolgunun üstüne biner
 * - hayalet: son 7 günde eriyen güç, soluk
 */
export interface HatInput {
  power: number;
  progress?: number | null;
  /** Son 7 günde eriyen güç (puan). */
  ghost?: number | null;
}

export interface HatSegment {
  /** 0..1 */
  owner: number;
  attack: number;
  ghost: number;
}

export const HAT_SEGMENTS = 10;
export const HAT_HEIGHT = { sm: 4, md: 8, lg: 16 } as const;
export type HatSize = keyof typeof HAT_HEIGHT;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function fill(value: number, i: number): number {
  return clamp(value - i * 10, 0, 10) / 10;
}

export function hatSegments({ power, progress, ghost }: HatInput): HatSegment[] {
  const p = clamp(power || 0, 0, RULES.MAX_POWER);
  const a = clamp(progress ?? 0, 0, p);
  const g = clamp(p + Math.max(0, ghost ?? 0), 0, RULES.MAX_POWER);
  return Array.from({ length: HAT_SEGMENTS }, (_, i) => ({ owner: fill(p, i), attack: fill(a, i), ghost: fill(g, i) }));
}

/** Düello canı = güç − ilerleme. */
export function duelHp(power: number, progress: number | null | undefined): number {
  return Math.max(0, Math.round((power || 0) - (progress ?? 0)));
}

/** Kuşatma seviyesi: %70 uyarı, %90 alarm. */
export function siegeLevel(power: number, progress: number | null | undefined): 'none' | 'warn' | 'alarm' {
  if (!progress || power <= 0) return 'none';
  const r = progress / power;
  if (r >= RULES.SIEGE_ALARM) return 'alarm';
  if (r >= RULES.SIEGE_WARN) return 'warn';
  return 'none';
}

/** Barın yanında yazan sayı: "60/85", "72 (−9)", "85". */
export function hatLabel({ power, progress, ghost }: HatInput): string {
  const p = Math.round(power || 0);
  if (progress && progress > 0) return `${Math.round(progress)}/${p}`;
  if (ghost && ghost > 0) return `${p} (−${Math.round(ghost)})`;
  return `${p}`;
}

/** Ekran okuyucu metni. */
export function hatA11y({ power, progress, ghost }: HatInput): string {
  const parts = [`Güç ${Math.round(power || 0)}`];
  if (progress && progress > 0) parts.push(`saldırı ilerlemesi ${Math.round(progress)}, düello canı ${duelHp(power, progress)}`);
  if (ghost && ghost > 0) parts.push(`son 7 günde ${Math.round(ghost)} eridi`);
  return parts.join(', ');
}
