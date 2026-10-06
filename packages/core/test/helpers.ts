import { gridDisk, latLngToCell } from 'h3-js';
import { RULES, emptyWorld, getCell, type PlayerState, type World } from '../src/index.js';

export const MODA = { lat: 40.9819, lng: 29.0254 };
/** 2026-10-05 Pazartesi 00:00 İstanbul (UTC+3). */
export const MON = Date.parse('2026-10-04T21:00:00Z');
export const H = 3_600_000;
export const D = 24 * H;

export function at(day: number, hour: number, minute = 0): number {
  return MON + day * D + hour * H + minute * 60_000;
}

export function disk(k: number, center = MODA): string[] {
  return gridDisk(latLngToCell(center.lat, center.lng, RULES.H3_RES), k).sort();
}

export function player(id: string, createdAt = MON - 100 * D, insignia: PlayerState['insignia'] = []): PlayerState {
  return { id, createdAt, insignia, shield: null };
}

export function worldWith(owner: string, cells: string[], power: number, loopAt: number, players: PlayerState[] = []): World {
  const w = emptyWorld();
  for (const p of players) w.players.set(p.id, p);
  for (const id of cells) {
    const c = getCell(w, id);
    c.ownerId = owner;
    c.power = power;
    c.ownedSince = loopAt;
    c.lastOwnerLoopAt = loopAt;
  }
  return w;
}
