import type { AuthResponse, Me } from '@hexrun/contracts';
import { ApiClient } from '../api/client';
import { createApi } from '../api/endpoints';
import { ApiError } from '../api/errors';
import { memoryTokenStore } from '../api/tokens';

type Call = { url: string; init: RequestInit };

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const me = { id: 'u1', username: 'deniz' } as unknown as Me;
const auth = (n: number): AuthResponse => ({ accessToken: `a${n}`, refreshToken: `r${n}`, expiresIn: 900, user: me, needsProfile: false });

function setup(handler: (c: Call, i: number) => Response | Promise<Response>, now = () => 1_000_000) {
  const calls: Call[] = [];
  const tokens = memoryTokenStore({ accessToken: 'a0', refreshToken: 'r0', expiresAt: now() + 600_000 });
  const fetchImpl = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const c = { url: String(url), init: init ?? {} };
    calls.push(c);
    return handler(c, calls.length - 1);
  }) as unknown as typeof fetch;
  const onLogout = jest.fn();
  const client = new ApiClient({ baseUrl: 'https://api.test/', tokens, fetchImpl, onLogout, now, timeoutMs: 50 });
  return { client, api: createApi(client), calls, tokens, onLogout };
}

const authHeader = (c: Call) => (c.init.headers as Record<string, string>).Authorization;

describe('ApiClient', () => {
  it('Bearer jetonu ve /v1 taban yolunu kullanır, sorguyu kodlar', async () => {
    const { api, calls } = setup(() => json(200, { rows: [] }));
    await api.league('individual', 'week');
    expect(calls[0]!.url).toBe('https://api.test/v1/league?scope=individual&period=week');
    expect(authHeader(calls[0]!)).toBe('Bearer a0');
  });

  it('401 → jetonu bir kez yeniler ve isteği tekrarlar', async () => {
    const { api, calls, tokens } = setup((c) => {
      if (c.url.endsWith('/auth/refresh')) return json(200, auth(1));
      return authHeader(c) === 'Bearer a1' ? json(200, me) : json(401, { error: { code: 'unauthorized', message: 'x' } });
    });
    await expect(api.me.get()).resolves.toEqual(me);
    expect(calls.map((c) => c.url.replace('https://api.test/v1', ''))).toEqual(['/me', '/auth/refresh', '/me']);
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ refreshToken: 'r0' });
    expect((await tokens.get())?.accessToken).toBe('a1');
  });

  it('eşzamanlı 401lerde tek yenileme isteği', async () => {
    let refreshes = 0;
    const { api } = setup(async (c) => {
      if (c.url.endsWith('/auth/refresh')) {
        refreshes++;
        await new Promise((r) => setTimeout(r, 5));
        return json(200, auth(1));
      }
      return authHeader(c) === 'Bearer a1' ? json(200, me) : json(401, {});
    });
    await Promise.all([api.me.get(), api.me.stats(), api.me.badges()]);
    expect(refreshes).toBe(1);
  });

  it('yenileme reddedilirse çıkış yapar ve 401 atar', async () => {
    const { api, onLogout, tokens } = setup((c) => (c.url.endsWith('/auth/refresh') ? json(401, {}) : json(401, { error: { code: 'unauthorized', message: 'Oturum bitti' } })));
    await expect(api.me.get()).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(await tokens.get()).toBeNull();
  });

  it('yenilemeden sonra yine 401 → çıkış', async () => {
    const { api, onLogout } = setup((c) => (c.url.endsWith('/auth/refresh') ? json(200, auth(1)) : json(401, {})));
    await expect(api.me.get()).rejects.toBeInstanceOf(ApiError);
    expect(onLogout).toHaveBeenCalled();
  });

  it('süresi dolmak üzere olan jetonu önden yeniler', async () => {
    let t = 1_000_000;
    const { client, api, calls } = setup((c) => (c.url.endsWith('/auth/refresh') ? json(200, auth(2)) : json(200, me)), () => t);
    await client.tokens.set({ accessToken: 'old', refreshToken: 'r0', expiresAt: t + 10_000 });
    await api.me.get();
    expect(calls[0]!.url).toContain('/auth/refresh');
    expect(authHeader(calls[1]!)).toBe('Bearer a2');
    t += 1;
  });

  it('kimlik uçları jeton göndermez', async () => {
    const { api, calls } = setup(() => json(200, { sent: true, devCode: '123456' }));
    await expect(api.auth.emailStart('a@b.co')).resolves.toEqual({ sent: true, devCode: '123456' });
    expect(authHeader(calls[0]!)).toBeUndefined();
  });

  it('ApiError gövdesini çözer', async () => {
    const { api } = setup(() => json(409, { error: { code: 'duel_limit', message: 'Hak dolu' } }));
    await expect(api.duels.create({ cells: [] })).rejects.toMatchObject({ status: 409, code: 'duel_limit', message: 'Hak dolu', isRetryable: false });
  });

  it('204 → null', async () => {
    const { api } = setup(() => new Response(null, { status: 204 }));
    await expect(api.teams.mine()).resolves.toBeNull();
  });

  it('zaman aşımı ağ hatası olarak döner', async () => {
    const { api } = setup(
      (c) =>
        new Promise<Response>((_res, rej) => {
          c.init.signal?.addEventListener('abort', () => rej(new Error('aborted')));
        }),
    );
    await expect(api.events()).rejects.toMatchObject({ status: 0, code: 'timeout', isNetwork: true });
  });

  it('ağ hatası tekrar denenebilir', async () => {
    const { api } = setup(() => {
      throw new TypeError('Network request failed');
    });
    const err = await api.events().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isRetryable).toBe(true);
  });
});
