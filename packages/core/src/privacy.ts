import { RULES } from './constants.js';
import { cellCenter, type CellId } from './cells.js';
import { destination, haversineM, type LatLng } from './geo.js';

/**
 * Gizlilik bölgesi: evin çevresi 200–800 m. Daire başkalarına çizilmez ve merkezi
 * her hesapta rastgele kaydırılır; peteklerin rengi görünür, ad ve baş harf görünmez.
 */
export interface PrivacyZone {
  center: LatLng;
  radiusM: number;
}

export function clampRadius(r: number): number {
  if (!Number.isFinite(r)) return RULES.PRIVACY_RADIUS_MIN_M;
  return Math.min(RULES.PRIVACY_RADIUS_MAX_M, Math.max(RULES.PRIVACY_RADIUS_MIN_M, Math.round(r)));
}

/**
 * Ev konumunu, yarıçapın en çok %40'ı kadar rastgele kaydırır. Ev, kaydırılmış dairenin
 * içinde kalır (kayma < yarıçap), ama daire merkezinden ev bulunamaz.
 */
export function makeZone(home: LatLng, radiusM: number, rnd: () => number = Math.random): PrivacyZone {
  const r = clampRadius(radiusM);
  const shift = r * 0.4 * Math.sqrt(rnd());
  const bearing = 360 * rnd();
  return { center: destination(home, bearing, shift), radiusM: r };
}

export function inZone(z: PrivacyZone, p: LatLng): boolean {
  return haversineM(z.center, p) <= z.radiusM;
}

export function cellInZone(z: PrivacyZone, id: CellId): boolean {
  return inZone(z, cellCenter(id));
}

export const HIDDEN_PLAYER_NAME = 'Gizli oyuncu';
