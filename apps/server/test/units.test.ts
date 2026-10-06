import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bfsTake, cellsInPolygon, circleTrack } from '@hexrun/core';
import { ExpoPushSender } from '../src/lib/push.js';
import { loadConfig } from '../src/config.js';
import { leagueRegionFor, regionName } from '../src/lib/regions.js';
import { withSuffix } from '../src/game/notify.js';
import { createOidcVerifier } from '../src/auth/oidc.js';
import { periodEnd, periodStart, roundedTimeLabel } from '../src/game/social.js';
import { isoWeek, normalizeUsername } from '../src/game/me.js';
import { D, H, MODA, T0, get, runAt, send, setup, signup, type Ctx } from './helpers.js';

describe('yardımcılar', () => {
  it('Türkçe ekler', () => {
    expect(withSuffix('Selin')).toBe("Selin'le");
    expect(withSuffix('Emre')).toBe("Emre'yle");
    expect(withSuffix('Kaan')).toBe("Kaan'la");
    expect(withSuffix('Burak Öztürk')).toBe("Burak Öztürk'le");
    expect(withSuffix('Ayşe Yılmaz')).toBe("Ayşe Yılmaz'la");
  });
  it('lig bölgeleri', () => {
    expect(leagueRegionFor(MODA)).toBe('kadikoy');
    expect(regionName('kadikoy')).toBe('Kadıköy');
    expect(leagueRegionFor({ lat: 52.52, lng: 13.405 })).toMatch(/^h5:/);
    expect(regionName('h5:xyz')).toBe('Yerel lig');
    expect(regionName(null)).toBe('Yerel lig');
  });
  it('dönemler ve zaman etiketleri', () => {
    const wed = Date.parse('2026-10-07T09:00:00Z');
    expect(periodStart('week', wed)).toBe('2026-10-05');
    expect(periodEnd('week', wed)).toBe('2026-10-12');
    expect(periodStart('month', wed)).toBe('2026-10-01');
    expect(periodEnd('month', Date.parse('2026-12-07T09:00:00Z'))).toBe('2027-01-01');
    expect(periodStart('all', wed)).toBeNull();
    expect(periodEnd('all', wed)).toBeNull();
    expect(roundedTimeLabel(wed - 10 * 60_000, wed)).toBe('Bu saat');
    expect(roundedTimeLabel(wed - 2 * H, wed)).toBe('2 sa önce');
    expect(roundedTimeLabel(wed - 30 * H, wed)).toBe('Dün');
    expect(roundedTimeLabel(wed - 3 * D, wed)).toBe('3 gün önce');
    expect(roundedTimeLabel(wed - 15 * D, wed)).toBe('2 hafta önce');
    expect(isoWeek(wed)).toBe('2026-10-05');
    expect(normalizeUsername('@ÇağrıÖz')).toBe('cagrioz');
  });
  it('üretimde varsayılan sırlar reddedilir', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), HASH_SECRET: 'y'.repeat(20) } as NodeJS.ProcessEnv).NODE_ENV).toBe('production');
  });
  it('Google yapılandırılmamışsa reddedilir', async () => {
    const v = createOidcVerifier({ appleKeys: (async () => { throw new Error('x'); }) as never, googleKeys: (async () => { throw new Error('x'); }) as never, appleAudiences: [], googleAudiences: [] });
    await expect(v.google('t')).rejects.toThrow(/yapılandırılmamış/);
  });
});

describe('Expo push gönderici', () => {
  let url = '';
  let mode: 'ok' | 'err' | 'http' = 'ok';
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const msgs = JSON.parse(body) as unknown[];
      if (mode === 'http') {
        res.statusCode = 500;
        return res.end('x');
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: msgs.map((_, i) => (mode === 'ok' && i === 0 ? { status: 'ok' } : { status: 'error', message: 'bad', details: { error: 'DeviceNotRegistered' } })) }));
    });
  });
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const a = server.address() as { port: number };
    url = `http://127.0.0.1:${a.port}/push`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('başarı, geçersiz jeton, HTTP hatası, ağ hatası', async () => {
    const s = new ExpoPushSender('tok', url);
    const r = await s.send([{ to: 'a', title: 't', body: 'b' }, { to: 'b', title: 't', body: 'b' }]);
    expect(r).toEqual([{ ok: true }, { ok: false, invalidToken: true, error: 'bad' }]);
    mode = 'http';
    expect((await s.send([{ to: 'a', title: 't', body: 'b' }]))[0]).toEqual({ ok: false, error: 'http_500' });
    const down = new ExpoPushSender(undefined, 'http://127.0.0.1:1/push');
    expect((await down.send([{ to: 'a', title: 't', body: 'b' }]))[0]!.ok).toBe(false);
  });
});

describe('kalkan ve düello iptali', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(async () => ctx.close());

  it('Kale Bekçisi kalkanı haftada bir; düello iptali yalnız saldırgana', async () => {
    const owner = await signup(ctx, 'Kale Sahibi', 'zum');
    const atk = await signup(ctx, 'Akıncı Bey', 'kir');
    await runAt(ctx, owner, MODA, 150, T0);
    const cells = bfsTake(cellsInPolygon(circleTrack(MODA, 60, 40, 0, 3)), 20);
    expect((await send(ctx, owner, 'POST', '/v1/me/shield', { cells })).json().error.code).toBe('insignia_required');
    await ctx.db.query(`UPDATE users SET insignia = '{kale-bekcisi}' WHERE id = $1`, [owner.id]);
    expect((await send(ctx, owner, 'POST', '/v1/me/shield', { cells: [cells[0]!, 'abc'] })).statusCode).toBe(400);
    expect((await send(ctx, owner, 'POST', '/v1/me/shield', { cells })).statusCode).toBe(200);
    expect((await send(ctx, owner, 'POST', '/v1/me/shield', { cells })).json().error.code).toBe('shield_weekly_limit');
    const d = await send(ctx, atk, 'POST', '/v1/duels', { cells });
    const id = d.json().id;
    expect((await send(ctx, owner, 'DELETE', `/v1/duels/${id}`)).statusCode).toBe(403);
    expect((await send(ctx, atk, 'DELETE', `/v1/duels/${id}`)).statusCode).toBe(204);
    expect((await send(ctx, atk, 'DELETE', `/v1/duels/${id}`)).statusCode).toBe(409);
    expect((await send(ctx, atk, 'DELETE', `/v1/duels/00000000-0000-0000-0000-000000000000`)).statusCode).toBe(404);
    expect((await send(ctx, atk, 'DELETE', `/v1/duels/nope`)).statusCode).toBe(404);
    const list = await get<{ attacking: Array<{ status: string }> }>(ctx, atk, '/v1/duels');
    expect(list.attacking[0]!.status).toBe('cancelled');
    // İptal edilen düellonun hakkı ve petekleri serbest kalır.
    expect((await send(ctx, atk, 'POST', '/v1/duels', { cells })).statusCode).toBe(201);
  });
});
