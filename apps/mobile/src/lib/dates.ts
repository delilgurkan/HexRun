/** Türkçe tarih/saat biçimleri: "4 Ekim Pazar · 06:29–07:14", "Dün 21:30". */
const TZ = 'Europe/Istanbul';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

interface Parts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  wd: number;
}

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  weekday: 'short',
  hourCycle: 'h23',
});
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function parts(at: Date | number | string): Parts {
  const d = at instanceof Date ? at : new Date(at);
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year),
    mo: Number(p.month) - 1,
    d: Number(p.day),
    h: Number(p.hour) % 24,
    mi: Number(p.minute),
    wd: WD[p.weekday as string] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function hhmm(at: Date | number | string): string {
  const p = parts(at);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** "4 Ekim Pazar" */
export function dayLabel(at: Date | number | string): string {
  const p = parts(at);
  return `${p.d} ${MONTHS[p.mo]} ${DAYS[p.wd]}`;
}

/** "4 Ekim Pazar · 06:29–07:14" */
export function runRangeLabel(start: string | number, end: string | number): string {
  return `${dayLabel(start)} · ${hhmm(start)}–${hhmm(end)}`;
}

/** "4 EKİM 2026" (paylaşım kartı) */
export function shareDateLabel(at: Date | number | string): string {
  const p = parts(at);
  return `${p.d} ${MONTHS[p.mo]!.toLocaleUpperCase('tr-TR')} ${p.y}`;
}

export function monthName(at: Date | number | string): string {
  return MONTHS[parts(at).mo]!;
}

/** "11 Eyl" */
export function shortDate(at: Date | number | string): string {
  const p = parts(at);
  return `${p.d} ${MONTHS_SHORT[p.mo]}`;
}

function dayIndex(at: Date | number | string): number {
  const p = parts(at);
  return Math.floor(Date.UTC(p.y, p.mo, p.d) / 86_400_000);
}

export type DayGroup = 'today' | 'yesterday' | 'week' | 'earlier';

export function dayGroup(at: string | number, now: number = Date.now()): DayGroup {
  const diff = dayIndex(now) - dayIndex(at);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return 'week';
  return 'earlier';
}

/** "Bugün 06:52", "Dün 21:30", "11 Eyl" */
export function relativeLabel(at: string | number, now: number = Date.now()): string {
  const g = dayGroup(at, now);
  if (g === 'today') return `Bugün ${hhmm(at)}`;
  if (g === 'yesterday') return `Dün ${hhmm(at)}`;
  return shortDate(at);
}

export function minutesAgo(at: number, now: number = Date.now()): number {
  return Math.max(0, Math.round((now - at) / 60_000));
}
