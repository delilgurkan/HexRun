/** Bağımsız kod incelemesinde bulunan hataların gerileme testleri. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bfsTake, cellOf, cellsInPolygon, circleTrack, destination } from '@hexrun/core';
import type { DuelSummary, NotificationDto, Page, RegionDetail, RunSummary } from '@hexrun/contracts';
import { D, H, MODA, T0, as, get, renew, runAt, send, setup, signup, type Ctx } from './helpers.js';

let ctx: Ctx;
beforeAll(async () => {
  ctx = await setup({ STRAVA_SUBSCRIPTION_ID: '42', AUTH_RATE_LIMIT_PER_MIN: '100000' });
});
afterAll(async () => ctx.close());

const ring = (c: { lat: number; lng: number }, r: number, n: number) => bfsTake(cellsInPolygon(circleTrack(c, r, 40, 0, 3)), n);

describe('gizlilik bölgesi sızıntıları', () => {
  it('bölge sayfası gizli ve açık petekleri birleştirmez; düello ve halka sonucu sahibi gizler', async () => {
    const b = await signup(ctx, 'Burak Gizli', 'kir');
    const a = await signup(ctx, 'Ayşe Açık', 'gok');
    const home = destination(MODA, 0, 4000);
    await runAt(ctx, b, home, 380, T0);
    await send(ctx, b, 'PUT', '/v1/me/privacy', { home, radiusM: 200 });
    const zone = (await ctx.db.query('SELECT privacy_lat lat, privacy_lng lng, privacy_radius_m r FROM users WHERE id = $1', [b.id])).rows[0];
    const center = { lat: zone.lat, lng: zone.lng };
    // Bölge dışında bir petek
    const outside = cellOf(destination(center, 90, 260));
    const out = await get<RegionDetail>(ctx, a, `/v1/map/region?cell=${outside}`);
    expect(out.hidden).toBe(false);
    expect(out.owner!.displayName).toBe("Burak Gizli");
    const inside = cellOf(center);
    expect(out.cells).not.toContain(inside);
    const inn = await get<RegionDetail>(ctx, a, `/v1/map/region?cell=${inside}`);
    expect(inn).toMatchObject({ hidden: true, owner: null });
    expect(inn.cells).not.toContain(outside);
    // Sahip kendi bölgesini bütün görür
    const own = await get<RegionDetail>(ctx, b, `/v1/map/region?cell=${inside}`);
    expect(own.cells).toContain(outside);

    // Gizli peteklere düello: sahip adı ve kimliği gelmez
    const cells = ring(center, 60, 12);
    const r = await send(ctx, a, 'POST', '/v1/duels', { cells });
    expect(r.statusCode).toBe(201);
    const duel = r.json<DuelSummary>();
    expect(duel.defender.displayName).toBe('Gizli oyuncu');
    expect(duel.defender.id).not.toBe(b.id);
    expect(JSON.stringify(duel)).not.toContain('Burak');
    const s = await runAt(ctx, a, center, 90, T0 + 3 * H);
    expect(JSON.stringify(s)).not.toContain('Burak');
    expect(JSON.stringify(s)).not.toContain(b.id);
    const n = await get<Page<NotificationDto>>(ctx, a, '/v1/notifications');
    expect(JSON.stringify(n)).not.toContain('Burak');
  });
});

describe('düello yarışları', () => {
  it('iptal edilen düello eşzamanlı bir halkayla geri canlanmaz', async () => {
    const o = await signup(ctx, 'Sahip Bir', 'zum');
    const atk = await signup(ctx, 'Saldıran Bir', 'lim');
    const c = destination(MODA, 180, 4000);
    await runAt(ctx, o, c, 200, T0 + D);
    for (let i = 0; i < 4; i++) {
      const cells = ring(destination(c, i * 90, 80), 40, 8);
      const d = await send(ctx, atk, 'POST', '/v1/duels', { cells });
      const id = d.json<DuelSummary>().id;
      const pts = circleTrack(c, 200, 180, T0 + D + 2 * H + i * H, 3);
      ctx.clock.set(pts.at(-1)!.t + 1000);
      await Promise.all([renew(ctx, o), renew(ctx, atk)]);
      const [del] = await Promise.all([
        ctx.app.inject({ method: 'DELETE', url: `/v1/duels/${id}`, headers: as(atk) }),
        ctx.app.inject({ method: 'POST', url: '/v1/runs', headers: as(o), payload: { clientRunId: `race-def-${i}-x`, source: 'phone', points: pts } }),
      ]);
      expect(del.statusCode).toBe(204);
      const st = await ctx.db.query('SELECT status FROM duels WHERE id = $1', [id]);
      expect(st.rows[0].status).toBe('cancelled');
    }
  });

  it('paralel isteklerle 3 aktif düello sınırı aşılamaz', async () => {
    const atk = await signup(ctx, 'Hırslı Koşucu', 'mer');
    const owners = [];
    for (let i = 0; i < 5; i++) owners.push(await signup(ctx, `Uzak Sahip ${i}`, 'keh'));
    const centers = owners.map((_, i) => destination(MODA, i * 72, 30_000));
    for (let i = 0; i < 5; i++) await runAt(ctx, owners[i]!, centers[i]!, 120, T0 + 2 * D + i * H);
    await renew(ctx, atk);
    const res = await Promise.all(centers.map((c) => ctx.app.inject({ method: 'POST', url: '/v1/duels', headers: as(atk), payload: { cells: ring(c, 50, 10) } })));
    expect(res.filter((r) => r.statusCode === 201)).toHaveLength(3);
    expect(res.filter((r) => r.statusCode === 409)).toHaveLength(2);
  });

  it('Şafak Akıncısı gecikmesi kuşatma bildirimlerini de kapsar', async () => {
    const o = await signup(ctx, 'Uykucu Sahip', 'gok');
    const atk = await signup(ctx, 'Şafak Koşucusu', 'kir');
    const c = destination(MODA, 270, 6000);
    await runAt(ctx, o, c, 150, T0 + 5 * D);
    await ctx.db.query(`UPDATE users SET insignia = '{safak-akincisi}' WHERE id = $1`, [atk.id]);
    await ctx.db.query(`UPDATE cells SET power = 13 WHERE owner_id = $1`, [o.id]);
    const cells = ring(c, 50, 10);
    await send(ctx, atk, 'POST', '/v1/duels', { cells });
    await runAt(ctx, atk, c, 80, T0 + 5 * D + 2 * H);
    const n = await get<Page<NotificationDto>>(ctx, o, '/v1/notifications');
    // Cumartesi (Blitz): tek halka alanı alır. Sahip 2 saat boyunca ne düelloyu ne kaybı görür.
    expect(n.items.filter((x) => ['duel_started', 'siege_warn', 'siege_alarm', 'cells_lost'].includes(x.kind))).toHaveLength(0);
    ctx.clock.advance(2 * H + 60_000);
    const n2 = await get<Page<NotificationDto>>(ctx, o, '/v1/notifications');
    expect(n2.items.map((x) => x.kind)).toEqual(expect.arrayContaining(['duel_started', 'cells_lost']));
  });
});

describe('kimlik ve girdi', () => {
  it('paralel kod tahminleri 5 deneme sınırını aşamaz', async () => {
    ctx.clock.advance(61_000);
    const s = await ctx.app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'race@x.co' } });
    const code = s.json().devCode as string;
    const wrong = code === '123456' ? '654321' : '123456';
    const res = await Promise.all(Array.from({ length: 12 }, () => ctx.app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: 'race@x.co', code: wrong } })));
    expect(res.filter((r) => r.statusCode === 401)).toHaveLength(5);
    expect((await ctx.app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: 'race@x.co', code } })).statusCode).toBe(429);
  });

  it('geçersiz sayfa imleci 400 (500 değil)', async () => {
    const u = await signup(ctx, 'İmleç Test', 'lac');
    for (const url of ['/v1/runs?cursor=abc', '/v1/feed?cursor=abc', '/v1/notifications?cursor=1e99']) {
      await renew(ctx, u);
      expect((await ctx.app.inject({ method: 'GET', url, headers: as(u) })).statusCode).toBe(400);
    }
  });

  it('Strava web kancası abonelik kimliğini doğrular', async () => {
    const bad = await ctx.app.inject({ method: 'POST', url: '/v1/integrations/strava/webhook', payload: { subscription_id: 7, object_type: 'activity' } });
    expect(bad.statusCode).toBe(403);
    const ok = await ctx.app.inject({ method: 'POST', url: '/v1/integrations/strava/webhook', payload: { subscription_id: 42, object_type: 'athlete' } });
    expect(ok.statusCode).toBe(200);
  });
});

describe('hız sınırı', () => {
  it('rastgele Authorization başlığı giriş sınırını atlatamaz', async () => {
    const c2 = await setup({ AUTH_RATE_LIMIT_PER_MIN: '3' });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await c2.app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: 'x@y.co', code: '000000' }, headers: { authorization: `Bearer junk-${i}-${Math.random()}` } });
        codes.push(r.statusCode);
      }
      expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(3);
    } finally {
      await c2.close();
      // setup() şemayı sıfırladığı için ana bağlamı yeniden kur
      await ctx.close();
      ctx = await setup();
    }
  });
});

void ({} as RunSummary);
