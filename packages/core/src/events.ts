import { RULES } from './constants.js';
import { localTime } from './time.js';

/**
 * Zaman çarpanları. Her çarpan farklı bir hamleye uygulanır, üst üste binmez;
 * boş petek alımında çarpan yoktur. Nerede koşarsan koş geçerli.
 */
export type EventId = 'morning' | 'blitz' | 'evening';
export type MoveKind = 'gain' | 'attack' | 'pushback';

export interface GameEvent {
  id: EventId;
  name: string;
  move: MoveKind;
  multiplier: number;
  /** İnsan okunur pencere. */
  window: string;
  description: string;
}

export const EVENTS: Record<EventId, GameEvent> = {
  morning: {
    id: 'morning',
    name: 'Sabah Avantajı',
    move: 'gain',
    multiplier: 2,
    window: '06:00–09:00',
    description: 'Nerede koşarsan koş, halkadan kendi peteklerine 2x güç.',
  },
  blitz: {
    id: 'blitz',
    name: 'Hafta Sonu Blitz',
    move: 'attack',
    multiplier: 2,
    window: 'Cmt–Paz',
    description: 'Hafta sonu düello saldırıları 2x.',
  },
  evening: {
    id: 'evening',
    name: 'Akşam Savunması',
    move: 'pushback',
    multiplier: 1.5,
    window: '18:00–21:00',
    description: 'Sahibin halkası saldırganları 1,5x geri iter.',
  },
};

export function activeEvents(ms: number, tz: string = RULES.TIMEZONE): GameEvent[] {
  const lt = localTime(ms, tz);
  const out: GameEvent[] = [];
  if (lt.hour >= 6 && lt.hour < 9) out.push(EVENTS.morning);
  if (lt.weekday === 6 || lt.weekday === 0) out.push(EVENTS.blitz);
  if (lt.hour >= 18 && lt.hour < 21) out.push(EVENTS.evening);
  return out;
}

export function eventMultiplier(move: MoveKind, ms: number, tz: string = RULES.TIMEZONE): number {
  const e = activeEvents(ms, tz).find((x) => x.move === move);
  return e ? e.multiplier : 1;
}

/** Bir sonraki etkinlik başlangıcı ve aktifse bitişi (Etkinlik sekmesi sayaçları için). */
export function eventWindow(id: EventId, ms: number, tz: string = RULES.TIMEZONE): { active: boolean; endsInMin: number | null; startsInMin: number } {
  // Dakika adımlı tarama; en fazla 8 gün. Basit ve saat dilimi geçişlerine dayanıklı.
  const isOn = (t: number) => activeEvents(t, tz).some((e) => e.id === id);
  const step = 60_000;
  const active = isOn(ms);
  let endsInMin: number | null = null;
  let startsInMin = 0;
  if (active) {
    let t = ms;
    let n = 0;
    while (isOn(t) && n < 8 * 24 * 60) {
      t += step;
      n++;
    }
    endsInMin = n;
  } else {
    let t = ms;
    let n = 0;
    while (!isOn(t) && n < 8 * 24 * 60) {
      t += step;
      n++;
    }
    startsInMin = n;
  }
  return { active, endsInMin, startsInMin };
}
