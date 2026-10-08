import { describe, expect, it } from 'vitest';
import {
  BADGES,
  EMPTY_STATS,
  EVENTS,
  HIDDEN_PLAYER_NAME,
  PALETTE,
  RULES,
  SLOTS,
  SLOT_INSIGNIA,
  activeEvents,
  addDays,
  assignDisplayColors,
  bump,
  cellInZone,
  clampRadius,
  clash,
  computeStreak,
  counterValue,
  dayKey,
  daysBetween,
  earnedBadges,
  eventMultiplier,
  eventWindow,
  fmtArea,
  fmtDuration,
  fmtInt,
  fmtKm,
  fmtPace,
  importDecision,
  initials,
  inZone,
  isSameRun,
  isSlot,
  isSlotInsignia,
  localTime,
  makeZone,
  nearestBadges,
  reviewTrack,
  streakFreezesPerMonth,
  circleTrack,
  destination,
  haversineM,
  cellOf,
  type TrackPoint,
} from '../src/index.js';
import { MODA, at } from './helpers.js';

describe('saat ve etkinlikler (Europe/Istanbul)', () => {
  it('yerel saat', () => {
    const lt = localTime(at(0, 6, 30));
    expect(lt).toMatchObject({ day: '2026-10-05', hour: 6, minute: 30, weekday: 1 });
    expect(dayKey(at(0, 23, 59))).toBe('2026-10-05');
    expect(dayKey(at(1, 0, 0))).toBe('2026-10-06');
    expect(daysBetween('2026-10-05', '2026-10-12')).toBe(7);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
  it('gün sayacı', () => {
    expect(counterValue(null, 'x')).toBe(0);
    const c = bump(bump(null, 'a'), 'a');
    expect(c).toEqual({ day: 'a', count: 2 });
    expect(bump(c, 'b')).toEqual({ day: 'b', count: 1 });
  });
  it('Sabah 06–09, Akşam 18–21, Blitz Cmt–Paz', () => {
    expect(activeEvents(at(0, 5, 59))).toEqual([]);
    expect(activeEvents(at(0, 6)).map((e) => e.id)).toEqual(['morning']);
    expect(activeEvents(at(0, 9)).map((e) => e.id)).toEqual([]);
    expect(activeEvents(at(0, 18)).map((e) => e.id)).toEqual(['evening']);
    expect(activeEvents(at(0, 21)).map((e) => e.id)).toEqual([]);
    expect(activeEvents(at(5, 7)).map((e) => e.id)).toEqual(['morning', 'blitz']);
    expect(activeEvents(at(6, 23)).map((e) => e.id)).toEqual(['blitz']);
    expect(eventMultiplier('gain', at(0, 7))).toBe(2);
    expect(eventMultiplier('attack', at(0, 7))).toBe(1);
    expect(eventMultiplier('pushback', at(0, 19))).toBe(1.5);
    expect(Object.keys(EVENTS)).toHaveLength(3);
  });
  it('etkinlik penceresi sayaçları', () => {
    expect(eventWindow('morning', at(0, 7, 48))).toEqual({ active: true, endsInMin: 72, startsInMin: 0 });
    expect(eventWindow('evening', at(0, 17))).toMatchObject({ active: false, startsInMin: 60 });
    expect(eventWindow('blitz', at(4, 23))).toMatchObject({ active: false, startsInMin: 60 });
  });
});

describe('hile kontrolü', () => {
  const t0 = at(0, 7);
  it('normal koşu temiz', () => {
    expect(reviewTrack(circleTrack(MODA, 300, 300, t0, 3.2))).toEqual({ status: 'ok', findings: [] });
  });
  it('araç hızında bölüm incelemeye düşer (2\'05"/km · 1,2 km)', () => {
    const pts: TrackPoint[] = [];
    let t = t0;
    let p = { ...MODA };
    for (let i = 0; i < 100; i++) {
      const v = i >= 30 && i < 70 ? 8 : 3; // 8 m/s = 2'05"/km
      p = destination(p, 90, v * 5);
      t += 5000;
      pts.push({ ...p, t, acc: 5 });
    }
    const r = reviewTrack(pts);
    expect(r.status).toBe('review');
    const f = r.findings.find((x) => x.reason === 'pace_too_fast')!;
    expect(f.paceSecPerKm).toBeLessThan(150);
    expect(f.segmentM).toBeGreaterThan(1000);
  });
  it('ışınlanma, GPS boşluğu, zaman hatası, az nokta', () => {
    const base = circleTrack(MODA, 300, 300, t0, 3);
    const tele = [...base];
    tele.splice(100, 0, { ...destination(base[99]!, 0, 2000), t: base[99]!.t + 1000 });
    tele.splice(101, 0, { ...base[100]!, t: base[99]!.t + 2000 });
    const r = reviewTrack(tele.map((p, i) => (i > 101 ? p : p)));
    expect(r.findings.map((f) => f.reason)).toContain('teleport');
    const gap = base.filter((_, i) => i < 100 || i > 180).map((p, i) => (i >= 100 ? { ...p, t: p.t + 200_000 } : p));
    expect(reviewTrack(gap).findings.map((f) => f.reason)).toContain('sparse_gps');
    const bad = [...base];
    bad[50] = { ...bad[50]!, t: bad[49]!.t };
    expect(reviewTrack(bad).findings[0]!.reason).toBe('non_monotonic_time');
    expect(reviewTrack(base.slice(0, 5)).findings[0]!.reason).toBe('too_few_points');
  });
});

describe('renk kuralı', () => {
  it('palet: 8 slot, 4 yasaklı çift', () => {
    expect(SLOTS).toHaveLength(8);
    expect(Object.keys(PALETTE)).toHaveLength(8);
    expect(clash('zum', 'gul')).toBe(true);
    expect(clash('gul', 'zum')).toBe(true);
    expect(clash('keh', 'keh')).toBe(true);
    expect(clash('keh', 'gok')).toBe(false);
    expect(isSlot('keh')).toBe(true);
    expect(isSlot('xyz')).toBe(false);
  });
  it('görüntüleyen kendini hep kendi renginde görür; komşu çakışması kayar', () => {
    const nodes = [
      { id: 'me', slot: 'keh' as const },
      { id: 'n1', slot: 'keh' as const },
      { id: 'n2', slot: 'mer' as const },
      { id: 'far', slot: 'keh' as const },
    ];
    const m = assignDisplayColors('me', nodes, [
      ['me', 'n1'],
      ['me', 'n2'],
      ['n1', 'n2'],
      ['me', 'me'],
      ['me', 'ghost'],
    ]);
    expect(m.get('me')).toBe('keh');
    expect(m.get('far')).toBe('keh');
    expect(clash(m.get('n1')!, 'keh')).toBe(false);
    expect(clash(m.get('n2')!, 'keh')).toBe(false);
    expect(clash(m.get('n1')!, m.get('n2')!)).toBe(false);
    // Deterministik
    expect([...assignDisplayColors('me', nodes, [['me', 'n1'], ['me', 'n2'], ['n1', 'n2']])]).toEqual([
      ...assignDisplayColors('me', nodes, [['me', 'n1'], ['me', 'n2'], ['n1', 'n2']]),
    ]);
  });
  it('görüntüleyensiz ve aşırı yoğun grafik (K9) çökmez', () => {
    const nodes = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, slot: SLOTS[i % 8]! }));
    const edges: Array<[string, string]> = [];
    for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) edges.push([`p${i}`, `p${j}`]);
    const m = assignDisplayColors(null, nodes, edges);
    expect(m.size).toBe(9);
  });
});

describe('rozetler ve nişanlar', () => {
  it('40 rozet, benzersiz kimlik', () => {
    expect(BADGES).toHaveLength(40);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(40);
    expect(SLOT_INSIGNIA).toEqual(['halka-ustasi', 'oncu', 'toprak-50k', 'geri-alan', 'ilk-kalkan', 'sur', 'kale-bekcisi', 'safak-akincisi']);
    expect(isSlotInsignia('sur')).toBe(true);
    expect(isSlotInsignia('seri-7')).toBe(false);
  });
  it('kazanılan ve en yakın rozetler', () => {
    expect(earnedBadges(EMPTY_STATS)).toEqual([]);
    const s = { ...EMPTY_STATS, loopsClosed: 12, inTeam: true, bestStreakDays: 8, daysSinceSignup: 20 };
    const e = earnedBadges(s);
    expect(e).toEqual(expect.arrayContaining(['ilk-halka', 'halka-ustasi', 'takim-oyuncusu', 'seri-7', 'caylak-mezunu']));
    const near = nearestBadges(EMPTY_STATS, new Set(), 3);
    expect(near).toHaveLength(3);
    const near2 = nearestBadges({ ...EMPTY_STATS, earlyRuns: 9 }, new Set(), 1);
    expect(near2[0]!.badge.id).toBe('erken-kus');
  });
  it('seri dondurma hakkı', () => {
    expect(streakFreezesPerMonth(new Set())).toBe(0);
    expect(streakFreezesPerMonth(new Set(['seri-7']))).toBe(1);
    expect(streakFreezesPerMonth(new Set(['seri-7', 'seri-30']))).toBe(2);
  });
});

describe('seri', () => {
  it('art arda günler', () => {
    expect(computeStreak([], '2026-10-05', 0)).toEqual({ current: 0, best: 0, frozenDays: [] });
    const r = computeStreak(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], '2026-10-05', 0);
    expect(r.current).toBe(1);
    expect(r.best).toBe(3);
  });
  it('dondurma kaçırılan günü affeder', () => {
    const r = computeStreak(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05'], '2026-10-05', 1);
    expect(r.current).toBe(4);
    expect(r.frozenDays).toEqual(['2026-10-03']);
    const r2 = computeStreak(['2026-10-01', '2026-10-03', '2026-10-05'], '2026-10-05', 1);
    expect(r2.current).toBe(1); // ayda tek hak: ikinci boşluk seriyi bozar
  });
  it('dün koşulduysa seri sürer; daha eskiyse biter', () => {
    expect(computeStreak(['2026-10-03', '2026-10-04'], '2026-10-05', 0).current).toBe(2);
    expect(computeStreak(['2026-10-02', '2026-10-03'], '2026-10-05', 0).current).toBe(0);
    expect(computeStreak(['2026-10-02', '2026-10-03'], '2026-10-05', 1).current).toBe(2);
    expect(computeStreak(['2026-10-06'], '2026-10-05', 0).current).toBe(0);
  });
});

describe('gizlilik', () => {
  it('yarıçap 200–800 m', () => {
    expect(clampRadius(50)).toBe(200);
    expect(clampRadius(5000)).toBe(800);
    expect(clampRadius(NaN)).toBe(200);
    expect(clampRadius(412.4)).toBe(412);
  });
  it('kaydırılmış daire evi içerir ama merkezi ev değildir', () => {
    let i = 0;
    const seq = [0.81, 0.3];
    const z = makeZone(MODA, 400, () => seq[i++ % 2]!);
    expect(inZone(z, MODA)).toBe(true);
    expect(haversineM(z.center, MODA)).toBeGreaterThan(100);
    expect(cellInZone(z, cellOf(MODA))).toBe(true);
    expect(inZone(z, destination(MODA, 0, 2000))).toBe(false);
    expect(HIDDEN_PLAYER_NAME).toBe('Gizli oyuncu');
    expect(inZone(makeZone(MODA, 300), MODA)).toBe(true);
  });
});

describe('içe aktarma', () => {
  const run = { startedAt: at(0, 7), endedAt: at(0, 8), distanceM: 10_000 };
  it('aynı koşu iki kaynaktan bir kez sayılır', () => {
    expect(isSameRun(run, { startedAt: at(0, 7, 1), endedAt: at(0, 8, 1), distanceM: 10_100 })).toBe(true);
    expect(isSameRun(run, { startedAt: at(0, 9), endedAt: at(0, 10), distanceM: 10_000 })).toBe(false);
    expect(isSameRun(run, { startedAt: at(0, 7), endedAt: at(0, 8), distanceM: 5_000 })).toBe(false);
    expect(isSameRun(run, { startedAt: at(0, 7, 50), endedAt: at(0, 9), distanceM: 10_000 })).toBe(false);
    expect(isSameRun({ ...run, distanceM: 0 }, { ...run, distanceM: 0 })).toBe(true);
    expect(isSameRun({ ...run, endedAt: run.startedAt }, run)).toBe(false);
  });
  it('24 saat penceresi', () => {
    expect(importDecision(run, [], at(0, 20))).toBe('map');
    expect(importDecision(run, [], at(1, 9))).toBe('stats_only');
    expect(importDecision(run, [run], at(0, 9))).toBe('duplicate');
  });
});

describe('biçim', () => {
  it('Türkçe sayı ve süre', () => {
    expect(fmtKm(6120)).toBe('6,12');
    expect(fmtKm(8400, 1)).toBe('8,4');
    expect(fmtPace(323)).toBe(`5'23"`);
    expect(fmtPace(null)).toBe(`–'––"`);
    expect(fmtPace(0)).toBe(`–'––"`);
    expect(fmtDuration(1_977_000)).toBe('32:57');
    expect(fmtDuration(2_713_000)).toBe('45:13');
    expect(fmtDuration(3_723_000)).toBe('1:02:03');
    expect(fmtDuration(-5)).toBe('0:00');
    expect(fmtInt(19220)).toBe('19.220');
    expect(fmtArea(19220)).toBe('19.220 m²');
    expect(initials('Deniz Arslan')).toBe('DA');
    expect(initials('emre şahin')).toBe('EŞ');
    expect(initials('Zeynep')).toBe('ZE');
    expect(initials('  ')).toBe('?');
    expect(RULES.H3_RES).toBe(12);
  });
});

describe('Hat', () => {
  it('10 segment, sahip / kuşatma / hayalet', async () => {
    const { hatSegments } = await import('../src/index.js');
    const s = hatSegments(85, 60, 0);
    expect(s).toHaveLength(10);
    expect(s[7]).toEqual({ owner: 100, siege: 0, ghost: 0 });
    expect(s[8]).toEqual({ owner: 50, siege: 0, ghost: 0 });
    expect(s[5]).toEqual({ owner: 100, siege: 100, ghost: 0 });
    expect(hatSegments(150, -5, NaN)[9]).toEqual({ owner: 100, siege: 0, ghost: 0 });
  });
});
