import {
  DAY_MS,
  HOUR_MS,
  RULES,
  cellsAreaM2,
  counterValue,
  dayKey,
  eventMultiplier,
  isNewbie,
  outline,
  pathLengthM,
  validateDuel,
  type DuelError,
} from '@hexrun/core';
import type { DuelPreview, DuelSummary } from '@hexrun/contracts';
import type { Deps } from '../deps.js';
import { tx } from '../db.js';
import { uuid } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { createDuelTx } from './play.js';
import { loadPublicPlayers } from './players.js';
import { addDuels, emptyWorld, loadCells, type DuelRow } from './world.js';

export const DUEL_ERROR_TEXT: Record<DuelError, string> = {
  self: 'Kendi alanına düello açamazsın.',
  size: 'Düello alanı 7 ile 60 petek arasında olmalı.',
  not_owned: 'Seçimde sahipsiz petek var.',
  mixed_owner: 'Seçim tek bir oyuncunun peteklerinden oluşmalı.',
  not_connected: 'Seçilen petekler bitişik olmalı.',
  limit: 'Aynı anda en çok 3 düellon olabilir.',
  overlap: 'Bu peteklerin bir kısmı zaten düellonda.',
  duplicate_cells: 'Aynı petek iki kez seçilmiş.',
};

function routeOf(cells: readonly string[]) {
  const ring = outline(cells);
  return { route: ring, routeLengthM: Math.round(pathLengthM(ring)) };
}

export async function duelSummaries(d: Deps, viewerId: string, ids: readonly string[]): Promise<DuelSummary[]> {
  if (!ids.length) return [];
  const now = d.clock.now();
  const rows = (await d.db.query<DuelRow>('SELECT * FROM duels WHERE id = ANY($1::uuid[])', [ids])).rows;
  // Düellolar gizli: sahip tümünü, saldırgan yalnız kendisininkini görür.
  const visible = rows.filter((r) => r.attacker_id === viewerId || (r.defender_id === viewerId && defenderCanSee(r, now)));
  const pub = await loadPublicPlayers(d.db, visible.flatMap((r) => [r.attacker_id, r.defender_id]));
  const w = emptyWorld();
  const c = await d.db.connect();
  try {
    addDuels(w, visible);
    await loadCells(c as never, w, visible.flatMap((r) => r.cells));
  } finally {
    c.release();
  }
  const created = await d.db.query<{ id: string; created_at: Date }>('SELECT id, created_at FROM users WHERE id = ANY($1::uuid[])', [visible.map((r) => r.attacker_id)]);
  const createdAt = new Map(created.rows.map((x) => [x.id, x.created_at.getTime()]));
  const today = dayKey(now);
  const mult = eventMultiplier('attack', now);
  return visible.map((r) => {
    const live = r.cells.filter((id) => w.cells.get(id)?.ownerId === r.defender_id);
    const power = live.length ? live.reduce((s, id) => s + (w.cells.get(id)?.power ?? 0), 0) / live.length : 0;
    const hp = Math.max(0, power - r.progress);
    const newbie = isNewbie({ id: r.attacker_id, createdAt: createdAt.get(r.attacker_id) ?? 0, insignia: [], shield: null }, now);
    return {
      id: r.id,
      status: r.status,
      attacker: pub.get(r.attacker_id)!,
      defender: pub.get(r.defender_id)!,
      cells: r.cells,
      hp: Math.round(hp),
      power: Math.round(power),
      progress: Math.round(r.progress),
      createdAt: r.created_at.toISOString(),
      firstCountedAt: r.first_counted_at?.toISOString() ?? null,
      lastAttackAt: r.last_attack_at?.toISOString() ?? null,
      attacksToday: counterValue(r.attacks_day ? { day: r.attacks_day, count: r.attacks_count } : null, today),
      attackLimitToday: newbie ? RULES.NEWBIE_ATTACK_LIMIT : RULES.ATTACK_DAILY_LIMIT,
      defensesToday: counterValue(r.defenses_day ? { day: r.defenses_day, count: r.defenses_count } : null, today),
      loopsToCapture: hp <= 0 ? 0 : Math.ceil(hp / (RULES.ATTACK * mult)),
      ...routeOf(r.cells),
      expiresAt: r.status === 'active' && !r.first_counted_at ? new Date(r.created_at.getTime() + RULES.DUEL_EXPIRE_H * HOUR_MS).toISOString() : null,
    };
  });
}

export function defenderCanSee(r: Pick<DuelRow, 'defender_visible_at'>, now: number): boolean {
  return !!r.defender_visible_at && r.defender_visible_at.getTime() <= now;
}

export function normalizeCells(cells: unknown): string[] {
  if (!Array.isArray(cells) || cells.length > 200) throw badRequest('validation', 'Petek listesi geçersiz.');
  return cells.map(String);
}

export async function previewDuel(d: Deps, userId: string, cells: string[]): Promise<DuelPreview> {
  const w = emptyWorld();
  const c = await d.db.connect();
  let slotsLeft = 0;
  try {
    const mine = (await c.query<DuelRow>(`SELECT * FROM duels WHERE status = 'active' AND attacker_id = $1`, [userId])).rows;
    slotsLeft = Math.max(0, RULES.MAX_ACTIVE_DUELS - mine.length);
    addDuels(w, mine);
    await loadCells(c as never, w, cells);
  } finally {
    c.release();
  }
  const v = validateDuel(w, userId, cells);
  const avg = cells.length ? cells.reduce((s, id) => s + (w.cells.get(id)?.power ?? 0), 0) / cells.length : 0;
  const { routeLengthM } = v.ok ? routeOf(cells) : { routeLengthM: 0 };
  return {
    ok: v.ok,
    ...(v.ok ? {} : { error: v.error }),
    cells: cells.length,
    areaM2: Math.round(cellsAreaM2(cells.filter((x) => w.cells.has(x)))),
    avgPower: Math.round(avg),
    routeLengthM,
    // 5'30"/km varsayımıyla tahmini süre.
    estMinutes: Math.round((routeLengthM / 1000) * 5.5),
    slotsLeft,
  };
}

export async function startDuel(d: Deps, userId: string, cells: string[]): Promise<DuelSummary> {
  const id = uuid();
  const r = await tx(d.db, (c) => createDuelTx(c, id, userId, cells, d.clock.now()));
  if (typeof r === 'string') throw (r === 'limit' || r === 'overlap' ? conflict : badRequest)(`duel_${r}`, DUEL_ERROR_TEXT[r]);
  return (await duelSummaries(d, userId, [id]))[0]!;
}

export async function cancelDuel(d: Deps, userId: string, id: string): Promise<void> {
  const r = await d.db.query<{ attacker_id: string; status: string }>('SELECT attacker_id, status FROM duels WHERE id = $1', [id]);
  const row = r.rows[0];
  if (!row) throw notFound('Düello bulunamadı.');
  if (row.attacker_id !== userId) throw forbidden('Yalnız düelloyu açan vazgeçebilir.');
  if (row.status !== 'active') throw conflict('duel_not_active', 'Düello zaten bitti.');
  await d.db.query(`UPDATE duels SET status = 'cancelled', ended_at = $2 WHERE id = $1 AND status = 'active'`, [id, new Date(d.clock.now())]);
}

export async function listDuels(d: Deps, userId: string): Promise<{ attacking: DuelSummary[]; defending: DuelSummary[] }> {
  const r = await d.db.query<{ id: string }>(
    `SELECT id FROM duels WHERE (attacker_id = $1 OR (defender_id = $1 AND defender_visible_at <= $3))
       AND (status = 'active' OR ended_at >= $2) ORDER BY created_at DESC LIMIT 50`,
    [userId, new Date(d.clock.now() - 7 * DAY_MS), new Date(d.clock.now())],
  );
  const all = await duelSummaries(d, userId, r.rows.map((x) => x.id));
  return { attacking: all.filter((x) => x.attacker.id === userId), defending: all.filter((x) => x.defender.id === userId) };
}

export async function getDuel(d: Deps, userId: string, id: string): Promise<DuelSummary> {
  const s = (await duelSummaries(d, userId, [id]))[0];
  if (!s) throw notFound('Düello bulunamadı.');
  return s;
}
