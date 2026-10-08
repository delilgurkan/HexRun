import { createServer as createH2 } from 'node:http2';
import { createServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { ApnsPushSender, FcmPushSender, RoutingPushSender, inferProvider } from '../src/lib/push-native.js';
import { MemoryPushSender } from '../src/lib/push.js';
import { dispatchPush } from '../src/game/notifications.js';
import { send, setup, signup, type Ctx } from './helpers.js';

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

describe('APNs (HTTP/2, ES256 jeton)', () => {
  const seen: Array<{ path: string; headers: Record<string, unknown>; body: string }> = [];
  const server = createH2();
  let origin = '';
  beforeAll(async () => {
    server.on('stream', (stream, headers) => {
      let body = '';
      stream.on('data', (c) => (body += c));
      stream.on('end', () => {
        const path = String(headers[':path']);
        seen.push({ path, headers, body });
        if (path.endsWith('/gone')) {
          stream.respond({ ':status': 410, 'content-type': 'application/json' });
          stream.end(JSON.stringify({ reason: 'Unregistered' }));
        } else if (path.endsWith('/bad')) {
          stream.respond({ ':status': 400 });
          stream.end(JSON.stringify({ reason: 'BadDeviceToken' }));
        } else {
          stream.respond({ ':status': 200 });
          stream.end();
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('başlıklar, gövde, geçersiz jeton', async () => {
    const s = new ApnsPushSender({ keyId: 'KEY123', teamId: 'TEAM99', key: ec, topic: 'co.hexrun.app', production: true, endpoint: origin });
    const r = await s.send([
      { to: 'abc', title: 'Selin’le düello', body: '17 petek', data: { kind: 'duel_started', url: 'hexrun://run?defend=1' }, priority: 'high' },
      { to: 'gone', title: 't', body: 'b' },
      { to: 'bad', title: 't', body: 'b' },
    ]);
    expect(r).toEqual([{ ok: true }, { ok: false, error: 'Unregistered', invalidToken: true }, { ok: false, error: 'BadDeviceToken', invalidToken: true }]);
    const first = seen.find((x) => x.path === '/3/device/abc')!;
    expect(first.headers['apns-topic']).toBe('co.hexrun.app');
    expect(first.headers['apns-priority']).toBe('10');
    const jwt = String(first.headers.authorization).replace('bearer ', '');
    expect(decodeProtectedHeader(jwt)).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
    expect(decodeJwt(jwt).iss).toBe('TEAM99');
    const body = JSON.parse(first.body);
    expect(body.aps.alert).toEqual({ title: 'Selin’le düello', body: '17 petek' });
    expect(body.url).toBe('hexrun://run?defend=1');
    // Jeton önbelleği: ikinci gönderimde aynı JWT
    await s.send([{ to: 'abc', title: 't', body: 'b' }]);
    expect(seen.at(-1)!.headers.authorization).toBe(first.headers.authorization);
    s.close();
  });

  it('bağlantı hatası çökmez', async () => {
    const s = new ApnsPushSender({ keyId: 'K', teamId: 'T', key: ec, topic: 'x', production: false, endpoint: 'http://127.0.0.1:1' });
    const [r] = await s.send([{ to: 'a', title: 't', body: 'b' }]);
    expect(r!.ok).toBe(false);
  });
});

describe('FCM HTTP v1', () => {
  let base = '';
  const calls: Array<{ url: string; body: string; auth?: string }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push({ url: req.url!, body, ...(req.headers.authorization ? { auth: req.headers.authorization } : {}) });
      if (req.url === '/token') return res.end(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }));
      const msg = JSON.parse(body).message;
      if (msg.token === 'dead') {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: { status: 'NOT_FOUND' } }));
      }
      res.end(JSON.stringify({ name: 'projects/p/messages/1' }));
    });
  });
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('OAuth jetonu, mesaj biçimi, dizgi veri, geçersiz jeton', async () => {
    const s = new FcmPushSender({ projectId: 'hexrun-prod', clientEmail: 'push@hexrun.iam.gserviceaccount.com', privateKey: rsa, tokenUrl: `${base}/token`, sendUrl: `${base}/send` });
    const r = await s.send([
      { to: 'tok1', title: 'Başlık', body: 'Gövde', data: { url: 'hexrun://notifications', id: 'n1', nested: { a: 1 } }, priority: 'high' },
      { to: 'dead', title: 't', body: 'b' },
    ]);
    expect(r).toEqual([{ ok: true }, { ok: false, error: 'NOT_FOUND', invalidToken: true }]);
    const tokenCall = calls.find((c) => c.url === '/token')!;
    const assertion = new URLSearchParams(tokenCall.body).get('assertion')!;
    expect(decodeJwt(assertion)).toMatchObject({ iss: 'push@hexrun.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/firebase.messaging' });
    const sent = JSON.parse(calls.find((c) => c.url === '/send')!.body).message;
    expect(sent).toMatchObject({ token: 'tok1', notification: { title: 'Başlık', body: 'Gövde' }, android: { priority: 'HIGH' } });
    expect(sent.data).toEqual({ url: 'hexrun://notifications', id: 'n1', nested: '{"a":1}' });
    expect(calls.find((c) => c.url === '/send')!.auth).toBe('Bearer ya29.test');
    await s.send([{ to: 'tok2', title: 't', body: 'b' }]);
    expect(calls.filter((c) => c.url === '/token')).toHaveLength(1);
    const sa = FcmPushSender.fromServiceAccountJson(JSON.stringify({ project_id: 'p', client_email: 'e', private_key: rsa }));
    expect(sa).toBeInstanceOf(FcmPushSender);
  });

  it('OAuth başarısızsa tüm mesajlar hata döner', async () => {
    const s = new FcmPushSender({ projectId: 'p', clientEmail: 'e', privateKey: rsa, tokenUrl: `${base}/nope-token`, sendUrl: `${base}/send` }, async () => new Response('x', { status: 401 }));
    expect(await s.send([{ to: 'a', title: 't', body: 'b' }])).toEqual([{ ok: false, error: 'fcm_oauth_401' }]);
  });
});

describe('yönlendirme ve sağlayıcı çıkarımı', () => {
  it('inferProvider', () => {
    expect(inferProvider('ExponentPushToken[abc]', 'ios')).toBe('expo');
    expect(inferProvider('a1b2c3', 'ios')).toBe('apns');
    expect(inferProvider('fcm-token', 'android')).toBe('fcm');
    expect(inferProvider('x', 'android', 'expo')).toBe('expo');
  });
  it('RoutingPushSender sağlayıcıya göre dağıtır, eksik sağlayıcıyı raporlar', async () => {
    const a = new MemoryPushSender();
    const f = new MemoryPushSender();
    const r = await new RoutingPushSender({ apns: a, fcm: f }).send([
      { to: 'i1', title: 't', body: 'b', provider: 'apns' },
      { to: 'a1', title: 't', body: 'b', provider: 'fcm' },
      { to: 'e1', title: 't', body: 'b', provider: 'expo' },
    ]);
    expect(r).toEqual([{ ok: true }, { ok: true }, { ok: false, error: 'expo_not_configured' }]);
    expect(a.sent.map((m) => m.to)).toEqual(['i1']);
    expect(f.sent.map((m) => m.to)).toEqual(['a1']);
  });
});

describe('uçtan uca: jeton kaydı → push', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(async () => ctx.close());
  it('iOS jetonu apns, Android jetonu fcm olarak gider; derin bağlantı yükte', async () => {
    const ios = await signup(ctx, 'Elma Koşucu', 'keh');
    const and = await signup(ctx, 'Robot Koşucu', 'gok');
    expect((await send(ctx, ios, 'PUT', '/v1/me/push-token', { token: 'a'.repeat(64), platform: 'ios' })).statusCode).toBe(204);
    expect((await send(ctx, and, 'PUT', '/v1/me/push-token', { token: 'f'.repeat(160), platform: 'android', provider: 'fcm' })).statusCode).toBe(204);
    for (const u of [ios, and]) {
      await ctx.db.query(
        `INSERT INTO notifications (id, user_id, kind, category, title, body, data, created_at, push, push_after) VALUES (gen_random_uuid(), $1, 'duel_started', 'siege', 't', 'b', '{"action":{"deeplink":"hexrun://run?defend=x"}}', $2, true, $2)`,
        [u.id, new Date(ctx.clock.now())],
      );
    }
    const before = ctx.push.sent.length;
    await dispatchPush(ctx.deps);
    const sent = ctx.push.sent.slice(before);
    expect(sent.map((m) => m.provider).sort()).toEqual(['apns', 'fcm']);
    expect(sent.every((m) => m.data?.url === 'hexrun://run?defend=x')).toBe(true);
  });
});
