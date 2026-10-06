import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bfsTake, cellsInPolygon, circleTrack, destination } from '@hexrun/core';
import type { RunSummary } from '@hexrun/contracts';
import { D, H, MODA, T0, as, loopRun, renew, send, setup, signup, type Ctx, type Player } from './helpers.js';
import { runTick, housekeeping, JOBS, startJobs } from '../src/jobs.js';
import { decayWarnings, eventReminders } from '../src/game/notifications.js';
import { snapshotLeagues } from '../src/game/social.js';

let ctx: Ctx;
let players: Player[];
beforeAll(async () => {
  ctx = await setup();
  players = [];
  for (let i = 0; i < 8; i++) players.push(await signup(ctx, `Koşucu ${String.fromCharCode(65 + i)}`, ['keh', 'kir', 'lim', 'zum', 'gok', 'lac', 'gul', 'mer'][i]!));
});
afterAll(async () => ctx.close());

describe('eşzamanlılık', () => {
  it('8 oyuncu aynı anda üst üste binen halkalar: kilitlenme yok, her petek tek sahipli', async () => {
    const t = T0 + 10 * 60_000;
    const runs = players.map((p, i) => {
      const pts = loopRun(destination(MODA, i * 45, 80), 140, t + i * 1000);
      return { p, pts };
    });
    ctx.clock.set(t + 3 * H);
    await Promise.all(players.map((p) => renew(ctx, p)));
    const results = await Promise.all(
      runs.map(({ p, pts }, i) =>
        ctx.app.inject({ method: 'POST', url: '/v1/runs', headers: as(p), payload: { clientRunId: `conc-${i}-aaaa`, source: 'phone', points: pts } }),
      ),
    );
    for (const r of results) expect(r.statusCode).toBe(200);
    const claimed = results.reduce((s, r) => s + r.json<RunSummary>().loops[0]!.newCells, 0);
    const owned = await ctx.db.query<{ n: number }>('SELECT COUNT(*)::int n FROM cells WHERE owner_id IS NOT NULL');
    // Her boş petek tam bir kez alınır.
    expect(owned.rows[0]!.n).toBe(claimed);
    const events = await ctx.db.query<{ n: number }>(`SELECT COUNT(*)::int n FROM cell_events WHERE kind = 'claim'`);
    expect(events.rows[0]!.n).toBe(claimed);
  });

  it('aynı koşu aynı anda iki kez gönderilirse bir kez işlenir', async () => {
    const p = players[0]!;
    const pts = loopRun(destination(MODA, 200, 1500), 60, T0 + 4 * H);
    ctx.clock.set(pts.at(-1)!.t + 1000);
    await renew(ctx, p);
    const payload = { clientRunId: 'double-submit-1', source: 'phone', points: pts };
    const [a, b] = await Promise.all([
      ctx.app.inject({ method: 'POST', url: '/v1/runs', headers: as(p), payload }),
      ctx.app.inject({ method: 'POST', url: '/v1/runs', headers: as(p), payload }),
    ]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.json<RunSummary>().id).toBe(b.json<RunSummary>().id);
  });

  it('saldırı + savunma + zamanlayıcı aynı anda: tutarlı düello', async () => {
    const [owner, a1, a2] = players as [Player, Player, Player];
    const center = destination(MODA, 0, 3000);
    const pts = loopRun(center, 150, T0 + 5 * H);
    ctx.clock.set(pts.at(-1)!.t + 1000);
    await renew(ctx, owner);
    await ctx.app.inject({ method: 'POST', url: '/v1/runs', headers: as(owner), payload: { clientRunId: 'own-run-1', source: 'phone', points: pts } });
    const area1 = bfsTake(cellsInPolygon(circleTrack(center, 60, 40, 0, 3)), 25);
    const area2 = bfsTake(cellsInPolygon(circleTrack(destination(center, 90, 80), 50, 40, 0, 3)), 20).filter((c) => !area1.includes(c));
    expect((await send(ctx, a1, 'POST', '/v1/duels', { cells: area1 })).statusCode).toBe(201);
    const r2 = await send(ctx, a2, 'POST', '/v1/duels', { cells: bfsTake(area2, 15) });
    expect(r2.statusCode).toBe(201);
    const t = T0 + 6 * H;
    const atk1 = loopRun(center, 90, t);
    const atk2 = loopRun(destination(center, 90, 80), 80, t + 500);
    const def = loopRun(center, 150, t + 1000);
    ctx.clock.set(def.at(-1)!.t + 1000);
    await Promise.all([a1, a2, owner].map((p) => renew(ctx, p)));
    const res = await Promise.all([
      ctx.app.inject({ method: 'POST', url: '/v1/runs', headers: as(a1), payload: { clientRunId: 'atk-1-xxxx', source: 'phone', points: atk1 } }),
      ctx.app.inject({ method: 'POST', url: '/v1/runs', headers: as(a2), payload: { clientRunId: 'atk-2-xxxx', source: 'phone', points: atk2 } }),
      ctx.app.inject({ method: 'POST', url: '/v1/runs', headers: as(owner), payload: { clientRunId: 'def-1-xxxx', source: 'phone', points: def } }),
      runTick(ctx.deps),
    ]);
    for (const r of res.slice(0, 3)) expect((r as { statusCode: number }).statusCode).toBe(200);
    const duels = await ctx.db.query<{ progress: number; status: string; attacks_count: number }>(`SELECT progress, status, attacks_count FROM duels ORDER BY created_at`);
    for (const d of duels.rows) {
      expect(d.progress).toBeGreaterThanOrEqual(0);
      expect(['active', 'won']).toContain(d.status);
    }
  });
});

describe('zamanlanmış işler', () => {
  it('erime uyarısı, etkinlik hatırlatması, lig anlık görüntüsü, temizlik', async () => {
    const p = players[1]!;
    await send(ctx, p, 'POST', '/v1/events/morning/remind', { on: true });
    // 3 gün sonra: halka atılmayan petekler için uyarı
    ctx.clock.set(T0 + 3 * D + 6 * H);
    expect(await decayWarnings(ctx.deps)).toBeGreaterThan(0);
    expect(await decayWarnings(ctx.deps)).toBe(0); // 3 günde bir
    // Sabah 07:00: hatırlatma bir kez
    ctx.clock.set(Date.parse('2026-10-09T04:00:00Z'));
    expect(await eventReminders(ctx.deps)).toBe(1);
    expect(await eventReminders(ctx.deps)).toBe(0);
    expect(await snapshotLeagues(ctx.deps)).toBeGreaterThan(0);
    // 31 gün sonra ham GPS silinir
    ctx.clock.set(T0 + 31 * D);
    const h = await housekeeping(ctx.deps);
    expect(h.points).toBeGreaterThan(0);
    const left = await ctx.db.query<{ n: number }>('SELECT COUNT(*)::int n FROM runs WHERE points IS NOT NULL');
    expect(left.rows[0]!.n).toBe(0);
    expect(JOBS.map((j) => j.name)).toEqual(['push', 'tick', 'events', 'decay-warnings', 'league-snapshot', 'housekeeping']);
  });

  it('zamanlayıcı başlar ve durur (tek örnek kilidi)', async () => {
    const logs: string[] = [];
    const stop = startJobs(ctx.deps, { info: (_o, m) => logs.push(m ?? ''), error: (_o, m) => logs.push(`E:${m}`) });
    await new Promise((r) => setTimeout(r, 5_500));
    stop();
    expect(logs.filter((l) => l === 'job done').length).toBeGreaterThanOrEqual(5);
    expect(logs.some((l) => l.startsWith('E:'))).toBe(false);
  });
});
