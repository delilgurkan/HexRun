import { describe, expect, it } from 'vitest';
import {
  bfsTake,
  cellOf,
  cellsAreaM2,
  cellsInPolygon,
  circleTrack,
  components,
  destination,
  haversineM,
  isConnected,
  isGameCell,
  leagueRegionOf,
  neighbors,
  outline,
  pathLengthM,
  polygonAreaM2,
  cellBoundary,
  cellCenter,
} from '../src/index.js';
import { MODA, disk } from './helpers.js';

describe('geo', () => {
  it('haversine ~ bilinen mesafe (Kadıköy–Üsküdar ≈ 4,3 km)', () => {
    const d = haversineM({ lat: 40.9903, lng: 29.0295 }, { lat: 41.0256, lng: 29.0157 });
    expect(d).toBeGreaterThan(3900);
    expect(d).toBeLessThan(4300);
  });
  it('destination ve haversine tutarlı', () => {
    for (const b of [0, 45, 90, 180, 270, 333]) {
      const p = destination(MODA, b, 750);
      expect(haversineM(MODA, p)).toBeCloseTo(750, 0);
    }
  });
  it('poligon alanı: 100 m yarıçaplı daire ≈ π·100²', () => {
    const ring = circleTrack(MODA, 100, 120, 0, 3);
    expect(polygonAreaM2(ring)).toBeGreaterThan(31_000);
    expect(polygonAreaM2(ring)).toBeLessThan(31_500);
    expect(pathLengthM(ring)).toBeCloseTo(2 * Math.PI * 100, -1);
    expect(polygonAreaM2(ring.slice(0, 2))).toBe(0);
  });
});

describe('petekler (H3 res 12)', () => {
  it('petek ≈ 300 m²', () => {
    const c = cellOf(MODA);
    expect(isGameCell(c)).toBe(true);
    expect(isGameCell('nope')).toBe(false);
    expect(cellsAreaM2([c])).toBeGreaterThan(250);
    expect(cellsAreaM2([c])).toBeLessThan(360);
    expect(cellBoundary(c)).toHaveLength(6);
    expect(haversineM(cellCenter(c), MODA)).toBeLessThan(20);
  });
  it('daire içindeki petek sayısı alanla uyumlu', () => {
    const ring = circleTrack(MODA, 150, 180, 0, 3);
    const cells = cellsInPolygon(ring);
    const area = cellsAreaM2(cells);
    expect(Math.abs(area - Math.PI * 150 ** 2) / (Math.PI * 150 ** 2)).toBeLessThan(0.1);
    expect(cellsInPolygon(ring.slice(0, 2))).toEqual([]);
  });
  it('komşuluk, bağlılık, bileşenler', () => {
    const d = disk(2);
    expect(d).toHaveLength(19);
    expect(isConnected(d)).toBe(true);
    expect(neighbors(d[0]!)).toHaveLength(6);
    const far = disk(1, destination(MODA, 90, 2000));
    expect(isConnected([...d, ...far])).toBe(false);
    const comps = components([...d, ...far]);
    expect(comps.map((c) => c.length)).toEqual([19, 7]);
    expect(isConnected([])).toBe(true);
  });
  it('bfsTake her zaman bağlı ve sınırlı', () => {
    const d = disk(5);
    const t = bfsTake(d, 60);
    expect(t).toHaveLength(60);
    expect(isConnected(t)).toBe(true);
    expect(bfsTake([], 10)).toEqual([]);
  });
  it('dış sınır ve lig bölgesi', () => {
    const d = disk(2);
    const o = outline(d);
    expect(o.length).toBeGreaterThan(6);
    expect(outline([])).toEqual([]);
    expect(leagueRegionOf(d[0]!)).toMatch(/^86/);
  });
});
