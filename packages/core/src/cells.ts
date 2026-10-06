import {
  cellArea,
  cellToBoundary,
  cellToLatLng,
  cellToParent,
  cellsToMultiPolygon,
  gridDisk,
  isValidCell,
  latLngToCell,
  polygonToCells,
  getResolution,
  UNITS,
} from 'h3-js';
import { RULES } from './constants.js';
import type { LatLng } from './geo.js';

export type CellId = string;

export function cellOf(p: LatLng, res: number = RULES.H3_RES): CellId {
  return latLngToCell(p.lat, p.lng, res);
}

export function isGameCell(id: string): boolean {
  return typeof id === 'string' && isValidCell(id) && getResolution(id) === RULES.H3_RES;
}

/** Poligonun (kapalı halka) içindeki petekler: merkezi poligonun içinde olan hücreler. */
export function cellsInPolygon(ring: readonly LatLng[], res: number = RULES.H3_RES): CellId[] {
  if (ring.length < 3) return [];
  const coords = ring.map((p) => [p.lat, p.lng] as [number, number]);
  return polygonToCells(coords, res);
}

export function cellAreaM2(id: CellId): number {
  return cellArea(id, UNITS.m2);
}

export function cellsAreaM2(ids: Iterable<CellId>): number {
  let a = 0;
  for (const id of ids) a += cellAreaM2(id);
  return a;
}

export function cellCenter(id: CellId): LatLng {
  const [lat, lng] = cellToLatLng(id);
  return { lat, lng };
}

export function cellBoundary(id: CellId): LatLng[] {
  return cellToBoundary(id).map(([lat, lng]) => ({ lat, lng }));
}

export function neighbors(id: CellId): CellId[] {
  return gridDisk(id, 1).filter((c) => c !== id);
}

/** Petek kümesi tek parça mı (kenar komşuluğu)? */
export function isConnected(ids: readonly CellId[]): boolean {
  if (ids.length <= 1) return true;
  return largestComponent(ids).length === new Set(ids).size;
}

/** Bağlı bileşenler, büyükten küçüğe. */
export function components(ids: readonly CellId[]): CellId[][] {
  const set = new Set(ids);
  const seen = new Set<CellId>();
  const out: CellId[][] = [];
  for (const start of [...set].sort()) {
    if (seen.has(start)) continue;
    const comp: CellId[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      for (const n of neighbors(c)) {
        if (set.has(n) && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    out.push(comp.sort());
  }
  return out.sort((a, b) => b.length - a.length || (a[0]! < b[0]! ? -1 : 1));
}

export function largestComponent(ids: readonly CellId[]): CellId[] {
  return components(ids)[0] ?? [];
}

/** Petek kümesinin dış sınırı (en büyük parçanın dış halkası) — düello rotası için. */
export function outline(ids: readonly CellId[]): LatLng[] {
  if (ids.length === 0) return [];
  const mp = cellsToMultiPolygon([...ids], true);
  let best: number[][] = [];
  for (const poly of mp) {
    const outer = poly[0] ?? [];
    if (outer.length > best.length) best = outer;
  }
  // GeoJSON sırası [lng, lat]
  return best.map(([lng, lat]) => ({ lat: lat!, lng: lng! }));
}

/** Lig bölgesi: res-6 ebeveyn (≈36 km²). */
export function leagueRegionOf(id: CellId): string {
  return cellToParent(id, 6);
}

/** Bir kümeden en çok `max` peteği bağlı kalacak şekilde (BFS sırasıyla) seçer. */
export function bfsTake(ids: readonly CellId[], max: number): CellId[] {
  const set = new Set(ids);
  if (!set.size) return [];
  const start = [...set].sort()[0]!;
  const out: CellId[] = [start];
  const seen = new Set([start]);
  for (let i = 0; i < out.length && out.length < max; i++) {
    for (const n of neighbors(out[i]!).sort()) {
      if (set.has(n) && !seen.has(n)) {
        seen.add(n);
        out.push(n);
        if (out.length >= max) break;
      }
    }
  }
  return out.sort();
}
