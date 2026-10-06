import type { ActiveEvent } from '@hexrun/contracts';
import { activeEvents, eventWindow, EVENTS, type EventId } from '@hexrun/core';
import { S } from '../i18n';

const mult = (m: number) => `${String(m).replace('.', ',')}x`;

/** "güç 2x · saldırı 2x" */
export function eventsShortLabel(events: ReadonlyArray<Pick<ActiveEvent, 'move' | 'multiplier'>>): string {
  return events.map((e) => `${S.events.moves[e.move] ?? e.move} ${mult(e.multiplier)}`).join(' · ');
}

export function eventNames(events: ReadonlyArray<Pick<ActiveEvent, 'name'>>): string | null {
  return events.length ? events.map((e) => e.name).join(' + ') : null;
}

/**
 * Etkinlik listesi: sunucu verisi varsa onu kullan (katılımcı sayısı), yoksa çekirdek kurallardan
 * (eventWindow) yerel hesapla. Sayaçlar her zaman yerel saatle güncellenir.
 */
export function resolveEvents(server: readonly ActiveEvent[] | undefined, now: number = Date.now()): ActiveEvent[] {
  const ids: EventId[] = ['morning', 'blitz', 'evening'];
  return ids.map((id) => {
    const w = eventWindow(id, now);
    const s = server?.find((e) => e.id === id);
    const e = EVENTS[id];
    return {
      id,
      name: s?.name ?? e.name,
      move: e.move,
      multiplier: s?.multiplier ?? e.multiplier,
      window: s?.window ?? e.window,
      description: s?.description ?? e.description,
      active: w.active,
      endsInMin: w.endsInMin,
      startsInMin: w.startsInMin,
      participantsToday: s?.participantsToday ?? 0,
    };
  });
}

export function activeNow(now: number = Date.now()): ActiveEvent[] {
  return resolveEvents(undefined, now).filter((e) => activeEvents(now).some((a) => a.id === e.id));
}

/** Bitiş saati "23:59" gibi. */
export function endsAtLabel(endsInMin: number | null, now: number = Date.now()): string | null {
  if (endsInMin === null) return null;
  const d = new Date(now + endsInMin * 60_000 - 60_000);
  const f = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return f.format(d);
}
