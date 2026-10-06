import {
  cellAreaM2,
  emptyWorld,
  type CellState,
  type DuelState,
  type DuelStatus,
  type InsigniaId,
  type LossRecord,
  type PlayerState,
  type World,
} from '@hexrun/core';
import type { Tx } from '../db.js';
import { lockRegionOf, parent7Of } from '../lib/regions.js';

const d2n = (d: Date | null): number | null => (d ? d.getTime() : null);
const n2d = (n: number | null): Date | null => (n === null ? null : new Date(n));

/** Petek satırlarını (boş da olsa) oluşturur; kilitlemeden önce çağrılır. */
export async function ensureCells(c: Tx, ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  const uniq = [...new Set(ids)];
  await c.query(
    `INSERT INTO cells (id, parent7, lock_region, area_m2)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::real[])
     ON CONFLICT (id) DO NOTHING`,
    [uniq, uniq.map(parent7Of), uniq.map(lockRegionOf), uniq.map(cellAreaM2)],
  );
}

/** Bölge kilitleri her zaman aynı sırayla alınır: kilitlenme (deadlock) olmaz. */
export async function lockRegions(c: Tx, regions: Iterable<string>, held = new Set<string>()): Promise<Set<string>> {
  const todo = [...new Set(regions)].filter((r) => !held.has(r)).sort();
  for (const r of todo) {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`region:${r}`]);
    held.add(r);
  }
  return held;
}

interface CellRow {
  id: string;
  owner_id: string | null;
  power: number;
  owned_since: Date | null;
  last_owner_loop_at: Date | null;
  decay_steps: number;
  owner_loops_day: string | null;
  owner_loops_count: number;
  area_m2: number;
}

export async function loadCells(c: Tx, w: World, ids: readonly string[]): Promise<void> {
  const need = [...new Set(ids)].filter((id) => !w.cells.has(id));
  if (!need.length) return;
  const r = await c.query<CellRow>('SELECT * FROM cells WHERE id = ANY($1::text[])', [need]);
  for (const row of r.rows) w.cells.set(row.id, rowToCell(row));
}

export function rowToCell(row: CellRow): CellState {
  return {
    id: row.id,
    ownerId: row.owner_id,
    power: row.power,
    ownedSince: d2n(row.owned_since),
    lastOwnerLoopAt: d2n(row.last_owner_loop_at),
    decaySteps: row.decay_steps,
    ownerLoops: row.owner_loops_day ? { day: row.owner_loops_day, count: row.owner_loops_count } : null,
  };
}

export interface DuelRow {
  id: string;
  attacker_id: string;
  defender_id: string;
  cells: string[];
  lock_regions: string[];
  progress: number;
  created_at: Date;
  first_counted_at: Date | null;
  defender_visible_at: Date | null;
  last_attack_at: Date | null;
  attack_decay_steps: number;
  attacks_day: string | null;
  attacks_count: number;
  defenses_day: string | null;
  defenses_count: number;
  warned: number;
  status: DuelStatus | 'cancelled';
  ended_at: Date | null;
}

export function rowToDuel(r: DuelRow): DuelState {
  return {
    id: r.id,
    attackerId: r.attacker_id,
    defenderId: r.defender_id,
    cells: r.cells,
    progress: r.progress,
    createdAt: r.created_at.getTime(),
    firstCountedAt: d2n(r.first_counted_at),
    lastAttackAt: d2n(r.last_attack_at),
    attackDecaySteps: r.attack_decay_steps,
    attacks: r.attacks_day ? { day: r.attacks_day, count: r.attacks_count } : null,
    defenses: r.defenses_day ? { day: r.defenses_day, count: r.defenses_count } : null,
    warned: (Math.max(0, Math.min(2, r.warned)) as 0 | 1 | 2),
    status: r.status === 'cancelled' ? 'closed' : r.status,
    endedAt: d2n(r.ended_at),
  };
}

export async function activeDuelsFor(c: Tx, userId: string): Promise<DuelRow[]> {
  return (await c.query<DuelRow>(`SELECT * FROM duels WHERE status = 'active' AND (attacker_id = $1 OR defender_id = $1)`, [userId])).rows;
}

export async function activeDuelsOverlapping(c: Tx, cells: readonly string[]): Promise<DuelRow[]> {
  if (!cells.length) return [];
  return (await c.query<DuelRow>(`SELECT * FROM duels WHERE status = 'active' AND cells && $1::text[]`, [cells])).rows;
}

export function addDuels(w: World, rows: readonly DuelRow[]): void {
  for (const r of rows) if (!w.duels.has(r.id)) w.duels.set(r.id, rowToDuel(r));
}

interface PlayerRow {
  id: string;
  created_at: Date;
  insignia: string[];
  shield_cells: string[] | null;
  shield_until: Date | null;
}

export async function loadPlayers(c: Tx, w: World, ids: Iterable<string>): Promise<void> {
  const need = [...new Set(ids)].filter((id) => !w.players.has(id));
  if (!need.length) return;
  const r = await c.query<PlayerRow>('SELECT id, created_at, insignia, shield_cells, shield_until FROM users WHERE id = ANY($1::uuid[])', [need]);
  for (const p of r.rows) {
    const st: PlayerState = {
      id: p.id,
      createdAt: p.created_at.getTime(),
      insignia: p.insignia as InsigniaId[],
      shield: p.shield_cells && p.shield_until ? { cells: p.shield_cells, until: p.shield_until.getTime() } : null,
    };
    w.players.set(p.id, st);
  }
}

export async function loadLosses(c: Tx, w: World, playerIds: readonly string[], since: number): Promise<void> {
  if (!playerIds.length) return;
  const r = await c.query<{ cell_id: string; player_id: string; at: Date }>(
    'SELECT cell_id, player_id, at FROM losses WHERE player_id = ANY($1::uuid[]) AND at >= $2',
    [playerIds, new Date(since)],
  );
  for (const l of r.rows) w.losses.push({ cellId: l.cell_id, playerId: l.player_id, at: l.at.getTime() });
}

/** Yükleme sonrası anlık görüntü: kalıcılıkta yalnız değişenler yazılır. */
export interface Snapshot {
  cells: Map<string, string>;
  duels: Map<string, string>;
  losses: Set<LossRecord>;
}

export function snapshot(w: World): Snapshot {
  return {
    cells: new Map([...w.cells].map(([k, v]) => [k, JSON.stringify(v)])),
    duels: new Map([...w.duels].map(([k, v]) => [k, JSON.stringify(v)])),
    losses: new Set(w.losses),
  };
}

export interface Persisted {
  cells: CellState[];
  duels: DuelState[];
  before: { cells: Map<string, CellState>; duels: Map<string, DuelState> };
  newLosses: LossRecord[];
}

export async function persist(c: Tx, w: World, snap: Snapshot, now: number): Promise<Persisted> {
  const cells = [...w.cells.values()].filter((x) => snap.cells.get(x.id) !== JSON.stringify(x));
  const duels = [...w.duels.values()].filter((x) => snap.duels.get(x.id) !== JSON.stringify(x));
  const before = {
    cells: new Map(cells.filter((x) => snap.cells.has(x.id)).map((x) => [x.id, JSON.parse(snap.cells.get(x.id)!) as CellState])),
    duels: new Map(duels.filter((x) => snap.duels.has(x.id)).map((x) => [x.id, JSON.parse(snap.duels.get(x.id)!) as DuelState])),
  };
  if (cells.length) {
    await c.query(
      `UPDATE cells AS t SET owner_id = v.owner_id, power = v.power, owned_since = v.owned_since,
         last_owner_loop_at = v.last_owner_loop_at, decay_steps = v.decay_steps,
         owner_loops_day = v.owner_loops_day, owner_loops_count = v.owner_loops_count, updated_at = $9
       FROM unnest($1::text[], $2::uuid[], $3::real[], $4::timestamptz[], $5::timestamptz[], $6::int[], $7::text[], $8::int[])
         AS v(id, owner_id, power, owned_since, last_owner_loop_at, decay_steps, owner_loops_day, owner_loops_count)
       WHERE t.id = v.id`,
      [
        cells.map((x) => x.id),
        cells.map((x) => x.ownerId),
        cells.map((x) => x.power),
        cells.map((x) => n2d(x.ownedSince)),
        cells.map((x) => n2d(x.lastOwnerLoopAt)),
        cells.map((x) => x.decaySteps),
        cells.map((x) => x.ownerLoops?.day ?? null),
        cells.map((x) => x.ownerLoops?.count ?? 0),
        new Date(now),
      ],
    );
  }
  for (const d of duels) {
    await c.query(
      `UPDATE duels SET cells = $2, progress = $3, first_counted_at = $4, last_attack_at = $5, attack_decay_steps = $6,
         attacks_day = $7, attacks_count = $8, defenses_day = $9, defenses_count = $10, warned = $11, status = $12, ended_at = $13
       WHERE id = $1`,
      [
        d.id,
        d.cells,
        d.progress,
        n2d(d.firstCountedAt),
        n2d(d.lastAttackAt),
        d.attackDecaySteps,
        d.attacks?.day ?? null,
        d.attacks?.count ?? 0,
        d.defenses?.day ?? null,
        d.defenses?.count ?? 0,
        d.warned,
        d.status,
        n2d(d.endedAt),
      ],
    );
  }
  const newLosses = w.losses.filter((l) => !snap.losses.has(l));
  if (newLosses.length) {
    await c.query('INSERT INTO losses (cell_id, player_id, at) SELECT * FROM unnest($1::text[], $2::uuid[], $3::timestamptz[])', [
      newLosses.map((l) => l.cellId),
      newLosses.map((l) => l.playerId),
      newLosses.map((l) => new Date(l.at)),
    ]);
  }
  return { cells, duels, before, newLosses };
}

/** Değişen petekler için tarihçe olayları. */
export async function writeCellEvents(c: Tx, p: Persisted, at: number): Promise<void> {
  const rows: Array<[string, string, string | null, string | null, number]> = [];
  for (const x of p.cells) {
    const b = p.before.cells.get(x.id);
    const prevOwner = b?.ownerId ?? null;
    const prevPower = b?.power ?? 0;
    if (!prevOwner && x.ownerId) rows.push([x.id, 'claim', x.ownerId, null, x.power]);
    else if (prevOwner && x.ownerId && prevOwner !== x.ownerId) rows.push([x.id, 'capture', x.ownerId, prevOwner, x.power - prevPower]);
    else if (prevOwner && !x.ownerId) rows.push([x.id, 'empty', null, prevOwner, -prevPower]);
    else if (prevOwner && x.ownerId === prevOwner && x.power > prevPower) rows.push([x.id, 'reinforce', x.ownerId, null, x.power - prevPower]);
    else if (prevOwner && x.ownerId === prevOwner && x.power < prevPower) rows.push([x.id, 'decay', null, x.ownerId, x.power - prevPower]);
  }
  if (!rows.length) return;
  await c.query(
    `INSERT INTO cell_events (cell_id, kind, actor_id, from_id, power_delta, at)
     SELECT v.cell_id, v.kind, v.actor_id, v.from_id, v.power_delta, $6
     FROM unnest($1::text[], $2::text[], $3::uuid[], $4::uuid[], $5::real[]) AS v(cell_id, kind, actor_id, from_id, power_delta)`,
    [rows.map((r) => r[0]), rows.map((r) => r[1]), rows.map((r) => r[2]), rows.map((r) => r[3]), rows.map((r) => r[4]), new Date(at)],
  );
}

export { emptyWorld };
