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
import { latLngToCell, polygonToCells } from 'h3-js';
import { DAY_MS, circleTrack, cellsInPolygon, destination, haversineM, pathLengthM, polygonAreaM2, dayKey } from '@hexrun/core';
import type { ActiveEvent, FirstLoopSuggestion, MapCell, MapPlayer, MapResponse, RegionDetail, Slot } from '@hexrun/contracts';
import type { Deps } from '../deps.js';
import type { Queryable } from '../db.js';
import { hmac } from '../lib/crypto.js';
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

export async function activeEventsDto(q: Queryable, now: number): Promise<ActiveEvent[]> {
  const today = dayKey(now);
  const r = await q.query<{ n: string }>('SELECT COUNT(DISTINCT user_id) n FROM run_days WHERE day = $1', [today]);
  const participants = Number(r.rows[0]?.n ?? 0);
  return Object.values(EVENTS).map((e) => {
    const w = eventWindow(e.id, now);
    return { ...e, active: w.active, endsInMin: w.endsInMin, startsInMin: w.startsInMin, participantsToday: w.active ? participants : 0 };
  });
}

export async function getMap(d: Deps, viewerId: string, bboxStr: string): Promise<MapResponse> {
  const now = d.clock.now();
  const b = parseBbox(bboxStr);
  const parents = parentsForBbox(b);
  const rows = (
    await d.db.query<CellRow>(
      `SELECT id, owner_id, power FROM cells WHERE parent7 = ANY($1::text[]) AND owner_id IS NOT NULL LIMIT $2`,
      [parents, MAX_MAP_CELLS + 1],
    )
  ).rows;
  const truncated = rows.length > MAX_MAP_CELLS;
  const inBox = rows.slice(0, MAX_MAP_CELLS).filter((r) => {
    const c = cellCenter(r.id);
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
  const ghosts = new Map(
    (
      await d.db.query<{ cell_id: string; lost: number }>(
        `SELECT cell_id, -SUM(power_delta)::float8 AS lost FROM cell_events WHERE kind = 'decay' AND at >= $2 AND cell_id = ANY($1::text[]) GROUP BY cell_id`,
        [inBox.map((r) => r.id), new Date(now - 7 * DAY_MS)],
      )
    ).rows.map((g) => [g.cell_id, g.lost]),
  );

  // Gizlilik: bölgedeki petekler "Gizli oyuncu"; kimlik opak.
  const hiddenId = (ownerId: string) => `hidden:${hmac(d.cfg.HASH_SECRET, `hidden|${ownerId}`).slice(0, 16)}`;
  const isHidden = (r: CellRow) => {
    if (r.owner_id === viewerId) return false;
    const o = owners.get(r.owner_id);
    if (!o || o.privacy_radius_m === null || o.privacy_lat === null || o.privacy_lng === null) return false;
    return inZone({ center: { lat: o.privacy_lat, lng: o.privacy_lng }, radiusM: o.privacy_radius_m }, cellCenter(r.id));
  };

  const shown = inBox.map((r) => ({ r, hidden: isHidden(r) }));
  const key = (x: { r: CellRow; hidden: boolean }) => (x.hidden ? hiddenId(x.r.owner_id) : x.r.owner_id);
  // Renk komşuluk grafı (aynı sahibin gizli ve açık petekleri aynı imza rengini paylaşır).
  const ownerOfCell = new Map(shown.map((x) => [x.r.id, key(x)]));
  const realOf = new Map(shown.map((x) => [key(x), x.r.owner_id]));
  const edges: Array<[string, string]> = [];
  const seenEdge = new Set<string>();
  for (const [id, k] of ownerOfCell) {
    for (const n of neighbors(id)) {
      const k2 = ownerOfCell.get(n);
      if (!k2 || k2 === k) continue;
      const e = k < k2 ? `${k}|${k2}` : `${k2}|${k}`;
      if (seenEdge.has(e)) continue;
      seenEdge.add(e);
      edges.push([k, k2]);
    }
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
      const big = components(ids)[0]!;
      const pts = big.map(cellCenter);
      marker = { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
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
  const ids = await regionCells(d.db, cellId, ownerId);
  const owner = (await loadPublicPlayers(d.db, [ownerId])).get(ownerId)!;
  const priv = (await d.db.query<{ privacy_lat: number | null; privacy_lng: number | null; privacy_radius_m: number | null }>('SELECT privacy_lat, privacy_lng, privacy_radius_m FROM users WHERE id = $1', [ownerId])).rows[0]!;
  const hidden =
    ownerId !== viewerId &&
    priv.privacy_radius_m !== null &&
    inZone({ center: { lat: priv.privacy_lat!, lng: priv.privacy_lng! }, radiusM: priv.privacy_radius_m }, cellCenter(cellId));
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
  const names = await loadPublicPlayers(d.db, hist.flatMap((h) => [h.actor_id, h.from_id].filter((x): x is string => !!x)));
  const nm = (id: string | null) => (id ? names.get(id)?.displayName ?? 'Bir oyuncu' : 'Bir oyuncu');
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
