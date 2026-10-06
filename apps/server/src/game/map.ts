import {
  assignDisplayColors,
  cellCenter,
  cellsAreaM2,
  components,
  eventWindow,
  EVENTS,
  HIDDEN_PLAYER_NAME,
  initials as initialsOf,
  inZone,
  neighbors,
  type ColorNode,
} from '@hexrun/core';
import { cellToParent, latLngToCell, polygonToCells } from 'h3-js';
import { DAY_MS, circleTrack, cellsInPolygon, destination, haversineM, pathLengthM, polygonAreaM2, dayKey } from '@hexrun/core';
import type { ActiveEvent, FirstLoopSuggestion, MapCell, MapPlayer, MapResponse, RegionDetail, Slot } from '@hexrun/contracts';
import type { Deps } from '../deps.js';
import type { Queryable } from '../db.js';
import { cellHidden, hiddenIdFor, loadZones } from './privacy.js';
import { badRequest } from '../lib/errors.js';
import { asSlot, loadPublicPlayers } from './players.js';
import { duelSummaries } from './duels.js';

export const MAX_BBOX_M = 6000;
export const MAX_MAP_CELLS = 25_000;

interface Bbox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export function parseBbox(s: string): Bbox {
  const p = s.split(',').map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isFinite(x))) throw badRequest('validation', 'bbox biçimi: minLat,minLng,maxLat,maxLng');
  const [minLat, minLng, maxLat, maxLng] = p as [number, number, number, number];
  if (minLat >= maxLat || minLng >= maxLng || minLat < -85 || maxLat > 85 || minLng < -180 || maxLng > 180) throw badRequest('validation', 'Geçersiz bbox.');
  const w = haversineM({ lat: minLat, lng: minLng }, { lat: minLat, lng: maxLng });
  const h = haversineM({ lat: minLat, lng: minLng }, { lat: maxLat, lng: minLng });
  if (w > MAX_BBOX_M || h > MAX_BBOX_M) throw badRequest('bbox_too_large', 'Harita alanı çok geniş; yakınlaştır.');
  return { minLat, minLng, maxLat, maxLng };
}

/** bbox'ı kaplayan res-7 ebeveynler (kenarlar için bir halka komşu eklenir). */
export function parentsForBbox(b: Bbox): string[] {
  const ring: Array<[number, number]> = [
    [b.minLat, b.minLng],
    [b.minLat, b.maxLng],
    [b.maxLat, b.maxLng],
    [b.maxLat, b.minLng],
  ];
  const inner = polygonToCells(ring, 7);
  const center = { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
  const seeds = new Set<string>(inner.length ? inner : [latLngToCell(center.lat, center.lng, 7)]);
  for (const c of [...seeds]) for (const n of neighbors(c)) seeds.add(n);
  return [...seeds];
}

interface CellRow {
  id: string;
  owner_id: string;
  power: number;
}

interface OwnerRow {
  id: string;
  username: string | null;
  display_name: string;
  slot: string;
  insignia: string[];
  privacy_lat: number | null;
  privacy_lng: number | null;
  privacy_radius_m: number | null;
}

let evCache: { minute: number; windows: Array<ReturnType<typeof eventWindow>> } | null = null;
let partCache: { minute: number; n: number } | null = null;

export async function activeEventsDto(q: Queryable, now: number): Promise<ActiveEvent[]> {
  const today = dayKey(now);
  const minute = Math.floor(now / 60_000);
  // Etkinlik pencereleri dakikada bir hesaplanır (her harita isteğinde değil).
  if (!evCache || evCache.minute !== minute) evCache = { minute, windows: Object.values(EVENTS).map((e) => eventWindow(e.id, now)) };
  if (!partCache || partCache.minute !== minute) {
    const r = await q.query<{ n: string }>('SELECT COUNT(DISTINCT user_id) n FROM run_days WHERE day = $1', [today]);
    partCache = { minute, n: Number(r.rows[0]?.n ?? 0) };
  }
  const participants = partCache.n;
  return Object.values(EVENTS).map((e, i) => {
    const w = evCache!.windows[i]!;
    return { ...e, active: w.active, endsInMin: w.endsInMin, startsInMin: w.startsInMin, participantsToday: w.active ? participants : 0 };
  });
}

/**
 * Görüntüleyenden bağımsız harita tabanı (petekler, merkezler, farklı sahipli komşu çiftleri).
 * Kısa ömürlü önbellek; bu süreçte yazılan petekler ilgili res-7 karolarını hemen geçersiz kılar.
 */
interface MapBase {
  at: number;
  parents: Set<string>;
  rows: CellRow[];
  centers: Map<string, { lat: number; lng: number }>;
  borders: Array<[string, string]>;
  truncated: boolean;
}
const BASE_TTL_MS = 5_000;
const baseCache = new Map<string, MapBase>();

export function invalidateMap(cells: Iterable<string>): void {
  const ps = new Set<string>();
  for (const c of cells) ps.add(cellToParent(c, 7));
  if (!ps.size) return;
  for (const [k, v] of baseCache) if ([...ps].some((p) => v.parents.has(p))) baseCache.delete(k);
}

async function loadBase(d: Deps, parents: string[], now: number): Promise<MapBase> {
  const key = [...parents].sort().join(',');
  const hit = baseCache.get(key);
  if (hit && now - hit.at < BASE_TTL_MS && now >= hit.at) return hit;
  const rows = (
    await d.db.query<CellRow>(`SELECT id, owner_id, power FROM cells WHERE parent7 = ANY($1::text[]) AND owner_id IS NOT NULL LIMIT $2`, [parents, MAX_MAP_CELLS + 1])
  ).rows;
  const truncated = rows.length > MAX_MAP_CELLS;
  const kept = rows.slice(0, MAX_MAP_CELLS);
  const centers = new Map(kept.map((r) => [r.id, cellCenter(r.id)]));
  const ownerOf = new Map(kept.map((r) => [r.id, r.owner_id]));
  const borders: Array<[string, string]> = [];
  for (const r of kept) {
    for (const n of neighbors(r.id)) {
      const o = ownerOf.get(n);
      if (o && o !== r.owner_id && r.id < n) borders.push([r.id, n]);
    }
  }
  const base: MapBase = { at: now, parents: new Set(parents), rows: kept, centers, borders, truncated };
  if (baseCache.size > 500) baseCache.delete(baseCache.keys().next().value!);
  baseCache.set(key, base);
  return base;
}

export async function getMap(d: Deps, viewerId: string, bboxStr: string): Promise<MapResponse> {
  const now = d.clock.now();
  const b = parseBbox(bboxStr);
  const parents = parentsForBbox(b);
  const base = await loadBase(d, parents, now);
  const truncated = base.truncated;
  const centers = base.centers;
  const inBox = base.rows.filter((r) => {
    const c = centers.get(r.id)!;
    return c.lat >= b.minLat && c.lat <= b.maxLat && c.lng >= b.minLng && c.lng <= b.maxLng;
  });
  const ownerIds = [...new Set(inBox.map((r) => r.owner_id))];
  const owners = new Map(
    (await d.db.query<OwnerRow>('SELECT id, username, display_name, slot, insignia, privacy_lat, privacy_lng, privacy_radius_m FROM users WHERE id = ANY($1::uuid[])', [ownerIds])).rows.map((o) => [o.id, o]),
  );
  // Görüntüleyenle ilgili düellolar: sahibi olduğun petekler (tüm saldırganlar) ve senin saldırıların.
  const duels = (
    await d.db.query<{ attacker_id: string; defender_id: string; cells: string[]; progress: number }>(
      `SELECT attacker_id, defender_id, cells, progress FROM duels WHERE status = 'active'
         AND (attacker_id = $1 OR (defender_id = $1 AND defender_visible_at <= $2))`,
      [viewerId, new Date(now)],
    )
  ).rows;
  const duelOf = new Map<string, { role: 'defending' | 'attacking'; progress: number }>();
  for (const du of duels) {
    const role = du.defender_id === viewerId ? 'defending' : 'attacking';
    for (const id of du.cells) {
      const cur = duelOf.get(id);
      if (!cur || du.progress > cur.progress) duelOf.set(id, { role, progress: du.progress });
    }
  }
  // Hayalet segment: son 7 günde eriyen güç. Zaman indeksiyle tarayıp görünen peteklere süzülür.
  const visible = new Set(inBox.map((r) => r.id));
  const ghosts = new Map<string, number>();
  for (const g of (
    await d.db.query<{ cell_id: string; lost: number }>(
      `SELECT e.cell_id, -SUM(e.power_delta)::float8 AS lost FROM cell_events e
       WHERE e.kind = 'decay' AND e.at >= $2 AND e.cell_id IN (SELECT id FROM cells WHERE parent7 = ANY($1::text[]) AND owner_id IS NOT NULL)
       GROUP BY e.cell_id`,
      [parents, new Date(now - 7 * DAY_MS)],
    )
  ).rows) {
    if (visible.has(g.cell_id)) ghosts.set(g.cell_id, g.lost);
  }

  // Gizlilik: bölgedeki petekler "Gizli oyuncu"; kimlik opak.
  const hiddenId = (ownerId: string) => hiddenIdFor(d.cfg.HASH_SECRET, ownerId);
  const isHidden = (r: CellRow) => {
    if (r.owner_id === viewerId) return false;
    const o = owners.get(r.owner_id);
    if (!o || o.privacy_radius_m === null || o.privacy_lat === null || o.privacy_lng === null) return false;
    return inZone({ center: { lat: o.privacy_lat, lng: o.privacy_lng }, radiusM: o.privacy_radius_m }, centers.get(r.id)!);
  };

  const shown = inBox.map((r) => ({ r, hidden: isHidden(r) }));
  const key = (x: { r: CellRow; hidden: boolean }) => (x.hidden ? hiddenId(x.r.owner_id) : x.r.owner_id);
  // Renk komşuluk grafı (aynı sahibin gizli ve açık petekleri aynı imza rengini paylaşır).
  const ownerOfCell = new Map(shown.map((x) => [x.r.id, key(x)]));
  const realOf = new Map(shown.map((x) => [key(x), x.r.owner_id]));
  const edges: Array<[string, string]> = [];
  const seenEdge = new Set<string>();
  for (const [a, c2] of base.borders) {
    const k = ownerOfCell.get(a);
    const k2 = ownerOfCell.get(c2);
    if (!k || !k2 || k === k2) continue;
    const e = k < k2 ? `${k}|${k2}` : `${k2}|${k}`;
    if (seenEdge.has(e)) continue;
    seenEdge.add(e);
    edges.push([k, k2]);
  }
  const nodes: ColorNode[] = [...realOf].map(([k, real]) => ({ id: k, slot: asSlot(owners.get(real)?.slot ?? 'keh') }));
  const colors = assignDisplayColors(viewerId, nodes, edges);

  const cells: MapCell[] = shown.map((x) => {
    const k = key(x);
    const du = x.hidden ? undefined : duelOf.get(x.r.id);
    return {
      id: x.r.id,
      ownerId: k,
      power: Math.round(x.r.power),
      slot: (colors.get(k) ?? 'keh') as Slot,
      duel: du?.role ?? null,
      progress: du ? Math.round(du.progress) : null,
      ghost: Math.round(ghosts.get(x.r.id) ?? 0),
    };
  });

  // İşaretçiler: her oyuncunun görünen en büyük parçasının merkezi.
  const byOwner = new Map<string, string[]>();
  for (const c of cells) {
    const arr = byOwner.get(c.ownerId!) ?? [];
    arr.push(c.id);
    byOwner.set(c.ownerId!, arr);
  }
  const players: MapPlayer[] = [...byOwner].map(([k, ids]) => {
    const hidden = k.startsWith('hidden:');
    const o = owners.get(realOf.get(k)!)!;
    let marker: { lat: number; lng: number } | null = null;
    if (!hidden) {
      // İşaretçi oyuncunun kendi peteğinde durur: ağırlık merkezine en yakın petek (O(n)).
      const pts = ids.map((id) => centers.get(id)!);
      const mLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
      const mLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
      let best = pts[0]!;
      let bd = Infinity;
      for (const p of pts) {
        const dd = (p.lat - mLat) ** 2 + (p.lng - mLng) ** 2;
        if (dd < bd) {
          bd = dd;
          best = p;
        }
      }
      marker = { lat: best.lat, lng: best.lng };
    }
    const name = o.display_name || o.username || 'Oyuncu';
    return {
      id: k,
      displayName: hidden ? HIDDEN_PLAYER_NAME : name,
      initials: hidden ? '' : initialsOf(name),
      slot: (colors.get(k) ?? 'keh') as Slot,
      goldFrame: !hidden && o.insignia.includes('toprak-50k'),
      hidden,
      marker,
      cells: ids.length,
    };
  });

  const att = await d.db.query<{ n: string }>(
    `SELECT COUNT(DISTINCT attacker_id) n FROM duels WHERE defender_id = $1 AND last_attack_at >= $2 AND defender_visible_at <= $3`,
    [viewerId, new Date(now - 2 * DAY_MS), new Date(now)],
  );
  return {
    cells,
    players,
    attackersLast48h: Number(att.rows[0]?.n ?? 0),
    activeEvents: (await activeEventsDto(d.db, now)).filter((e) => e.active),
    truncated,
    serverTime: new Date(now).toISOString(),
  };
}


/** Dokunulan peteğin sahibine ait bitişik petekler (en çok 3000). */
export async function regionCells(q: Queryable, cellId: string, ownerId: string): Promise<string[]> {
  const out = new Set<string>([cellId]);
  let frontier = [cellId];
  while (frontier.length && out.size < 3000) {
    const cand = [...new Set(frontier.flatMap(neighbors))].filter((c) => !out.has(c));
    if (!cand.length) break;
    const r = await q.query<{ id: string }>('SELECT id FROM cells WHERE id = ANY($1::text[]) AND owner_id = $2', [cand, ownerId]);
    frontier = r.rows.map((x) => x.id);
    frontier.forEach((c) => out.add(c));
  }
  return [...out].sort();
}

export async function getRegion(d: Deps, viewerId: string, cellId: string): Promise<RegionDetail> {
  const now = d.clock.now();
  const cell = (await d.db.query<{ owner_id: string | null }>('SELECT owner_id FROM cells WHERE id = $1', [cellId])).rows[0];
  const events = (await activeEventsDto(d.db, now)).filter((e) => e.active);
  const myActive = await d.db.query<{ n: string }>(`SELECT COUNT(*) n FROM duels WHERE status = 'active' AND attacker_id = $1`, [viewerId]);
  const slotsLeft = Math.max(0, 3 - Number(myActive.rows[0]?.n ?? 0));
  if (!cell?.owner_id) {
    return { owner: null, hidden: false, cells: [cellId], areaM2: Math.round(cellsAreaM2([cellId])), avgPower: 0, ownedSinceDays: null, lastDefenseAt: null, myDuel: null, incomingDuels: [], history: [], activeEvents: events, canStartDuel: false, duelSlotsLeft: slotsLeft };
  }
  const ownerId = cell.owner_id;
  const zones = await loadZones(d.db, [ownerId]);
  const zone = ownerId === viewerId ? undefined : zones.get(ownerId);
  const hidden = cellHidden(zone, cellId);
  // Gizli ve açık petekler hiçbir zaman tek bölgede birleşmez: dokunulan peteğin tarafında kalanlar.
  const all = await regionCells(d.db, cellId, ownerId);
  const sameSide = zone ? all.filter((c) => cellHidden(zone, c) === hidden) : all;
  const ids = zone ? (components(sameSide).find((comp) => comp.includes(cellId)) ?? [cellId]) : all;
  const owner = (await loadPublicPlayers(d.db, [ownerId])).get(ownerId)!;
  const agg = (await d.db.query<{ p: number; since: Date | null }>('SELECT AVG(power)::float8 p, MIN(owned_since) since FROM cells WHERE id = ANY($1::text[])', [ids])).rows[0]!;
  const lastDef = (await d.db.query<{ at: Date | null }>(`SELECT MAX(at) at FROM cell_events WHERE kind = 'reinforce' AND cell_id = ANY($1::text[])`, [ids])).rows[0]!;
  const duelRows = (await d.db.query<{ id: string }>(`SELECT id FROM duels WHERE status = 'active' AND cells && $1::text[] AND (attacker_id = $2 OR defender_id = $2)`, [ids, viewerId])).rows;
  const sums = await duelSummaries(d, viewerId, duelRows.map((x) => x.id));
  const myDuel = sums.find((s) => s.attacker.id === viewerId) ?? null;
  const incoming = ownerId === viewerId ? sums.filter((s) => s.defender.id === viewerId) : [];
  const hist = (
    await d.db.query<{ at: Date; kind: string; actor_id: string | null; from_id: string | null; n: string }>(
      `SELECT date_trunc('day', at) AS at, kind, actor_id, from_id, COUNT(*) n FROM cell_events
       WHERE cell_id = ANY($1::text[]) AND kind IN ('claim', 'capture') AND at >= $2
       GROUP BY 1, 2, 3, 4 ORDER BY 1 DESC LIMIT 10`,
      [ids, new Date(now - 60 * DAY_MS)],
    )
  ).rows;
  const histIds = hist.flatMap((h) => [h.actor_id, h.from_id].filter((x): x is string => !!x));
  const names = await loadPublicPlayers(d.db, histIds);
  const histZones = await loadZones(d.db, histIds);
  // Eski sahiplerin gizlilik bölgesi de korunur.
  const nm = (id: string | null) => (!id ? 'Bir oyuncu' : id !== viewerId && cellHidden(histZones.get(id), cellId) ? HIDDEN_PLAYER_NAME : names.get(id)?.displayName ?? 'Bir oyuncu');
  const history = hist.map((h) => ({
    at: h.at.toISOString(),
    text: h.kind === 'claim' ? `${hidden ? 'Gizli oyuncu' : nm(h.actor_id)} aldı · boştu` : `${hidden ? 'Gizli oyuncu' : nm(h.actor_id)} aldı · ${nm(h.from_id)} oyuncusundan düelloyla`,
  }));
  return {
    owner: hidden ? null : owner,
    hidden,
    cells: ids,
    areaM2: Math.round(cellsAreaM2(ids)),
    avgPower: Math.round(agg.p ?? 0),
    ownedSinceDays: agg.since ? Math.floor((now - agg.since.getTime()) / DAY_MS) : null,
    lastDefenseAt: lastDef.at ? lastDef.at.toISOString() : null,
    myDuel,
    incomingDuels: incoming,
    history,
    activeEvents: events,
    canStartDuel: ownerId !== viewerId && !myDuel && slotsLeft > 0,
    duelSlotsLeft: slotsLeft,
  };
}

/**
 * Yeni kullanıcı: boş harita değil, ilk halka. Yakında, petekleri en boş olan
 * ≈2,1 km'lik bir daire önerilir.
 */
export async function firstLoop(d: Deps, lat: number, lng: number): Promise<FirstLoopSuggestion | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) throw badRequest('validation', 'Konum geçersiz.');
  const R = 330;
  const here = { lat, lng };
  const candidates = [here, ...[0, 60, 120, 180, 240, 300].map((b) => destination(here, b, 450))];
  let best: FirstLoopSuggestion | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const ring = circleTrack(c, R, 48, 0, 3).map((p) => ({ lat: p.lat, lng: p.lng }));
    const cells = cellsInPolygon(ring);
    if (!cells.length) continue;
    const owned = await d.db.query<{ n: string }>('SELECT COUNT(*) n FROM cells WHERE id = ANY($1::text[]) AND owner_id IS NOT NULL', [cells]);
    const empty = cells.length - Number(owned.rows[0]?.n ?? 0);
    const score = empty / cells.length - haversineM(here, c) / 10_000;
    if (score > bestScore) {
      bestScore = score;
      best = { ring, lengthM: Math.round(pathLengthM(ring)), areaM2: Math.round(polygonAreaM2(ring)), emptyCells: empty };
    }
  }
  if (!best || best.emptyCells === 0) return null;
  return best;
}
