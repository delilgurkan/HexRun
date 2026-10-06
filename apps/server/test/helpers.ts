import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWK } from 'jose';
import { circleTrack, destination, type LatLng, type TrackPoint } from '@hexrun/core';
import type { FastifyInstance } from 'fastify';
import type { AuthResponse, RunSummary } from '@hexrun/contracts';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Db } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { FakeClock } from '../src/lib/clock.js';
import { MemoryMailer } from '../src/lib/mailer.js';
import { MemoryPushSender } from '../src/lib/push.js';
import { createOidcVerifier } from '../src/auth/oidc.js';
import type { Deps } from '../src/deps.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://hexrun:hexrun@localhost:5432/hexrun_test';
export const MODA: LatLng = { lat: 40.9819, lng: 29.0254 };
/** 2026-10-05 Pazartesi 12:00 İstanbul. */
export const T0 = Date.parse('2026-10-05T09:00:00Z');
export const H = 3_600_000;
export const D = 24 * H;

export interface Ctx {
  app: FastifyInstance;
  deps: Deps;
  db: Db;
  clock: FakeClock;
  mailer: MemoryMailer;
  push: MemoryPushSender;
  keys: { apple: CryptoKey; google: CryptoKey; jwks: { keys: JWK[] } };
  fetchMock: FetchMock;
  close(): Promise<void>;
}

export type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
export class FetchMock {
  handlers: Array<{ match: (u: string) => boolean; h: FetchHandler }> = [];
  calls: Array<{ url: string; init?: RequestInit }> = [];
  on(match: string | RegExp, h: FetchHandler) {
    this.handlers.push({ match: (u) => (typeof match === 'string' ? u.startsWith(match) : match.test(u)), h });
  }
  fn: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    this.calls.push({ url, ...(init ? { init } : {}) });
    const h = this.handlers.find((x) => x.match(url));
    if (!h) return new Response('not mocked', { status: 599 });
    return h.h(url, init);
  }) as typeof fetch;
}

export async function setup(env: Record<string, string> = {}): Promise<Ctx> {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    GOOGLE_CLIENT_IDS: 'google-client',
    APPLE_CLIENT_IDS: 'co.hexrun.app',
    ADMIN_EMAILS: 'admin@hexrun.co',
    RATE_LIMIT_PER_MIN: '100000',
    AUTH_RATE_LIMIT_PER_MIN: '100000',
    RUN_RATE_LIMIT_PER_MIN: '100000',
    ...env,
  } as NodeJS.ProcessEnv);
  const db = createPool(TEST_DB, 10);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  const apple = await generateKeyPair('RS256');
  const google = await generateKeyPair('RS256');
  const aj = { ...(await exportJWK(apple.publicKey)), kid: 'apple1', alg: 'RS256' };
  const gj = { ...(await exportJWK(google.publicKey)), kid: 'google1', alg: 'RS256' };
  const clock = new FakeClock(T0);
  const mailer = new MemoryMailer();
  const push = new MemoryPushSender();
  const fetchMock = new FetchMock();
  const deps: Deps = {
    cfg,
    db,
    clock,
    mailer,
    push,
    oidc: createOidcVerifier({
      appleKeys: createLocalJWKSet({ keys: [aj] }),
      googleKeys: createLocalJWKSet({ keys: [gj] }),
      appleAudiences: ['co.hexrun.app'],
      googleAudiences: ['google-client'],
      now: () => clock.now(),
    }),
    fetch: fetchMock.fn,
  };
  const app = await buildApp(deps);
  await app.ready();
  return {
    app,
    deps,
    db,
    clock,
    mailer,
    push,
    keys: { apple: apple.privateKey as CryptoKey, google: google.privateKey as CryptoKey, jwks: { keys: [aj, gj] } },
    fetchMock,
    close: async () => {
      await app.close();
      await db.end();
    },
  };
}

export async function idToken(ctx: Ctx, kind: 'apple' | 'google', claims: Record<string, unknown>, aud?: string): Promise<string> {
  const now = Math.floor(ctx.clock.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: kind === 'apple' ? 'apple1' : 'google1' })
    .setIssuer(kind === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com')
    .setAudience(aud ?? (kind === 'apple' ? 'co.hexrun.app' : 'google-client'))
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(kind === 'apple' ? ctx.keys.apple : ctx.keys.google);
}

export interface Player {
  id: string;
  token: string;
  refresh: string;
  name: string;
}

let counter = 0;
export async function signup(ctx: Ctx, name: string, slot = 'keh', username?: string): Promise<Player> {
  const email = `${name.toLowerCase().replace(/[^a-z]/g, '')}${++counter}@test.hexrun.co`;
  const s = await ctx.app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email } });
  if (s.statusCode !== 200) throw new Error(s.body);
  const code = s.json<{ devCode: string }>().devCode;
  const v = await ctx.app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email, code } });
  const auth = v.json<AuthResponse>();
  const u = await ctx.app.inject({
    method: 'PATCH',
    url: '/v1/me',
    headers: { authorization: `Bearer ${auth.accessToken}` },
    payload: { username: username ?? `${name.toLowerCase().replace(/[^a-z]/g, '')}${counter}`, displayName: name, slot },
  });
  if (u.statusCode !== 200) throw new Error(u.body);
  return { id: auth.user.id, token: auth.accessToken, refresh: auth.refreshToken, name };
}

/** Erişim jetonu 15 dk yaşar; saat ilerledikçe yeniler. */
export async function renew(ctx: Ctx, p: Player): Promise<Player> {
  const r = await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: p.refresh } });
  if (r.statusCode !== 200) throw new Error(r.body);
  const a = r.json<AuthResponse>();
  p.token = a.accessToken;
  p.refresh = a.refreshToken;
  return p;
}

export function as(p: Player) {
  return { authorization: `Bearer ${p.token}` };
}

/** Bir merkez etrafında halka koşusu. */
export function loopRun(center: LatLng, radiusM: number, t0: number, speed = 3.2, laps = 1): TrackPoint[] {
  const n = Math.max(60, Math.round((2 * Math.PI * radiusM) / 7));
  let pts = circleTrack(center, radiusM, n, t0, speed);
  for (let l = 1; l < laps; l++) {
    const last = pts[pts.length - 1]!;
    pts = [...pts, ...circleTrack(center, radiusM, n, last.t + 1000, speed).slice(1)];
  }
  return pts;
}

export function lineRun(start: LatLng, bearing: number, lengthM: number, t0: number, speed = 3): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (let m = 0; m <= lengthM; m += 8) pts.push({ ...destination(start, bearing, m), t: t0 + Math.round((m / speed) * 1000), acc: 5 });
  return pts;
}

let runN = 0;
export async function run(ctx: Ctx, p: Player, points: TrackPoint[], extra: Record<string, unknown> = {}): Promise<RunSummary> {
  await renew(ctx, p);
  const r = await ctx.app.inject({
    method: 'POST',
    url: '/v1/runs',
    headers: as(p),
    payload: { clientRunId: `run-${++runN}-${Math.random().toString(36).slice(2, 8)}`, source: 'phone', points, ...extra },
  });
  if (r.statusCode !== 200) throw new Error(`${r.statusCode} ${r.body}`);
  return r.json<RunSummary>();
}

/** Koşu, saati koşunun bitişine taşıyarak gönderilir. */
export async function runAt(ctx: Ctx, p: Player, center: LatLng, radiusM: number, at: number, extra: Record<string, unknown> = {}): Promise<RunSummary> {
  const pts = loopRun(center, radiusM, at);
  ctx.clock.set(pts[pts.length - 1]!.t + 60_000);
  return run(ctx, p, pts, extra);
}

export async function get<T>(ctx: Ctx, p: Player, url: string): Promise<T> {
  await renew(ctx, p);
  const r = await ctx.app.inject({ method: 'GET', url, headers: as(p) });
  if (r.statusCode >= 300) throw new Error(`${url} ${r.statusCode} ${r.body}`);
  return r.json<T>();
}

export async function send(ctx: Ctx, p: Player, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) {
  await renew(ctx, p);
  return ctx.app.inject({ method, url, headers: as(p), ...(payload !== undefined ? { payload: payload as object } : {}) });
}
