import type { MapCell } from '@hexrun/contracts';
import { cellBoundary, destination, type LatLng } from '@hexrun/core';
import type { Slot } from '@hexrun/core';

export type Position = [number, number];

export interface CellProps {
  id: string;
  fill: string;
  owner: string | null;
  mine: boolean;
  siege: boolean;
  attacking: boolean;
  power: number;
  hidden: boolean;
}

export function cellPolygon(id: string): Position[] {
  const b = cellBoundary(id).map((p) => [p.lng, p.lat] as Position);
  if (b.length) b.push(b[0]!);
  return b;
}

/** Petekleri GeoJSON çokgen koleksiyonuna çevirir; renk görüntüleyene göre (slot). */
export function cellsToGeoJSON(
  cells: readonly MapCell[],
  color: (slot: Slot) => string,
  myId: string | null,
  emptyColor = 'transparent',
): GeoJSON.FeatureCollection<GeoJSON.Polygon, CellProps> {
  return {
    type: 'FeatureCollection',
    features: cells.map((c) => ({
      type: 'Feature',
      id: c.id,
      geometry: { type: 'Polygon', coordinates: [cellPolygon(c.id)] },
      properties: {
        id: c.id,
        fill: c.slot ? color(c.slot) : emptyColor,
        owner: c.ownerId,
        mine: !!myId && c.ownerId === myId,
        siege: c.duel === 'defending',
        attacking: c.duel === 'attacking',
        power: c.power,
        hidden: !!c.ownerId && c.ownerId.startsWith('hidden:'),
      },
    })),
  };
}

export function idsToGeoJSON(ids: Iterable<string>, props: Record<string, string | number | boolean> = {}): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features: [...ids].map((id) => ({ type: 'Feature', id, geometry: { type: 'Polygon', coordinates: [cellPolygon(id)] }, properties: { id, ...props } })),
  };
}

export function lineToGeoJSON(points: readonly LatLng[]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) }, properties: {} };
}

export function polygonToGeoJSON(points: readonly LatLng[]): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring = points.map((p) => [p.lng, p.lat] as Position);
  if (ring.length && (ring[0]![0] !== ring[ring.length - 1]![0] || ring[0]![1] !== ring[ring.length - 1]![1])) ring.push(ring[0]!);
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} };
}

/** Başlangıçtaki yakalama halkası (daire çokgeni). */
export function circle(center: LatLng, radiusM: number, steps = 48): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i <= steps; i++) out.push(destination(center, (360 * i) / steps, radiusM));
  return out;
}

/** Başlangıç üçgeni (oryantiring). */
export function triangle(center: LatLng, sizeM = 14): LatLng[] {
  return [0, 120, 240, 0].map((b) => destination(center, b, sizeM));
}

export function boundsOf(points: readonly LatLng[]): [number, number, number, number] | null {
  if (!points.length) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [w, s, e, n];
}

export const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
