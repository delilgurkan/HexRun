import { describe, expect, it } from 'vitest';
import {
  RULES,
  applyLoop,
  attackMultiplier,
  closeRadiusFor,
  coverage,
  createDuel,
  duelHp,
  duelPower,
  emptyWorld,
  getCell,
  minLoopLengthFor,
  suggestDuels,
  tick,
  validateDuel,
  type DuelState,
  type World,
} from '../src/index.js';
import { D, H, MON, at, disk, player, worldWith } from './helpers.js';
import { destination } from '../src/geo.js';
import { bfsTake } from '../src/cells.js';

const AREA = disk(3); // 37 bağlı petek

function duelOf(w: World, id = 'd1'): DuelState {
  return w.duels.get(id)!;
}

describe('boş ve kendi petekler', () => {
  it('boş petek her zaman 10 güçle alınır; Sabah Avantajı uygulanmaz', () => {
    const w = emptyWorld();
    w.players.set('a', player('a'));
    const o = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 7) });
    expect(o.multipliers.gain).toBe(2);
    expect(o.newCells).toHaveLength(37);
    for (const id of AREA) expect(w.cells.get(id)!.power).toBe(10);
  });

  it('Öncü nişanı: boş petek 12 güçle başlar', () => {
    const w = emptyWorld();
    w.players.set('a', player('a', MON - 100 * D, ['oncu']));
    applyLoop(w, { playerId: 'a', cells: AREA.slice(0, 3), at: at(0, 12) });
    expect(w.cells.get(AREA[0]!)!.power).toBe(12);
  });

  it('kendi petek +10, Sabah Avantajı ile +20, tavan 100, günde en çok 2 halka', () => {
    const w = worldWith('a', AREA, 50, at(0, 0), [player('a')]);
    let o = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 12) });
    expect(o.reinforced).toHaveLength(37);
    expect(getCell(w, AREA[0]!).power).toBe(60);
    o = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 7) });
    expect(getCell(w, AREA[0]!).power).toBe(80);
    o = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 14) });
    expect(o.limited).toHaveLength(37);
    expect(getCell(w, AREA[0]!).power).toBe(80);
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(1, 7) });
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(1, 8) });
    expect(getCell(w, AREA[0]!).power).toBe(100);
  });

  it('rakip petekler halkayla kendi başına değişmez', () => {
    const w = worldWith('b', AREA, 40, at(0, 0), [player('a'), player('b')]);
    const o = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 12) });
    expect(o.rivalCells).toHaveLength(37);
    expect(getCell(w, AREA[0]!).ownerId).toBe('b');
    expect(getCell(w, AREA[0]!).power).toBe(40);
  });
});

describe('düello başlatma', () => {
  const setup = () => worldWith('b', disk(5), 60, at(0, 0), [player('a'), player('b')]);
  it('geçerli seçim', () => {
    const w = setup();
    const d = createDuel(w, 'd1', 'a', AREA, at(0, 10));
    expect(typeof d).toBe('object');
    expect((d as DuelState).defenderId).toBe('b');
  });
  it('hatalar: boyut, sahip, bağlılık, kendisi, sınır, örtüşme, tekrar', () => {
    const w = setup();
    expect(validateDuel(w, 'a', AREA.slice(0, 6))).toEqual({ ok: false, error: 'size' });
    expect(validateDuel(w, 'a', disk(5).slice(0, 61))).toEqual({ ok: false, error: 'size' });
    expect(validateDuel(w, 'a', [...AREA.slice(0, 7), AREA[0]!])).toEqual({ ok: false, error: 'duplicate_cells' });
    expect(validateDuel(w, 'b', AREA)).toEqual({ ok: false, error: 'self' });
    const far = disk(1, destination({ lat: 40.9819, lng: 29.0254 }, 90, 3000));
    expect(validateDuel(w, 'a', far)).toEqual({ ok: false, error: 'not_owned' });
    const w2 = setup();
    getCell(w2, AREA[0]!).ownerId = 'c';
    expect(validateDuel(w2, 'a', AREA)).toEqual({ ok: false, error: 'mixed_owner' });
    // bağlı değil: iki ayrık parça
    const ring = disk(5).filter((c) => !disk(4).includes(c));
    const parts = [...disk(1), ...ring.slice(0, 7)];
    expect(validateDuel(w, 'a', parts)).toEqual({ ok: false, error: 'not_connected' });
    // örtüşme
    const ten = bfsTake(AREA, 10);
    createDuel(w, 'd1', 'a', ten, at(0, 10));
    expect(createDuel(w, 'dx', 'a', bfsTake(AREA, 20), at(0, 10))).toBe('overlap');
  });
  it('saldırgan başına en çok 3 aktif düello', () => {
    const big = disk(8);
    const w = worldWith('b', big, 60, at(0, 0), [player('a'), player('b')]);
    const ring = (k: number) => big.filter((c) => disk(k).includes(c) && !disk(k - 1).includes(c));
    // Halka şeritleri bağlıdır.
    const r = [ring(2), ring(4), ring(6), ring(8)];
    for (const cells of r) expect(cells.length).toBeLessThanOrEqual(60);
    expect(typeof createDuel(w, 'd1', 'a', r[0]!, 1)).toBe('object');
    expect(typeof createDuel(w, 'd2', 'a', r[1]!, 1)).toBe('object');
    expect(typeof createDuel(w, 'd3', 'a', r[2]!.slice(0, 7).length === 7 ? bfs(r[2]!) : r[2]!, 1)).toBe('object');
    expect(createDuel(w, 'd4', 'a', bfs(r[3]!), 1)).toBe('limit');
  });
});

function bfs(c: string[]) {
  return bfsTake(c, 30);
}

describe('saldırı, savunma, fetih', () => {
  const setup = (power = 85, attacker = player('a'), defender = player('b')) => {
    const w = worldWith('b', AREA, power, at(0, 0), [attacker, defender]);
    w.eventsEnabled = false;
    createDuel(w, 'd1', 'a', AREA, at(0, 10));
    return w;
  };

  it('kapsama %80 altında sayılmaz (gizli tolerans)', () => {
    const w = setup();
    const partial = AREA.slice(0, Math.floor(37 * 0.79));
    let o = applyLoop(w, { playerId: 'a', cells: partial, at: at(0, 12) });
    expect(o.hits[0]).toMatchObject({ counted: false, reason: 'coverage' });
    expect(duelOf(w).progress).toBe(0);
    const enough = AREA.slice(0, Math.ceil(37 * 0.8));
    o = applyLoop(w, { playerId: 'a', cells: enough, at: at(0, 13) });
    expect(o.hits[0]).toMatchObject({ counted: true, progressDelta: 10 });
    expect(coverage(new Set(enough), AREA)).toBeGreaterThanOrEqual(0.8);
    expect(coverage(new Set(), [])).toBe(0);
  });

  it('ilk sayılan halkada sahibe bildirim gider; günde en çok 2 halka', () => {
    const w = setup();
    const o1 = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 12) });
    expect(o1.notices.find((n) => n.type === 'duel_started')).toMatchObject({ to: 'b', cells: 37 });
    const o2 = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 13) });
    expect(o2.notices.some((n) => n.type === 'duel_started')).toBe(false);
    const o3 = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 14) });
    expect(o3.hits[0]).toMatchObject({ counted: false, reason: 'daily_limit' });
    expect(duelOf(w).progress).toBe(20);
    expect(duelHp(w, duelOf(w))).toBe(65);
  });

  it('çaylak ilk 14 gün günde 3 halka', () => {
    const w = setup(85, player('a', at(0, 0)));
    for (const h of [12, 13, 14, 15]) applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, h) });
    expect(duelOf(w).progress).toBe(30);
    expect(minLoopLengthFor(w.players.get('a'), at(0, 12))).toBe(RULES.MIN_LOOP_LENGTH_M_NEWBIE);
    expect(minLoopLengthFor(w.players.get('a'), at(15, 12))).toBe(RULES.MIN_LOOP_LENGTH_M);
  });

  it('Blitz saldırıyı 2x yapar; Sabah ve Akşam saldırıya uygulanmaz', () => {
    const w = setup();
    w.eventsEnabled = true;
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(5, 12) }); // Cumartesi
    expect(duelOf(w).progress).toBe(20);
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(7, 7) }); // Pazartesi sabah
    expect(duelOf(w).progress).toBe(30);
  });

  it('sahibin halkası: güç +10, ilerleme −10 (can +20); Akşam Savunması 1,5x', () => {
    const w = setup(70);
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 12) });
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 13) });
    expect(duelHp(w, duelOf(w))).toBe(50);
    let o = applyLoop(w, { playerId: 'b', cells: AREA, at: at(0, 15) });
    expect(o.hits[0]).toMatchObject({ role: 'defense', counted: true, progressDelta: -10 });
    expect(duelHp(w, duelOf(w))).toBe(70);
    w.eventsEnabled = true;
    o = applyLoop(w, { playerId: 'b', cells: AREA, at: at(0, 19) });
    expect(o.multipliers.pushback).toBe(1.5);
    expect(duelOf(w).progress).toBe(0); // 10 − 15 → 0'ın altına inmez
    o = applyLoop(w, { playerId: 'b', cells: AREA, at: at(0, 20) });
    expect(o.hits.find((h) => h.role === 'defense')).toMatchObject({ counted: false, reason: 'daily_limit' });
  });

  it('can 0 olunca alanın tamamı aynı halkada saldırgana geçer; güç min(50, eski)', () => {
    const w = setup(30);
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 12) });
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 13) });
    const o = applyLoop(w, { playerId: 'a', cells: AREA, at: at(1, 12) });
    expect(o.captured).toHaveLength(1);
    expect(o.notices.map((n) => n.type)).toEqual(expect.arrayContaining(['cells_lost', 'duel_won']));
    for (const id of AREA) {
      expect(w.cells.get(id)!.ownerId).toBe('a');
      expect(w.cells.get(id)!.power).toBe(30);
    }
    expect(duelOf(w).status).toBe('won');
    // Fetih halkası aynı gün yeni sahibi güçlendirmez ama sonraki gün güçlendirir.
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(1, 14) });
    expect(w.cells.get(AREA[0]!)!.power).toBe(40);
  });

  it('85 güçlü petek fethedilince 50 güçle başlar', () => {
    const w = setup(85);
    duelOf(w).progress = 80;
    duelOf(w).firstCountedAt = at(0, 11);
    const o = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 12) });
    expect(o.captured).toHaveLength(1);
    expect(w.cells.get(AREA[0]!)!.power).toBe(50);
  });

  it('bir düello kazanılınca o peteklerdeki diğer düellolar sıfırlanır', () => {
    const w = setup(20);
    w.players.set('c', player('c'));
    const ten = bfsTake(AREA, 10);
    expect(typeof createDuel(w, 'd2', 'c', ten, at(0, 10))).toBe('object');
    applyLoop(w, { playerId: 'c', cells: ten, at: at(0, 11) });
    const o = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 12) });
    expect(o.captured).toHaveLength(0);
    const o2 = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 13) });
    expect(o2.captured).toHaveLength(1);
    expect(duelOf(w, 'd2').status).toBe('reset');
    expect(o2.notices).toContainEqual({ type: 'duel_reset', to: 'c', duelId: 'd2', reason: 'captured_by_other' });
  });

  it('kuşatma uyarıları %70 ve %90 eşiğinde birer kez', () => {
    const w = setup(100);
    duelOf(w).progress = 60;
    duelOf(w).firstCountedAt = 1;
    const o1 = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 12) });
    expect(o1.notices.map((n) => n.type)).toContain('siege_warn');
    const o2 = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 13) });
    expect(o2.notices.map((n) => n.type)).not.toContain('siege_warn');
    const o3 = applyLoop(w, { playerId: 'a', cells: AREA, at: at(1, 12) });
    expect(o3.notices.map((n) => n.type)).toContain('siege_alarm');
    expect(duelOf(w).warned).toBe(2);
    // Savunma tehlikeyi düşürünce uyarı seviyesi iner, %70 altında sıfırlanır.
    applyLoop(w, { playerId: 'b', cells: AREA, at: at(1, 14) });
    expect(duelOf(w).warned).toBe(1);
    applyLoop(w, { playerId: 'b', cells: AREA, at: at(1, 15) });
    applyLoop(w, { playerId: 'b', cells: AREA, at: at(2, 15) });
    expect(duelOf(w).warned).toBe(0);
  });

  it('nişanlar: Geri Alan +%20, İlk Kalkan −%10, toplam ≤ 2x', () => {
    const w = setup(85, player('a', MON - 100 * D, ['geri-alan']), player('b', MON - 100 * D, ['ilk-kalkan']));
    const d = duelOf(w);
    expect(attackMultiplier(w, d, AREA, at(0, 12), 1)).toBe(0.9);
    w.losses = AREA.map((cellId) => ({ cellId, playerId: 'a', at: at(0, 1) }));
    expect(attackMultiplier(w, d, AREA, at(0, 12), 1)).toBe(1.08);
    expect(attackMultiplier(w, d, AREA, at(0, 12), 2)).toBe(1.8);
    // Kale Bekçisi kalkanı
    const def = w.players.get('b')!;
    def.insignia = ['kale-bekcisi', 'ilk-kalkan'];
    def.shield = { cells: AREA, until: at(1, 0) };
    expect(attackMultiplier(w, d, AREA, at(0, 12), 1)).toBe(0.96); // 1.2 × (1 − 0.2 tavan)
    expect(attackMultiplier(w, d, AREA, at(2, 12), 1)).toBe(1.08);
  });

  it('Şafak Akıncısı: düello bildirimi 2 saat gecikir; Halka Ustası 60 m', () => {
    const w = setup(85, player('a', MON - 100 * D, ['safak-akincisi', 'halka-ustasi']));
    const o = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 12) });
    const n = o.notices.find((x) => x.type === 'duel_started')!;
    expect(n.type === 'duel_started' && n.notBefore).toBe(at(0, 14));
    expect(closeRadiusFor(w.players.get('a'))).toBe(60);
    expect(closeRadiusFor(w.players.get('b'))).toBe(50);
  });

  it('alan 7 peteğin altına düşerse düello kapanır', () => {
    const w = setup(85);
    for (const id of AREA.slice(0, 31)) getCell(w, id).ownerId = 'z';
    const o = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 12) });
    expect(o.hits[0]).toMatchObject({ counted: false, reason: 'too_small' });
    expect(duelOf(w).status).toBe('closed');
  });
});

describe('zaman: erime, süre aşımı', () => {
  it('sahip 24 saat halka atmazsa günde −5; idempotent; 0 olunca boşa düşer', () => {
    const w = worldWith('b', AREA.slice(0, 3), 12, at(0, 9), [player('b')]);
    expect(tick(w, at(0, 20)).changedCells.size).toBe(0);
    tick(w, at(1, 9));
    expect(getCell(w, AREA[0]!).power).toBe(7);
    tick(w, at(1, 9));
    expect(getCell(w, AREA[0]!).power).toBe(7);
    const o = tick(w, at(3, 10)); // iki gün kaçırıldı → toplu
    expect(o.emptied).toHaveLength(3);
    expect(o.notices).toContainEqual({ type: 'decay_lost', to: 'b', cells: 3 });
    expect(getCell(w, AREA[0]!).ownerId).toBeNull();
    expect(w.losses).toHaveLength(3);
    tick(w, at(20, 0));
    expect(w.losses).toHaveLength(0);
  });

  it('Sur nişanı erimeyi %20 yavaşlatır', () => {
    const w = worldWith('b', AREA.slice(0, 1), 50, at(0, 9), [player('b', MON - 100 * D, ['sur'])]);
    tick(w, at(2, 9));
    expect(getCell(w, AREA[0]!).power).toBe(42);
  });

  it('48 saatte sayılan halka gelmezse düello silinir', () => {
    const w = worldWith('b', AREA, 60, at(0, 0), [player('a'), player('b')]);
    createDuel(w, 'd1', 'a', AREA, at(0, 10));
    tick(w, at(2, 9));
    expect(duelOf(w).status).toBe('active');
    const o = tick(w, at(2, 10));
    expect(duelOf(w).status).toBe('expired');
    expect(o.notices).toContainEqual({ type: 'duel_expired', to: 'a', duelId: 'd1' });
  });

  it('saldırgan 48 saat saldırmazsa ilerleme günde −10', () => {
    const w = worldWith('b', AREA, 100, at(0, 0), [player('a'), player('b')]);
    w.eventsEnabled = false;
    createDuel(w, 'd1', 'a', AREA, at(0, 10));
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 12) });
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 13) });
    // sahip her gün savunmadan güç tutuyor say: erimeyi engellemek için güç yeniden
    tick(w, at(2, 12));
    expect(duelOf(w).progress).toBe(20);
    tick(w, at(2, 13));
    expect(duelOf(w).progress).toBe(10);
    tick(w, at(3, 13));
    expect(duelOf(w).progress).toBe(0);
    tick(w, at(5, 13));
    expect(duelOf(w).progress).toBe(0);
  });

  it('erime alanı küçültür; 7 altına inerse düello kapanır', () => {
    const w = worldWith('b', AREA, 60, at(0, 0), [player('a'), player('b')]);
    createDuel(w, 'd1', 'a', AREA, at(0, 10));
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 12) });
    for (const id of AREA.slice(0, 31)) getCell(w, id).power = 1;
    const o = tick(w, at(1, 1));
    expect(duelOf(w).status).toBe('closed');
    expect(o.notices.some((n) => n.type === 'duel_reset')).toBe(true);
  });
});

describe('öneri', () => {
  it('rakibin en az 7 peteğinden geçen halka için seçim önerilir', () => {
    const w = worldWith('b', disk(2), 55, at(0, 0), [player('a'), player('b')]);
    const s = suggestDuels(w, 'a', disk(3));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ defenderId: 'b', avgPower: 55 });
    expect(s[0]!.cells).toHaveLength(19);
    expect(suggestDuels(w, 'a', disk(0))).toHaveLength(0);
    createDuel(w, 'd1', 'a', disk(2), 1);
    expect(suggestDuels(w, 'a', disk(3))).toHaveLength(0);
    expect(suggestDuels(w, 'b', disk(3))).toHaveLength(0);
  });
  it('60 petek tavanı ve bağlılık', () => {
    const w = worldWith('b', disk(6), 55, at(0, 0), [player('a'), player('b')]);
    const s = suggestDuels(w, 'a', disk(6));
    expect(s[0]!.cells).toHaveLength(60);
    expect(validateDuel(w, 'a', s[0]!.cells).ok).toBe(true);
  });
});

/**
 * Tasarımdaki "85 güçlü alan kaç günde el değiştirir?" tablosunu motorla yeniden üretir.
 * Saatler: sahip 10:00/11:00, saldırgan 12:00/13:00 (etkinlik dışı); tick her saat.
 */
describe('simülasyon tablosu', () => {
  function simulate(opts: { ownerPerDay: number; attackerPerDay: number; newbie?: boolean; blitz?: boolean; days?: number }) {
    const start = opts.blitz ? at(0, 0) : at(0, 0);
    const atk = player('a', opts.newbie ? at(0, 0) : MON - 100 * D);
    const w = worldWith('b', AREA, 85, start - 15 * H, [atk, player('b')]);
    w.eventsEnabled = !!opts.blitz;
    createDuel(w, 'd1', 'a', AREA, start);
    const days = opts.days ?? 60;
    for (let day = 0; day < days; day++) {
      for (let h = 0; h < 24; h++) {
        const t = at(day, h);
        tick(w, t);
        if (h === 15 && opts.ownerPerDay >= 1) applyLoop(w, { playerId: 'b', cells: AREA, at: t });
        if (h === 16 && opts.ownerPerDay >= 2) applyLoop(w, { playerId: 'b', cells: AREA, at: t });
        if (h >= 12 && h < 12 + opts.attackerPerDay) {
          const o = applyLoop(w, { playerId: 'a', cells: AREA, at: t });
          if (o.captured.length) return { day: day + 1, weekendsSeen: Math.floor((day + 2) / 7) };
        }
        if (duelOf(w).status !== 'active' && duelOf(w).status !== 'won') return { day: -1, weekendsSeen: 0, status: duelOf(w).status };
      }
      if (AREA.every((id) => w.cells.get(id)!.ownerId === null)) return { day: day + 1, empty: true, weekendsSeen: 0 };
    }
    return { day: Infinity, weekendsSeen: 0 };
  }

  it('sahip 2 · saldırgan 2 → düşmez', () => {
    expect(simulate({ ownerPerDay: 2, attackerPerDay: 2 }).day).toBe(Infinity);
  });
  it('sahip 1 · saldırgan 2 → ~10 gün', () => {
    const r = simulate({ ownerPerDay: 1, attackerPerDay: 2 });
    expect(r.day).toBeGreaterThanOrEqual(9);
    expect(r.day).toBeLessThanOrEqual(11);
  });
  it('sahip 2 · çaylak 3 → ~10 gün', () => {
    const r = simulate({ ownerPerDay: 2, attackerPerDay: 3, newbie: true });
    // Tablo gün sonu durumunu yuvarlıyor; fetih, sahip savunmadan önceki 3. halkada gelir (8. gün).
    expect(r.day).toBeGreaterThanOrEqual(8);
    expect(r.day).toBeLessThanOrEqual(11);
  });
  it('sahip 2 · saldırgan 2 · Blitz → ~3 hafta sonu', () => {
    const r = simulate({ ownerPerDay: 2, attackerPerDay: 2, blitz: true });
    // Pazartesi başlangıç: 3. hafta sonu = 20.–21. gün
    expect(r.day).toBeGreaterThanOrEqual(13);
    expect(r.day).toBeLessThanOrEqual(21);
  });
  it('sahip yok · saldırgan 1 → ~6 gün', () => {
    const r = simulate({ ownerPerDay: 0, attackerPerDay: 1 });
    expect(r.day).toBeGreaterThanOrEqual(5);
    expect(r.day).toBeLessThanOrEqual(7);
  });
  it('sahip yok · saldırgan 2 → ~4 gün', () => {
    const r = simulate({ ownerPerDay: 0, attackerPerDay: 2 });
    expect(r.day).toBeGreaterThanOrEqual(3);
    expect(r.day).toBeLessThanOrEqual(5);
  });
  it('kimse gelmiyor → ~18 gün boşa', () => {
    const w = worldWith('b', AREA, 85, at(0, 0), [player('b')]);
    let day = 0;
    for (; day < 30; day++) {
      tick(w, at(day, 0));
      if (AREA.every((id) => w.cells.get(id)!.ownerId === null)) break;
    }
    expect(day).toBeGreaterThanOrEqual(17);
    expect(day).toBeLessThanOrEqual(18);
  });
});

describe('güç ve can yardımcıları', () => {
  it('boş alanın gücü 0', () => {
    const w = emptyWorld();
    const d = { cells: ['x'], defenderId: 'b', progress: 0 } as unknown as DuelState;
    expect(duelPower(w, d)).toBe(0);
    expect(duelHp(w, d)).toBe(0);
  });
});

describe('geç gelen halkalar', () => {
  it('eski zamanlı halka erime saatini ve saldırı saatini geriye almaz', () => {
    const w = worldWith('b', AREA, 60, at(1, 10), [player('a'), player('b')]);
    w.eventsEnabled = false;
    applyLoop(w, { playerId: 'b', cells: AREA, at: at(0, 10) });
    expect(getCell(w, AREA[0]!).lastOwnerLoopAt).toBe(at(1, 10));
    createDuel(w, 'd1', 'a', AREA, at(1, 11));
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(1, 12) });
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(1, 11, 30) });
    expect(duelOf(w).lastAttackAt).toBe(at(1, 12));
  });
});

describe('inceleme bulguları', () => {
  it('dünkü geç halka bugünün günlük sınırını sıfırlamaz', () => {
    const w = worldWith('b', AREA, 85, at(0, 0), [player('a'), player('b')]);
    w.eventsEnabled = false;
    createDuel(w, 'd1', 'a', AREA, at(0, 1));
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(1, 12) });
    applyLoop(w, { playerId: 'a', cells: AREA, at: at(1, 13) });
    const late = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 23) });
    expect(late.hits[0]).toMatchObject({ counted: false, reason: 'daily_limit' });
    const again = applyLoop(w, { playerId: 'a', cells: AREA, at: at(1, 14) });
    expect(again.hits[0]).toMatchObject({ counted: false, reason: 'daily_limit' });
    expect(duelOf(w).progress).toBe(20);
    // Sahibin petek sayacı da
    applyLoop(w, { playerId: 'b', cells: AREA, at: at(1, 15) });
    applyLoop(w, { playerId: 'b', cells: AREA, at: at(1, 16) });
    const o = applyLoop(w, { playerId: 'b', cells: AREA, at: at(0, 22) });
    expect(o.reinforced).toHaveLength(0);
  });
  it('düellodan önce koşulmuş halka geriye dönük sayılmaz', () => {
    const w = worldWith('b', AREA, 85, at(0, 0), [player('a'), player('b')]);
    createDuel(w, 'd1', 'a', AREA, at(0, 17));
    const o = applyLoop(w, { playerId: 'a', cells: AREA, at: at(0, 14) });
    expect(o.hits).toHaveLength(0);
    expect(duelOf(w).firstCountedAt).toBeNull();
    const def = applyLoop(w, { playerId: 'b', cells: AREA, at: at(0, 15) });
    expect(def.hits).toHaveLength(0);
  });
});
