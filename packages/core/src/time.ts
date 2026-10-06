import { DAY_MS, RULES } from './constants.js';

export interface LocalTime {
  /** YYYY-MM-DD (oyun saat diliminde). */
  day: string;
  hour: number;
  minute: number;
  /** 0 = Pazar … 6 = Cumartesi. */
  weekday: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localTime(ms: number, tz: string = RULES.TIMEZONE): LocalTime {
  const parts = Object.fromEntries(fmt(tz).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WD[parts.weekday as string] ?? 0,
  };
}

export function dayKey(ms: number, tz: string = RULES.TIMEZONE): string {
  return localTime(ms, tz).day;
}

/** İki gün anahtarı arasındaki gün farkı (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Bir gün sayacı: aynı gündeyse artır, değilse 1'den başlat. */
export interface DayCounter {
  day: string;
  count: number;
}

export function counterValue(c: DayCounter | null | undefined, day: string): number {
  return c && c.day === day ? c.count : 0;
}

export function bump(c: DayCounter | null | undefined, day: string): DayCounter {
  return { day, count: counterValue(c, day) + 1 };
}
