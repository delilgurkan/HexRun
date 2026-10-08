import { initials, isSlot, RULES, DAY_MS, dayKey } from '@hexrun/core';
import type { Me, PublicPlayer, Slot } from '@hexrun/contracts';
import type { Queryable } from '../db.js';

export interface UserRow {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string;
  slot: string;
  role: 'user' | 'admin';
  locale: string;
  created_at: Date;
  privacy_lat: number | null;
  privacy_lng: number | null;
  privacy_radius_m: number | null;
  insignia: string[];
  insignia_changed_on: string | null;
  shield_cells: string[] | null;
  shield_until: Date | null;
  shield_week: string | null;
  team_id: string | null;
  invite_code: string;
  push_token: string | null;
  running_until: Date | null;
  league_region: string | null;
  team_name?: string | null;
}

export const asSlot = (s: string): Slot => (isSlot(s) ? s : 'keh');

export function toPublic(u: Pick<UserRow, 'id' | 'username' | 'display_name' | 'slot' | 'insignia'> & { team_name?: string | null }): PublicPlayer {
  const name = u.display_name || u.username || 'Oyuncu';
  return {
    id: u.id,
    username: u.username ?? '',
    displayName: name,
    initials: initials(name),
    slot: asSlot(u.slot),
    teamName: u.team_name ?? null,
    insignia: u.insignia,
    goldFrame: u.insignia.includes('toprak-50k'),
  };
}

export async function getUser(q: Queryable, id: string): Promise<UserRow | null> {
  const r = await q.query<UserRow>('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = $1', [id]);
  return r.rows[0] ?? null;
}

export async function loadPublicPlayers(q: Queryable, ids: Iterable<string>): Promise<Map<string, PublicPlayer>> {
  const list = [...new Set(ids)].filter(Boolean);
  if (!list.length) return new Map();
  const r = await q.query<UserRow>('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ANY($1::uuid[])', [list]);
  return new Map(r.rows.map((u) => [u.id, toPublic(u)]));
}

export function toMe(u: UserRow, now: number): Me {
  const left = Math.max(0, Math.ceil((u.created_at.getTime() + RULES.NEWBIE_DAYS * DAY_MS - now) / DAY_MS));
  return {
    ...toPublic(u),
    email: u.email,
    createdAt: u.created_at.toISOString(),
    newbieDaysLeft: left,
    teamId: u.team_id,
    privacy: { enabled: u.privacy_radius_m !== null, radiusM: u.privacy_radius_m },
    canChangeInsignia: u.insignia_changed_on !== dayKey(now),
    locale: u.locale,
  };
}
