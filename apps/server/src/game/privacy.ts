import { HIDDEN_PLAYER_NAME, cellCenter, inZone, type PrivacyZone } from '@hexrun/core';
import type { PublicPlayer } from '@hexrun/contracts';
import type { Deps } from '../deps.js';
import type { Queryable } from '../db.js';
import { hmac } from '../lib/crypto.js';
import { asSlot } from './players.js';

/** Oyuncuların gizlilik bölgeleri (yalnız açık olanlar). */
export async function loadZones(q: Queryable, ids: Iterable<string>): Promise<Map<string, PrivacyZone>> {
  const list = [...new Set(ids)].filter(Boolean);
  if (!list.length) return new Map();
  const r = await q.query<{ id: string; privacy_lat: number | null; privacy_lng: number | null; privacy_radius_m: number | null }>(
    'SELECT id, privacy_lat, privacy_lng, privacy_radius_m FROM users WHERE id = ANY($1::uuid[]) AND privacy_radius_m IS NOT NULL',
    [list],
  );
  return new Map(r.rows.map((u) => [u.id, { center: { lat: u.privacy_lat!, lng: u.privacy_lng! }, radiusM: u.privacy_radius_m! }]));
}

export function hiddenIdFor(secret: string, ownerId: string): string {
  return `hidden:${hmac(secret, `hidden|${ownerId}`).slice(0, 16)}`;
}

export function cellHidden(zone: PrivacyZone | undefined, cell: string): boolean {
  return !!zone && inZone(zone, cellCenter(cell));
}

/** Petek listesinden biri sahibin gizlilik bölgesindeyse sahip kimliği gösterilmez. */
export function anyHidden(zone: PrivacyZone | undefined, cells: readonly string[]): boolean {
  return !!zone && cells.some((c) => inZone(zone, cellCenter(c)));
}

export function hiddenPlayer(d: Pick<Deps, 'cfg'>, ownerId: string, slot: string): PublicPlayer {
  return { id: hiddenIdFor(d.cfg.HASH_SECRET, ownerId), username: '', displayName: HIDDEN_PLAYER_NAME, initials: '', slot: asSlot(slot), teamName: null, insignia: [], goldFrame: false };
}
