import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RULES, applyLoop, bfsTake, createDuel, emptyWorld, tick, type World } from '../src/index.js';
import { D, H, MON, disk, player } from './helpers.js';

const CELLS = disk(4); // 61 petek
const PLAYERS = ['a', 'b', 'c'];

type Action =
  | { k: 'loop'; p: number; start: number; size: number }
  | { k: 'duel'; p: number; start: number; size: number }
  | { k: 'wait'; hours: number };

const action: fc.Arbitrary<Action> = fc.oneof(
  fc.record({ k: fc.constant('loop' as const), p: fc.nat(2), start: fc.nat(60), size: fc.integer({ min: 1, max: 61 }) }),
  fc.record({ k: fc.constant('duel' as const), p: fc.nat(2), start: fc.nat(60), size: fc.integer({ min: 5, max: 61 }) }),
  fc.record({ k: fc.constant('wait' as const), hours: fc.integer({ min: 1, max: 60 }) }),
);

function pick(start: number, size: number): string[] {
  const rotated = [...CELLS.slice(start), ...CELLS.slice(0, start)];
  return bfsTake([rotated[0]!, ...CELLS], size);
}

function invariants(w: World) {
  for (const c of w.cells.values()) {
    expect(c.power).toBeGreaterThanOrEqual(0);
    expect(c.power).toBeLessThanOrEqual(RULES.MAX_POWER);
    if (c.ownerId === null) expect(c.power).toBe(0);
    else expect(c.power).toBeGreaterThan(0);
  }
  const active = [...w.duels.values()].filter((d) => d.status === 'active');
  for (const p of PLAYERS) {
    const mine = active.filter((d) => d.attackerId === p);
    expect(mine.length).toBeLessThanOrEqual(RULES.MAX_ACTIVE_DUELS);
    const all = mine.flatMap((d) => d.cells);
    expect(new Set(all).size).toBe(all.length);
  }
  for (const d of active) {
    expect(d.attackerId).not.toBe(d.defenderId);
    expect(d.progress).toBeGreaterThanOrEqual(0);
    expect(d.cells.length).toBeGreaterThanOrEqual(RULES.DUEL_MIN_CELLS);
  }
}

describe('motor değişmezleri (özellik tabanlı)', () => {
  it('rastgele eylem dizilerinde değişmezler korunur', () => {
    fc.assert(
      fc.property(fc.array(action, { minLength: 1, maxLength: 80 }), fc.boolean(), (actions, events) => {
        const w = emptyWorld();
        w.eventsEnabled = events;
        PLAYERS.forEach((p, i) => w.players.set(p, player(p, MON - (i * 10) * D, i === 0 ? ['oncu', 'geri-alan'] : i === 1 ? ['ilk-kalkan', 'sur'] : [])));
        let now = MON + 6 * H;
        let n = 0;
        for (const a of actions) {
          if (a.k === 'wait') {
            now += a.hours * H;
            tick(w, now);
          } else if (a.k === 'loop') {
            now += 30 * 60_000;
            const o = applyLoop(w, { playerId: PLAYERS[a.p]!, cells: pick(a.start, a.size), at: now });
            for (const cap of o.captured) for (const id of cap.cells) expect(w.cells.get(id)!.ownerId).toBe(PLAYERS[a.p]);
            for (const id of o.newCells) expect(w.cells.get(id)!.ownerId).toBe(PLAYERS[a.p]);
          } else {
            createDuel(w, `d${n++}`, PLAYERS[a.p]!, pick(a.start, a.size), now);
          }
          invariants(w);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('tick idempotenttir', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 * 24 }), fc.integer({ min: 1, max: 100 }), (hours, power) => {
        const mk = () => {
          const w = emptyWorld();
          w.players.set('b', player('b'));
          applyLoop(w, { playerId: 'b', cells: CELLS.slice(0, 5), at: MON });
          for (const id of CELLS.slice(0, 5)) w.cells.get(id)!.power = power;
          return w;
        };
        const w1 = mk();
        tick(w1, MON + hours * H);
        tick(w1, MON + hours * H);
        const w2 = mk();
        // Ara adımlarla aynı noktaya gelmek de aynı sonucu verir.
        for (let h = 1; h <= hours; h += 7) tick(w2, MON + h * H);
        tick(w2, MON + hours * H);
        for (const id of CELLS.slice(0, 5)) {
          expect(w1.cells.get(id)!.power).toBeCloseTo(w2.cells.get(id)!.power, 5);
          expect(w1.cells.get(id)!.ownerId).toBe(w2.cells.get(id)!.ownerId);
        }
      }),
      { numRuns: 200 },
    );
  });
});
