/**
 * Ortak test vektörleri: TypeScript motorunun çıktıları JSON olarak yazılır; Swift (iOS)
 * ve Kotlin (Android) testleri aynı dosyaları okuyup birebir aynı sonucu verdiğini kanıtlar.
 * Kullanım: npx tsx scripts/vectors.ts  → shared/test-vectors/*.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LoopTracker,
  activeEvents,
  assignDisplayColors,
  cellBoundary,
  cellOf,
  cellsInPolygon,
  circleTrack,
  destination,
  eventWindow,
  fmtArea,
  fmtDuration,
  fmtInt,
  fmtKm,
  fmtPace,
  hatSegments,
  haversineM,
  initials,
  polygonAreaM2,
  type LoopOptions,
  type TrackPoint,
} from '../src/index.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'shared', 'test-vectors');
mkdirSync(out, { recursive: true });
const write = (name: string, data: unknown) => writeFileSync(join(out, name), JSON.stringify(data, null, 1) + '\n');
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

const MODA = { lat: 40.9819, lng: 29.0254 };
const T0 = Date.parse('2026-10-05T04:00:00Z');

/* Halka takibi */
function line(start: { lat: number; lng: number }, bearing: number, len: number, t0: number, v: number): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (let m = 0; m <= len; m += 8) pts.push({ ...destination(start, bearing, m), t: t0 + Math.round((m / v) * 1000), acc: 5 });
  return pts;
}
const circle = circleTrack(MODA, 200, 180, T0, 3.2);
const lap2 = [...circleTrack(MODA, 150, 140, T0, 3), ...circleTrack(MODA, 150, 140, T0 + 400_000, 3).slice(1)];
const kept = circleTrack(MODA, 200, 180, T0, 3).slice(0, -16);
const near55 = [...kept, { ...destination(kept[0]!, 90, 55), t: kept[kept.length - 1]!.t + 40_000, acc: 5 }];
const noisy = circleTrack(MODA, 200, 180, T0, 3).flatMap((p, i): TrackPoint[] =>
  i === 40 ? [p, { ...destination(p, 0, 5000), t: p.t + 500, acc: 5 }] : i === 70 ? [p, { ...p, t: p.t + 300, acc: 120 }] : i === 90 ? [p, { ...p }] : [p],
);
const loiter: TrackPoint[] = Array.from({ length: 120 }, (_, i) => ({ ...destination(MODA, (i * 37) % 360, 30 + (i % 20)), t: T0 + i * 5000, acc: 5 }));

const cases: Array<{ name: string; options: LoopOptions; points: TrackPoint[]; pauseAt?: number; resumeAt?: number }> = [
  { name: 'circle-200m', options: {}, points: circle },
  { name: 'two-laps', options: {}, points: lap2 },
  { name: 'straight-no-return', options: {}, points: line(MODA, 45, 2000, T0, 3) },
  { name: 'loiter-at-start', options: {}, points: loiter },
  { name: 'end-55m-radius-50', options: { closeRadiusM: 50 }, points: near55 },
  { name: 'end-55m-radius-60', options: { closeRadiusM: 60 }, points: near55 },
  { name: 'short-loop-newbie', options: { minLoopLengthM: 200 }, points: circleTrack(MODA, 52, 60, T0, 3) },
  { name: 'short-loop-normal', options: { minLoopLengthM: 400 }, points: circleTrack(MODA, 52, 60, T0, 3) },
  { name: 'noisy-gps', options: {}, points: noisy },
  { name: 'pause-resume', options: {}, points: circleTrack(MODA, 200, 180, T0, 3).map((p, i) => (i >= 100 ? { ...p, t: p.t + 600_000 } : p)), pauseAt: 50, resumeAt: 100 },
];

write(
  'loops.json',
  cases.map((c) => {
    const tr = new LoopTracker(c.options);
    const samples: unknown[] = [];
    const closedAtIndex: number[] = [];
    c.points.forEach((p, i) => {
      if (c.pauseAt === i) tr.pause();
      if (c.resumeAt === i) tr.resume();
      const l = tr.push(p);
      if (l) closedAtIndex.push(i);
      if (i % 10 === 0 || l || i === c.points.length - 1) {
        const s = tr.state();
        samples.push({ i, distanceM: r6(s.distanceM), durationMs: s.durationMs, distToStartM: r6(s.distToStartM), armed: s.armed, closingMode: s.closingMode, paceSecPerKm: s.paceSecPerKm === null ? null : r6(s.paceSecPerKm), loops: s.loops.length });
      }
    });
    const st = tr.state();
    return {
      name: c.name,
      options: c.options,
      pauseAt: c.pauseAt ?? null,
      resumeAt: c.resumeAt ?? null,
      points: c.points.map((p) => ({ lat: r6(p.lat) === p.lat ? p.lat : p.lat, lng: p.lng, t: p.t, ...(p.acc !== undefined ? { acc: p.acc } : {}) })),
      expected: {
        closedAtIndex,
        loops: st.loops.map((l) => ({ index: l.index, lengthM: r6(l.lengthM), areaM2: r6(l.areaM2), closedAt: l.closedAt, startedAt: l.startedAt, ringSize: l.ring.length })),
        samples,
      },
    };
  }),
);

/* Geometri */
const pairs = [
  [MODA, { lat: 41.0256, lng: 29.0157 }],
  [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }],
  [{ lat: 40.99, lng: 29.03 }, { lat: 40.9901, lng: 29.0301 }],
] as const;
write('geo.json', {
  haversine: pairs.map(([a, b]) => ({ a, b, m: r6(haversineM(a, b)) })),
  destination: [0, 90, 200, 333].map((bearing) => ({ from: MODA, bearing, distM: 750, to: destination(MODA, bearing, 750) })),
  polygonArea: [{ ring: circleTrack(MODA, 100, 60, 0, 3).map(({ lat, lng }) => ({ lat, lng })), m2: r6(polygonAreaM2(circleTrack(MODA, 100, 60, 0, 3))) }],
});

/* H3 petekleri (kütüphaneler arası eşlik) */
const pts = [MODA, { lat: 41.0422, lng: 29.0083 }, { lat: 39.92, lng: 32.85 }, { lat: -33.86, lng: 151.21 }];
const ring = circleTrack(MODA, 120, 48, 0, 3).map(({ lat, lng }) => ({ lat, lng }));
write('cells.json', {
  cellOf: pts.map((p) => ({ p, res: 12, cell: cellOf(p) })),
  boundary: pts.slice(0, 2).map((p) => ({ cell: cellOf(p), boundary: cellBoundary(cellOf(p)) })),
  polygon: { ring, res: 12, cells: cellsInPolygon(ring).sort() },
});

/* Biçimlendirme */
write('format.json', {
  km: [[6120, 2, fmtKm(6120)], [8400, 1, fmtKm(8400, 1)], [0, 2, fmtKm(0)], [42195, 1, fmtKm(42195, 1)], [999, 2, fmtKm(999)]],
  pace: [323, 300, 59.6, 0, null, 3599].map((s) => [s, fmtPace(s)]),
  duration: [1_977_000, 2_713_000, 3_723_000, 0, -5, 59_999, 36_000_000].map((ms) => [ms, fmtDuration(ms)]),
  int: [19220, 0, 999, 1000, 1234567, 20460.4].map((n) => [n, fmtInt(n)]),
  area: [19220, 300].map((n) => [n, fmtArea(n)]),
  initials: ['Deniz Arslan', 'emre şahin', 'Zeynep', '  ', 'ışıl ıraz', 'Ali Veli Can'].map((n) => [n, initials(n)]),
});

/* Etkinlikler (Europe/Istanbul) */
const times = ['2026-10-05T02:59:00Z', '2026-10-05T03:00:00Z', '2026-10-05T05:59:00Z', '2026-10-05T06:00:00Z', '2026-10-05T15:00:00Z', '2026-10-05T17:59:00Z', '2026-10-05T18:00:00Z', '2026-10-10T04:00:00Z', '2026-10-11T20:59:00Z', '2026-10-11T21:00:00Z', '2026-10-09T20:00:00Z'];
write('events.json', {
  active: times.map((t) => ({ t, active: activeEvents(Date.parse(t)).map((e) => e.id) })),
  windows: times.flatMap((t) => (['morning', 'blitz', 'evening'] as const).map((id) => ({ t, id, ...eventWindow(id, Date.parse(t)) }))),
});

/* Hat */
write('hat.json', [
  [85, 20, 0],
  [85, 60, 0],
  [85, 80, 0],
  [72, 0, 81],
  [70, 50, 0],
  [0, 0, 0],
  [100, 100, 100],
  [33.3, 7.5, 40],
].map(([p, s, g]) => ({ power: p, progress: s, ghost: g, segments: hatSegments(p!, s!, g!) })));

/* Renk kuralı */
const nodes = [
  { id: 'me', slot: 'keh' as const },
  { id: 'n1', slot: 'keh' as const },
  { id: 'n2', slot: 'mer' as const },
  { id: 'n3', slot: 'zum' as const },
  { id: 'n4', slot: 'gul' as const },
  { id: 'far', slot: 'keh' as const },
];
const edges: Array<[string, string]> = [['me', 'n1'], ['me', 'n2'], ['n1', 'n2'], ['n3', 'n4'], ['n2', 'n3']];
write('colors.json', [
  { viewer: 'me', nodes, edges, result: Object.fromEntries(assignDisplayColors('me', nodes, edges)) },
  { viewer: null, nodes, edges, result: Object.fromEntries(assignDisplayColors(null, nodes, edges)) },
]);
console.log(`yazıldı: ${out}`);
