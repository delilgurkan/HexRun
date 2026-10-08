import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IntegrationDto, RunSummary } from '@hexrun/contracts';
import { hmac } from '../src/lib/crypto.js';
import { D, MODA, T0, get, loopRun, send, setup, signup, type Ctx, type Player } from './helpers.js';

let ctx: Ctx;
let p: Player;
beforeAll(async () => {
  ctx = await setup({
    STRAVA_CLIENT_ID: '123',
    STRAVA_CLIENT_SECRET: 'sec',
    STRAVA_VERIFY_TOKEN: 'verify-me',
    WEBHOOK_SECRETS: 'garmin:gsecret,polar:psecret',
    PUBLIC_BASE_URL: 'https://api.test',
  });
  p = await signup(ctx, 'Saat Sever', 'gok');
});
afterAll(async () => ctx.close());

describe('entegrasyonlar', () => {
  it('liste: tüm kaynaklar, bağlı değil', async () => {
    const l = await get<IntegrationDto[]>(ctx, p, '/v1/integrations');
    expect(l.map((x) => x.provider)).toEqual(['apple_watch', 'wear_os', 'garmin', 'coros', 'suunto', 'polar', 'strava', 'apple_health', 'health_connect']);
    expect(l.every((x) => !x.connected)).toBe(true);
  });

  it('cihaz kaynağı bağlanır; bilinmeyen kaynak 404; yapılandırılmamış 501', async () => {
    const r = await send(ctx, p, 'POST', '/v1/integrations/apple_watch/connect', { device: 'Apple Watch Series 10' });
    expect(r.json()).toEqual({ url: null });
    expect((await send(ctx, p, 'POST', '/v1/integrations/nokia/connect', {})).statusCode).toBe(404);
    expect((await send(ctx, p, 'POST', '/v1/integrations/coros/connect', {})).statusCode).toBe(501);
    const l = await get<IntegrationDto[]>(ctx, p, '/v1/integrations');
    expect(l.find((x) => x.provider === 'apple_watch')).toMatchObject({ connected: true, device: 'Apple Watch Series 10', importEnabled: true });
  });

  it('Strava: OAuth bağlantısı, web kancasından koşu alma, gönderme ayrı açılır', async () => {
    const c = await send(ctx, p, 'POST', '/v1/integrations/strava/connect', {});
    const url = new URL(c.json().url);
    expect(url.host).toBe('www.strava.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.test/v1/integrations/strava/callback');
    const state = url.searchParams.get('state')!;
    ctx.fetchMock.on('https://www.strava.com/oauth/token', () => Response.json({ access_token: 'at', refresh_token: 'rt', expires_at: Math.floor(ctx.clock.now() / 1000) + 3600, athlete: { id: 777 } }));
    const cb = await ctx.app.inject({ method: 'GET', url: `/v1/integrations/strava/callback?state=${state}&code=abc` });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe('hexrun://integrations?connected=strava');
    // Aynı state ikinci kez geçersiz
    const cb2 = await ctx.app.inject({ method: 'GET', url: `/v1/integrations/strava/callback?state=${state}&code=abc` });
    expect(cb2.statusCode).toBe(401);
    const err = await ctx.app.inject({ method: 'GET', url: `/v1/integrations/strava/callback?error=access_denied` });
    expect(err.headers.location).toBe('hexrun://integrations?error=strava');

    // Web kancası doğrulaması
    const v = await ctx.app.inject({ method: 'GET', url: '/v1/integrations/strava/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=xyz' });
    expect(v.json()).toEqual({ 'hub.challenge': 'xyz' });
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/integrations/strava/webhook?hub.mode=subscribe&hub.verify_token=no' })).statusCode).toBe(403);

    const pts = loopRun(MODA, 120, T0 - 2 * 3_600_000);
    const t0 = pts[0]!.t;
    ctx.clock.set(pts.at(-1)!.t + 600_000);
    ctx.fetchMock.on(/activities\/555$/, () => Response.json({ sport_type: 'Run', start_date: new Date(t0).toISOString(), device_name: 'Garmin Forerunner 265' }));
    ctx.fetchMock.on(/activities\/555\/streams/, () =>
      Response.json({ latlng: { data: pts.map((x) => [x.lat, x.lng]) }, time: { data: pts.map((x) => Math.round((x.t - t0) / 1000)) } }),
    );
    const { stravaEvent } = await import('../src/game/integrations.js');
    const s = (await stravaEvent(ctx.deps, { object_type: 'activity', aspect_type: 'create', object_id: 555, owner_id: 777 })) as RunSummary;
    expect(s.source).toBe('strava');
    expect(s.status).toBe('applied');
    expect(s.loops[0]!.newCells).toBeGreaterThan(100);
    // Aynı etkinlik tekrar gelirse idempotent
    const again = (await stravaEvent(ctx.deps, { object_type: 'activity', aspect_type: 'create', object_id: 555, owner_id: 777 })) as RunSummary;
    expect(again.id).toBe(s.id);
    // Koşu dışı ve bilinmeyen sahip yok sayılır
    ctx.fetchMock.on(/activities\/556$/, () => Response.json({ sport_type: 'Ride', start_date: new Date(t0).toISOString() }));
    expect(await stravaEvent(ctx.deps, { object_type: 'activity', aspect_type: 'create', object_id: 556, owner_id: 777 })).toBeNull();
    expect(await stravaEvent(ctx.deps, { object_type: 'activity', aspect_type: 'create', object_id: 555, owner_id: 1 })).toBeNull();
    expect(await stravaEvent(ctx.deps, { object_type: 'athlete' })).toBeNull();
    const hook = await ctx.app.inject({ method: 'POST', url: '/v1/integrations/strava/webhook', payload: { object_type: 'athlete' } });
    expect(hook.statusCode).toBe(200);

    // Gönderme ayrı açılır; açıkken HexRun koşusu GPX olarak yüklenir
    const l = (await send(ctx, p, 'PATCH', '/v1/integrations/strava', { exportEnabled: true })).json<IntegrationDto[]>();
    expect(l.find((x) => x.provider === 'strava')).toMatchObject({ connected: true, importEnabled: true, exportEnabled: true, device: 'Garmin Forerunner 265' });
    let uploaded = 0;
    ctx.fetchMock.on('https://www.strava.com/api/v3/uploads', () => {
      uploaded++;
      return Response.json({ id: 1 });
    });
    const { exportToStrava } = await import('../src/game/integrations.js');
    const pts2 = loopRun(MODA, 60, ctx.clock.now() + 3_600_000);
    ctx.clock.set(pts2.at(-1)!.t + 1000);
    const r2 = await send(ctx, p, 'POST', '/v1/runs', { clientRunId: 'phone-run-0001', source: 'phone', points: pts2 });
    expect(await exportToStrava(ctx.deps, p.id, r2.json<RunSummary>().id)).toBe(true);
    expect(uploaded).toBeGreaterThanOrEqual(1);
    // Süresi dolan jeton yenilenir
    ctx.clock.advance(2 * 3_600_000);
    expect(await exportToStrava(ctx.deps, p.id, r2.json<RunSummary>().id)).toBe(true);
    expect(ctx.fetchMock.calls.filter((c) => c.url === 'https://www.strava.com/oauth/token').length).toBeGreaterThanOrEqual(2);
  });

  it('imzalı saat web kancası: hesap bağlama ve koşu alma', async () => {
    const c = await send(ctx, p, 'POST', '/v1/integrations/garmin/connect', {});
    const state = new URL(c.json().url).searchParams.get('state')!;
    const linkBody = JSON.stringify({ state, externalUserId: 'garmin-user-9' });
    const bad = await ctx.app.inject({ method: 'POST', url: '/v1/integrations/garmin/link', payload: linkBody, headers: { 'content-type': 'application/json', 'x-hexrun-signature': 'nope' } });
    expect(bad.statusCode).toBe(401);
    const ok = await ctx.app.inject({ method: 'POST', url: '/v1/integrations/garmin/link', payload: linkBody, headers: { 'content-type': 'application/json', 'x-hexrun-signature': hmac('gsecret', linkBody) } });
    expect(ok.statusCode).toBe(204);

    // Eski koşu (24 saatten eski) yalnız istatistiğe
    const old = loopRun({ lat: MODA.lat + 0.02, lng: MODA.lng }, 100, ctx.clock.now() - 2 * D);
    const body = JSON.stringify({ externalUserId: 'garmin-user-9', externalId: 'act-1', device: 'Forerunner 265', points: old });
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/integrations/garmin/webhook', payload: body, headers: { 'content-type': 'application/json', 'x-hexrun-signature': hmac('gsecret', body) } });
    expect(r.json()).toMatchObject({ ok: true, status: 'stats_only' });
    const tampered = await ctx.app.inject({ method: 'POST', url: '/v1/integrations/garmin/webhook', payload: body + ' ', headers: { 'content-type': 'application/json', 'x-hexrun-signature': hmac('gsecret', body) } });
    expect(tampered.statusCode).toBe(401);
    const unknown = JSON.stringify({ externalUserId: 'nobody', externalId: 'x', points: old });
    const u = await ctx.app.inject({ method: 'POST', url: '/v1/integrations/polar/webhook', payload: unknown, headers: { 'content-type': 'application/json', 'x-hexrun-signature': hmac('psecret', unknown) } });
    expect(u.json()).toMatchObject({ ok: true, status: 'ignored' });
    expect((await ctx.app.inject({ method: 'POST', url: '/v1/integrations/suunto/webhook', payload: '{}', headers: { 'content-type': 'application/json' } })).statusCode).toBe(501);
    expect((await ctx.app.inject({ method: 'POST', url: '/v1/integrations/xx/webhook', payload: '{}', headers: { 'content-type': 'application/json' } })).statusCode).toBe(404);
  });

  it('bağlantıyı kaldır', async () => {
    expect((await send(ctx, p, 'DELETE', '/v1/integrations/strava')).statusCode).toBe(204);
    expect((await send(ctx, p, 'PATCH', '/v1/integrations/strava', { importEnabled: false })).statusCode).toBe(404);
  });
});
