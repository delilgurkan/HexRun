import { HOUR_MS, RULES } from './constants.js';

/**
 * Saat ve uygulamalardan gelen koşu: aynı kurallar ve aynı hile kontrolü.
 * Yalnız son 24 saatte biten koşu haritaya işlenir; eskisi yalnız istatistiğe eklenir.
 * Aynı koşu iki kaynaktan gelirse bir kez sayılır.
 */
export type RunSource = 'phone' | 'apple_watch' | 'wear_os' | 'garmin' | 'coros' | 'suunto' | 'polar' | 'strava' | 'apple_health' | 'health_connect';

export const RUN_SOURCES: readonly RunSource[] = ['phone', 'apple_watch', 'wear_os', 'garmin', 'coros', 'suunto', 'polar', 'strava', 'apple_health', 'health_connect'];

export interface RunWindow {
  startedAt: number;
  endedAt: number;
  distanceM: number;
}

/** İki koşu aynı koşu mu: zaman aralıkları kısa olanın en az %60'ı kadar örtüşüyor ve mesafe ±%15. */
export function isSameRun(a: RunWindow, b: RunWindow): boolean {
  const overlap = Math.min(a.endedAt, b.endedAt) - Math.max(a.startedAt, b.startedAt);
  if (overlap <= 0) return false;
  const shorter = Math.min(a.endedAt - a.startedAt, b.endedAt - b.startedAt);
  if (shorter <= 0) return false;
  if (overlap / shorter < 0.6) return false;
  const big = Math.max(a.distanceM, b.distanceM);
  if (big === 0) return true;
  return Math.abs(a.distanceM - b.distanceM) / big <= 0.15;
}

export type ImportDecision = 'map' | 'stats_only' | 'duplicate';

export function importDecision(run: RunWindow, existing: readonly RunWindow[], now: number): ImportDecision {
  if (existing.some((e) => isSameRun(e, run))) return 'duplicate';
  return now - run.endedAt <= RULES.IMPORT_MAP_WINDOW_H * HOUR_MS ? 'map' : 'stats_only';
}
