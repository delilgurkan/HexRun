import {
  DAY_MS,
  activeEvents,
  applyLoop,
  createDuel,
  tick,
  validateDuel,
  type DuelError,
  type DuelState,
  type GameNotice,
  type LoopOutcome,
  type TickOutcome,
  type World,
} from '@hexrun/core';
import type { Tx } from '../db.js';
import { lockRegionOf } from '../lib/regions.js';
import {
  activeDuelsFor,
  activeDuelsOverlapping,
  addDuels,
  emptyWorld,
  ensureCells,
  loadCells,
  loadLosses,
  loadPlayers,
  lockRegions,
  persist,
  snapshot,
  writeCellEvents,
  type DuelRow,
  type Persisted,
} from './world.js';

export interface LoopTxResult {
  outcome: LoopOutcome;
  tickOutcome: TickOutcome;
  world: World;
  persisted: Persisted;
  /** Fetih sırasında geri alınan petekler (Geri Alan). */
  recaptured: number;
}

/**
 * Bir halkayı tek işlemde uygular. Kilit sırası: ilgili tüm bölgeler (sıralı).
 * Kilit alındıktan sonra düellolar yeniden okunur; yeni bölge çıkarsa o da kilitlenir.
 */
export async function applyLoopTx(c: Tx, userId: string, cells: readonly string[], at: number, now: number): Promise<LoopTxResult> {
  await ensureCells(c, cells);
  const held = new Set<string>();
  let rows: DuelRow[] = [];
  for (let round = 0; round < 3; round++) {
    const mine = await activeDuelsFor(c, userId);
    const attackCells = mine.filter((d) => d.attacker_id === userId).flatMap((d) => d.cells);
    const overlapping = await activeDuelsOverlapping(c, attackCells);
    rows = dedupe([...mine, ...overlapping]);
    const regions = new Set<string>(cells.map(lockRegionOf));
    for (const d of rows) d.lock_regions.forEach((r) => regions.add(r));
    const missing = [...regions].filter((r) => !held.has(r));
    if (!missing.length) break;
    await lockRegions(c, missing, held);
  }
  const w = emptyWorld();
  addDuels(w, rows);
  await loadCells(c, w, [...cells, ...rows.flatMap((d) => d.cells)]);
  await loadPlayers(c, w, [userId, ...rows.flatMap((d) => [d.attacker_id, d.defender_id])]);
  await loadLosses(c, w, [userId], at - 7 * DAY_MS);
  const snap = snapshot(w);
  const tickOutcome = tick(w, at);
  const outcome = applyLoop(w, { playerId: userId, cells, at });
  const lostBefore = new Set(w.losses.filter((l) => l.playerId === userId && l.at <= at).map((l) => l.cellId));
  let recaptured = 0;
  for (const cap of outcome.captured) if (cap.cells.some((id) => lostBefore.has(id))) recaptured++;
  const persisted = await persist(c, w, snap, now);
  await writeCellEvents(c, persisted, at);
  for (const n of outcome.notices) {
    if (n.type === 'duel_started') {
      await c.query('UPDATE duels SET defender_visible_at = $2 WHERE id = $1 AND defender_visible_at IS NULL', [n.duelId, new Date(n.notBefore)]);
    }
  }
  return { outcome, tickOutcome, world: w, persisted, recaptured };
}

function dedupe(rows: DuelRow[]): DuelRow[] {
  const m = new Map<string, DuelRow>();
  for (const r of rows) m.set(r.id, r);
  return [...m.values()];
}

/** Düello başlatma (kilitli doğrulama). */
export async function createDuelTx(c: Tx, id: string, attackerId: string, cells: readonly string[], now: number): Promise<DuelState | DuelError> {
  const regions = new Set(cells.map(lockRegionOf));
  await lockRegions(c, regions);
  const w = emptyWorld();
  const mine = (await activeDuelsFor(c, attackerId)).filter((d) => d.attacker_id === attackerId);
  addDuels(w, mine);
  await loadCells(c, w, cells);
  const v = validateDuel(w, attackerId, cells);
  if (!v.ok) return v.error;
  const d = createDuel(w, id, attackerId, cells, now);
  if (typeof d === 'string') return d;
  await c.query(
    `INSERT INTO duels (id, attacker_id, defender_id, cells, lock_regions, progress, created_at, status)
     VALUES ($1, $2, $3, $4, $5, 0, $6, 'active')`,
    [d.id, d.attackerId, d.defenderId, d.cells, [...regions].sort(), new Date(now)],
  );
  return d;
}

/**
 * Zaman ilerlemesi (erime, saldırgan erimesi, süre aşımı) bir kilit bölgesi için.
 * Bölgedeki sahipli petekler + o peteklere değen tüm aktif düellolar yüklenir.
 */
export async function tickRegionTx(c: Tx, region: string, now: number): Promise<{ notices: GameNotice[]; persisted: Persisted; world: World }> {
  const held = await lockRegions(c, [region]);
  const owned = await c.query<{ id: string }>('SELECT id FROM cells WHERE lock_region = $1 AND owner_id IS NOT NULL', [region]);
  const ids = owned.rows.map((r) => r.id);
  let rows = (await c.query<DuelRow>(`SELECT * FROM duels WHERE status = 'active' AND $1 = ANY(lock_regions)`, [region])).rows;
  const extra = new Set(rows.flatMap((d) => d.lock_regions));
  if ([...extra].some((r) => !held.has(r))) {
    await lockRegions(c, extra, held);
    rows = (await c.query<DuelRow>(`SELECT * FROM duels WHERE status = 'active' AND $1 = ANY(lock_regions)`, [region])).rows;
  }
  const w = emptyWorld();
  addDuels(w, rows);
  await loadCells(c, w, [...ids, ...rows.flatMap((d) => d.cells)]);
  await loadPlayers(c, w, [...new Set([...w.cells.values()].map((x) => x.ownerId).filter((x): x is string => !!x))]);
  const snap = snapshot(w);
  // Düelloların değdiği tüm bölgeler kilitli: yüklenen her peteği erittmek güvenli ve idempotent.
  const out = tick(w, now);
  const persisted = await persist(c, w, snap, now);
  await writeCellEvents(c, persisted, now);
  return { notices: out.notices, persisted, world: w };
}

export function eventsAt(at: number) {
  return activeEvents(at);
}
