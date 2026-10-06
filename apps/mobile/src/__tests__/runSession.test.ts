import type { MapCell, SubmitRunRequest } from '@hexrun/contracts';
import { cellOf, circleTrack, destination, type TrackPoint } from '@hexrun/core';
import { RunQueue } from '../api/runQueue';
import { memoryKV } from '../lib/storage';
import { RunController, runStore, type HapticsAdapter, type LocationAdapter } from '../run/controller';
import { ACTIVE_RUN_KEY, RunSession } from '../run/session';

const center = { lat: 40.987, lng: 29.03 };
const T0 = 1_760_000_000_000;

/** 250 m yarıçaplı tam tur (~1,57 km), 3 m/s. */
const loopPoints = (): TrackPoint[] => circleTrack(center, 250, 120, T0, 3);

function deps(kv = memoryKV(), clock = { now: T0 }) {
  let n = 0;
  return { kv, clock, d: { kv, uuid: () => `run-${++n}`, now: () => clock.now, persistEveryMs: 0 } };
}

describe('RunSession durum makinesi', () => {
  it('idle → running → paused → running → finished', async () => {
    const { d, clock, kv } = deps();
    const s = RunSession.create(d);
    expect(s.getStatus()).toBe('idle');
    await s.start();
    expect(s.getStatus()).toBe('running');
    expect(await kv.getItem(ACTIVE_RUN_KEY)).not.toBeNull();
    clock.now += 10_000;
    await s.pause();
    expect(s.getStatus()).toBe('paused');
    clock.now += 60_000;
    expect(await s.addPoints([{ ...center, t: clock.now, acc: 5 }])).toEqual([]);
    await s.resume();
    clock.now += 5_000;
    expect(s.snapshot().elapsedMs).toBe(15_000);
    const req = await s.finish();
    expect(s.getStatus()).toBe('finished');
    expect(req.clientRunId).toBe('run-1');
    expect(req.source).toBe('phone');
    expect(await kv.getItem(ACTIVE_RUN_KEY)).toBeNull();
  });

  it('geçersiz geçişleri reddeder', async () => {
    const { d } = deps();
    const s = RunSession.create(d);
    await expect(s.finish()).rejects.toThrow();
    await s.start();
    await expect(s.start()).rejects.toThrow();
  });

  it('halka kapanınca loop olayı üretir; kapanış modunda tık üretir', async () => {
    const { d } = deps();
    const s = RunSession.create(d);
    await s.start();
    const events = await s.addPoints(loopPoints());
    const loops = events.filter((e) => e.type === 'loop');
    expect(loops).toHaveLength(1);
    expect(events.some((e) => e.type === 'closing-enter')).toBe(true);
    expect(events.some((e) => e.type === 'tick')).toBe(true);
    const snap = s.snapshot();
    expect(snap.tracker.loops).toHaveLength(1);
    expect(snap.tracker.loops[0]!.areaM2).toBeGreaterThan(150_000);
  });

  it('uygulama öldürülürse günlükten aynen geri yüklenir', async () => {
    const { d, kv } = deps();
    const s = RunSession.create(d, { context: { defendDuelId: 'duel-7' } });
    await s.start();
    const pts = loopPoints();
    await s.addPoints(pts.slice(0, 60));
    await s.pause();
    await s.resume();
    await s.addPoints(pts.slice(60, 80));
    const before = s.snapshot();

    const restored = await RunSession.restore(d);
    expect(restored).not.toBeNull();
    const after = restored!.snapshot();
    expect(after.clientRunId).toBe(before.clientRunId);
    expect(after.status).toBe('running');
    expect(after.context.defendDuelId).toBe('duel-7');
    expect(after.tracker.distanceM).toBeCloseTo(before.tracker.distanceM, 6);
    expect(after.pointCount).toBe(before.pointCount);
    // Geri yüklenen oturum kaldığı yerden devam eder ve halkayı kapatır.
    const ev = await restored!.addPoints(pts.slice(80));
    expect(ev.some((e) => e.type === 'loop')).toBe(true);
    expect(JSON.parse((await kv.getItem(ACTIVE_RUN_KEY))!).log.length).toBeGreaterThan(100);
  });

  it('arka plan görevi oturum yokken noktaları depoya ekler', async () => {
    const { d, kv } = deps();
    const s = RunSession.create(d);
    await s.start();
    await s.addPoints(loopPoints().slice(0, 5));
    const ok = await RunSession.appendToStored(kv, loopPoints().slice(3, 10));
    expect(ok).toBe(true);
    const r = await RunSession.restore(d);
    expect(r!.snapshot().pointCount).toBe(10);
  });
});

describe('RunController', () => {
  function makeController(cells: MapCell[] = []) {
    const { d, kv, clock } = deps();
    const haptics: HapticsAdapter = { tick: jest.fn(), closeImpact: jest.fn(), cellTick: jest.fn(), crack: jest.fn(), success: jest.fn() };
    const location: LocationAdapter = { start: jest.fn(async () => undefined), stop: jest.fn(async () => undefined) };
    const keepAwake = { activate: jest.fn(), deactivate: jest.fn() };
    const submitted: SubmitRunRequest[] = [];
    const queue = new RunQueue({
      kv,
      submit: async (r) => {
        submitted.push(r);
        return { id: 'srv-1' } as never;
      },
    });
    const c = new RunController({
      ...d,
      haptics,
      location,
      keepAwake,
      queue,
      conquestContext: () => ({ myId: 'me', cells: new Map(cells.map((x) => [x.id, x])), attacking: [] }),
    });
    return { c, haptics, location, keepAwake, queue, submitted, kv, clock, d };
  }

  it('halka kapanışı fetih anını tetikler (sert haptik + önizleme)', async () => {
    const own = cellOf(destination(center, 0, 50));
    const { c, haptics, location, keepAwake } = makeController([
      { id: own, ownerId: 'me', power: 40, slot: 'keh', duel: null, progress: null, ghost: 0 },
    ]);
    await c.start();
    expect(location.start).toHaveBeenCalled();
    expect(keepAwake.activate).toHaveBeenCalled();
    expect(runStore.get().active).toBe(true);
    await c.ingest(loopPoints());
    expect(haptics.closeImpact).toHaveBeenCalledTimes(1);
    expect(haptics.tick).toHaveBeenCalled();
    const cq = runStore.get().conquest;
    expect(cq).not.toBeNull();
    expect(cq!.preview.cells.length).toBeGreaterThan(100);
    expect(cq!.preview.own).toBe(1);
    expect(cq!.preview.empty).toBe(cq!.preview.cells.length - 1);
    c.dismissConquest();
    expect(runStore.get().conquest).toBeNull();
  });

  it('bitir: kuyruğa koyar, gönderir, konumu durdurur', async () => {
    const { c, location, keepAwake, submitted, queue } = makeController();
    await c.start();
    await c.ingest(loopPoints().slice(0, 30));
    const id = await c.finish();
    expect(id).toBe('run-1');
    expect(location.stop).toHaveBeenCalled();
    expect(keepAwake.deactivate).toHaveBeenCalled();
    await queue.flush();
    expect(submitted).toHaveLength(1);
    expect(submitted[0]!.points).toHaveLength(30);
    expect(runStore.get().active).toBe(false);
  });

  it('açılışta yarım koşuyu geri yükler ve konumu yeniden başlatır', async () => {
    const a = makeController();
    await a.c.start({ firstLoop: true });
    await a.c.ingest(loopPoints().slice(0, 20));
    const b = new RunController({
      ...a.d,
      haptics: a.haptics,
      location: { start: jest.fn(async () => undefined), stop: jest.fn(async () => undefined) },
      keepAwake: a.keepAwake,
      queue: a.queue,
      conquestContext: () => ({ myId: null, cells: new Map(), attacking: [] }),
    });
    expect(await b.recover()).toBe(true);
    expect(runStore.get().recovered).toBe(true);
    expect(runStore.get().snap?.pointCount).toBe(20);
    expect(b.current?.snapshot().context.firstLoop).toBe(true);
  });
});
