import { describe, expect, it } from 'vitest';
import { LoopTracker, circleTrack, destination, detectLoops, loopCells, trackStats, type TrackPoint } from '../src/index.js';
import { MODA } from './helpers.js';

const t0 = Date.parse('2026-10-05T07:00:00Z');

describe('halka dedektörü', () => {
  it('tam bir tur başlangıca dönünce kapanır', () => {
    const pts = circleTrack(MODA, 200, 200, t0, 3.2);
    const loops = detectLoops(pts);
    expect(loops).toHaveLength(1);
    const l = loops[0]!;
    expect(l.lengthM).toBeGreaterThan(1200);
    expect(l.areaM2).toBeGreaterThan(115_000);
    expect(loopCells(l).length).toBeGreaterThan(350);
  });

  it('iki tur = iki halka (her dönüş yeni halka)', () => {
    const a = circleTrack(MODA, 150, 150, t0, 3);
    const last = a[a.length - 1]!;
    const b = circleTrack(MODA, 150, 150, last.t + 1000, 3).slice(1);
    const loops = detectLoops([...a, ...b]);
    expect(loops).toHaveLength(2);
    expect(loops[1]!.index).toBe(2);
  });

  it('başlangıca dönmeyen koşu halka değildir', () => {
    const pts: TrackPoint[] = [];
    for (let i = 0; i < 300; i++) pts.push({ ...destination(MODA, 45, i * 10), t: t0 + i * 3000, acc: 5 });
    expect(detectLoops(pts)).toHaveLength(0);
  });

  it('başlangıçta oyalanmak halka kapatmaz (histerezis)', () => {
    const pts: TrackPoint[] = [];
    for (let i = 0; i < 200; i++) pts.push({ ...destination(MODA, (i * 37) % 360, 30 + (i % 20)), t: t0 + i * 5000, acc: 5 });
    expect(detectLoops(pts)).toHaveLength(0);
  });

  it('yakalama yarıçapı: 55 m kala 50 m ile kapanmaz, 60 m (Halka Ustası) ile kapanır', () => {
    const pts = circleTrack(MODA, 200, 200, t0, 3).slice(0, -1);
    // Son noktayı başlangıcın 55 m doğusuna koy
    const s = pts[0]!;
    const kept = pts.slice(0, -16);
    const end = { ...destination(s, 90, 55), t: kept[kept.length - 1]!.t + 40_000, acc: 5 };
    const track = [...kept, end];
    expect(detectLoops(track, { closeRadiusM: 50 })).toHaveLength(0);
    expect(detectLoops(track, { closeRadiusM: 60 })).toHaveLength(1);
  });

  it('kısa halka asgari çevrenin altında sayılmaz, çaylak sınırıyla sayılır', () => {
    const pts = circleTrack(MODA, 45, 60, t0, 3); // çevre ≈ 283 m, uzaklaşma 90 m
    // 90 m'ye uzaklaşmak (> 50 + 50) gerekir: yarıçap 52 → çap 104
    const big = circleTrack(MODA, 52, 60, t0, 3);
    expect(detectLoops(pts, { minLoopLengthM: 400 })).toHaveLength(0);
    expect(detectLoops(big, { minLoopLengthM: 400 })).toHaveLength(0);
    expect(detectLoops(big, { minLoopLengthM: 200 })).toHaveLength(1);
  });

  it('kötü doğruluk ve GPS sıçraması yok sayılır', () => {
    const pts = circleTrack(MODA, 200, 200, t0, 3);
    const noisy: TrackPoint[] = [];
    pts.forEach((p, i) => {
      noisy.push(p);
      if (i === 50) noisy.push({ ...destination(p, 0, 5000), t: p.t + 500, acc: 5 });
      if (i === 80) noisy.push({ ...p, t: p.t + 400, acc: 120 });
      if (i === 90) noisy.push({ ...p, t: p.t }); // aynı zaman damgası
      if (i === 91) noisy.push({ lat: NaN, lng: 1, t: p.t + 1 });
    });
    const tr = new LoopTracker();
    let closed = 0;
    for (const p of noisy) if (tr.push(p)) closed++;
    expect(closed).toBe(1);
    expect(tr.state().distanceM).toBeLessThan(1400);
  });

  it('HUD durumu: mesafe, tempo, kapanış modu, önizleme', () => {
    const pts = circleTrack(MODA, 300, 300, t0, 3.1);
    const tr = new LoopTracker();
    const empty = tr.state();
    expect(empty.paceSecPerKm).toBeNull();
    expect(tr.previewRing()).toEqual([]);
    let sawClosing = false;
    for (const p of pts.slice(0, -12)) {
      tr.push(p);
      if (tr.state().closingMode) sawClosing = true;
    }
    expect(sawClosing).toBe(true);
    const st = tr.state();
    expect(st.armed).toBe(true);
    expect(st.paceSecPerKm).toBeGreaterThan(300);
    expect(st.paceSecPerKm).toBeLessThan(345);
    expect(tr.previewRing().length).toBeGreaterThan(10);
    expect(tr.points().length).toBe(pts.length - 12);
  });

  it('duraklatma: arada geçen yol ve süre sayılmaz', () => {
    const pts = circleTrack(MODA, 200, 200, t0, 3);
    const tr = new LoopTracker();
    pts.slice(0, 50).forEach((p) => tr.push(p));
    const d1 = tr.state().distanceM;
    tr.pause();
    pts.slice(50, 100).forEach((p) => tr.push(p));
    expect(tr.state().distanceM).toBe(d1);
    tr.resume();
    // devam: çok ileriden ve geç gelen nokta sıçrama sayılmaz
    pts.slice(100).forEach((p) => tr.push({ ...p, t: p.t + 600_000 }));
    const st = tr.state();
    expect(st.distanceM).toBeLessThan(pathLen(pts) - 300);
    expect(st.loops).toHaveLength(1);
  });

  it('trackStats', () => {
    const pts = circleTrack(MODA, 100, 100, t0, 3);
    const s = trackStats(pts);
    expect(s.distanceM).toBeCloseTo(2 * Math.PI * 100, -1);
    expect(s.paceSecPerKm).toBeCloseTo(1000 / 3, -1);
  });
});

function pathLen(p: TrackPoint[]) {
  return trackStats(p).distanceM;
}
