import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthResponse } from '@hexrun/contracts';
import { as, idToken, setup, type Ctx } from './helpers.js';

let ctx: Ctx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

const post = (url: string, payload: unknown) => ctx.app.inject({ method: 'POST', url, payload: payload as object });

describe('e-posta kodu', () => {
  it('kod gönderir, doğrular, yeni hesap profil ister', async () => {
    const s = await post('/v1/auth/email/start', { email: ' Deniz@Example.com ' });
    expect(s.statusCode).toBe(200);
    expect(ctx.mailer.sent.at(-1)!.to).toBe('deniz@example.com');
    const code = s.json<{ devCode: string }>().devCode;
    expect(ctx.mailer.sent.at(-1)!.subject).toContain(code);
    const v = await post('/v1/auth/email/verify', { email: 'deniz@example.com', code });
    expect(v.statusCode).toBe(200);
    const a = v.json<AuthResponse>();
    expect(a.needsProfile).toBe(true);
    expect(a.user.newbieDaysLeft).toBe(14);
    expect(a.user.slot).toBe('keh');
    // Kod tek kullanımlık
    expect((await post('/v1/auth/email/verify', { email: 'deniz@example.com', code })).statusCode).toBe(401);
  });

  it('geçersiz e-posta 400; 1 dk içinde tekrar 429; saatte en çok 5', async () => {
    expect((await post('/v1/auth/email/start', { email: 'yok' })).statusCode).toBe(400);
    expect((await post('/v1/auth/email/start', { email: 'a@b.co' })).statusCode).toBe(200);
    expect((await post('/v1/auth/email/start', { email: 'a@b.co' })).statusCode).toBe(429);
    for (let i = 0; i < 4; i++) {
      ctx.clock.advance(61_000);
      expect((await post('/v1/auth/email/start', { email: 'a@b.co' })).statusCode).toBe(200);
    }
    ctx.clock.advance(61_000);
    expect((await post('/v1/auth/email/start', { email: 'a@b.co' })).statusCode).toBe(429);
    ctx.clock.advance(3_600_000);
    expect((await post('/v1/auth/email/start', { email: 'a@b.co' })).statusCode).toBe(200);
  });

  it('5 hatalı denemeden sonra kod kilitlenir; süresi dolan kod reddedilir', async () => {
    ctx.clock.advance(61_000);
    const s = await post('/v1/auth/email/start', { email: 'brute@x.co' });
    const code = s.json<{ devCode: string }>().devCode;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await post('/v1/auth/email/verify', { email: 'brute@x.co', code: wrong })).statusCode).toBe(401);
    expect((await post('/v1/auth/email/verify', { email: 'brute@x.co', code })).statusCode).toBe(429);
    ctx.clock.advance(61_000);
    const s2 = await post('/v1/auth/email/start', { email: 'brute@x.co' });
    ctx.clock.advance(11 * 60_000);
    expect((await post('/v1/auth/email/verify', { email: 'brute@x.co', code: s2.json<{ devCode: string }>().devCode })).statusCode).toBe(401);
    expect((await post('/v1/auth/email/verify', { email: 'brute@x.co', code: 'abc' })).statusCode).toBe(400);
  });

  it('yönetici e-postası admin rolü alır', async () => {
    ctx.clock.advance(61_000);
    const s = await post('/v1/auth/email/start', { email: 'admin@hexrun.co' });
    const v = await post('/v1/auth/email/verify', { email: 'admin@hexrun.co', code: s.json<{ devCode: string }>().devCode });
    const tok = v.json<AuthResponse>().accessToken;
    const m = await ctx.app.inject({ method: 'GET', url: '/v1/admin/metrics', headers: { authorization: `Bearer ${tok}` } });
    expect(m.statusCode).toBe(200);
    expect(m.json()).toHaveProperty('reviewQueue');
  });
});

describe('Apple ve Google', () => {
  it('Apple ile yeni hesap; aynı sub ile aynı hesap', async () => {
    const t = await idToken(ctx, 'apple', { sub: 'apple-1', email: 'x@privaterelay.appleid.com', email_verified: 'true' });
    const a = await post('/v1/auth/apple', { identityToken: t, fullName: 'Ece Yıldız' });
    expect(a.statusCode).toBe(200);
    const u1 = a.json<AuthResponse>().user;
    expect(u1.displayName).toBe('Ece Yıldız');
    expect(u1.initials).toBe('EY');
    const b = await post('/v1/auth/apple', { identityToken: await idToken(ctx, 'apple', { sub: 'apple-1' }) });
    expect(b.json<AuthResponse>().user.id).toBe(u1.id);
  });

  it('yanlış hedef kitle ya da imza reddedilir', async () => {
    expect((await post('/v1/auth/apple', { identityToken: await idToken(ctx, 'apple', { sub: 's' }, 'other.app') })).statusCode).toBe(401);
    expect((await post('/v1/auth/apple', { identityToken: await idToken(ctx, 'google', { sub: 's' }, 'co.hexrun.app') })).statusCode).toBe(401);
    expect((await post('/v1/auth/google', { idToken: 'not-a-jwt-token' })).statusCode).toBe(401);
  });

  it('Google doğrulanmış e-postayla var olan hesaba bağlanır', async () => {
    const s = await post('/v1/auth/email/start', { email: 'burak@example.com' });
    const v = await post('/v1/auth/email/verify', { email: 'burak@example.com', code: s.json<{ devCode: string }>().devCode });
    const id = v.json<AuthResponse>().user.id;
    const g = await post('/v1/auth/google', { idToken: await idToken(ctx, 'google', { sub: 'g-1', email: 'burak@example.com', email_verified: true, name: 'Burak' }) });
    expect(g.json<AuthResponse>().user.id).toBe(id);
    // Doğrulanmamış e-posta bağlanmaz
    const g2 = await post('/v1/auth/google', { idToken: await idToken(ctx, 'google', { sub: 'g-2', email: 'burak@example.com', email_verified: false }) });
    expect(g2.json<AuthResponse>().user.id).not.toBe(id);
    expect(g2.json<AuthResponse>().user.email).toBeNull();
  });
});

describe('jetonlar', () => {
  it('yenileme döndürülür; eski jeton tekrar kullanılırsa aile iptal edilir', async () => {
    ctx.clock.advance(61_000);
    const s = await post('/v1/auth/email/start', { email: 'rot@x.co' });
    const a = (await post('/v1/auth/email/verify', { email: 'rot@x.co', code: s.json<{ devCode: string }>().devCode })).json<AuthResponse>();
    const r1 = await post('/v1/auth/refresh', { refreshToken: a.refreshToken });
    expect(r1.statusCode).toBe(200);
    const b = r1.json<AuthResponse>();
    expect(b.refreshToken).not.toBe(a.refreshToken);
    // Eski jeton tekrar → çalınmış say, aile iptal
    expect((await post('/v1/auth/refresh', { refreshToken: a.refreshToken })).statusCode).toBe(401);
    expect((await post('/v1/auth/refresh', { refreshToken: b.refreshToken })).statusCode).toBe(401);
  });

  it('erişim jetonu süresi dolar; çıkış yenilemeyi iptal eder', async () => {
    ctx.clock.advance(61_000);
    const s = await post('/v1/auth/email/start', { email: 'exp@x.co' });
    const a = (await post('/v1/auth/email/verify', { email: 'exp@x.co', code: s.json<{ devCode: string }>().devCode })).json<AuthResponse>();
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${a.accessToken}` } })).statusCode).toBe(200);
    ctx.clock.advance(16 * 60_000);
    const r = await ctx.app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${a.accessToken}` } });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toEqual({ error: { code: 'unauthorized', message: 'Oturum süresi doldu.' } });
    expect((await ctx.app.inject({ method: 'POST', url: '/v1/auth/logout', payload: { refreshToken: a.refreshToken } })).statusCode).toBe(204);
    expect((await post('/v1/auth/refresh', { refreshToken: a.refreshToken })).statusCode).toBe(401);
    ctx.clock.advance(61 * 86_400_000);
    expect((await post('/v1/auth/refresh', { refreshToken: 'x'.repeat(40) })).statusCode).toBe(401);
  });

  it('jetonsuz ve bozuk jetonlu istekler 401', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/me' })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer abc' } })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/me', headers: as({ token: 'x.y.z' } as never) })).statusCode).toBe(401);
  });
});

describe('genel', () => {
  it('sağlık, 404, bozuk JSON, doğrulama hatası biçimi', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ ok: true });
    expect((await ctx.app.inject({ method: 'GET', url: '/ready' })).json()).toEqual({ ok: true });
    expect((await ctx.app.inject({ method: 'GET', url: '/nope' })).json()).toEqual({ error: { code: 'not_found', message: 'Bulunamadı.' } });
    const bad = await ctx.app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: '{bad', headers: { 'content-type': 'application/json' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_json');
    const v = await post('/v1/auth/email/verify', { email: 1 });
    expect(v.json().error.code).toBe('validation');
  });
  it('bekleme listesi idempotent', async () => {
    expect((await post('/v1/waitlist', { email: 'w@x.co' })).statusCode).toBe(201);
    expect((await post('/v1/waitlist', { email: 'W@x.co', locale: 'en' })).statusCode).toBe(201);
    expect((await post('/v1/waitlist', { email: 'bad' })).statusCode).toBe(400);
    const n = await ctx.db.query('SELECT COUNT(*)::int n FROM waitlist');
    expect(n.rows[0].n).toBe(1);
  });
});
