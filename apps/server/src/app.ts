import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import type { ApiError, SubmitRunRequest } from '@hexrun/contracts';
import type { Deps } from './deps.js';
import { list } from './config.js';
import { HttpError, badRequest, forbidden, notFound, unauthorized } from './lib/errors.js';
import { verifyAccess } from './auth/tokens.js';
import * as auth from './auth/service.js';
import * as S from './routes/schemas.js';
import * as me from './game/me.js';
import * as social from './game/social.js';
import * as notif from './game/notifications.js';
import * as integ from './game/integrations.js';
import * as admin from './game/admin.js';
import { submitRun } from './game/runs.js';
import { activeEventsDto, firstLoop, getMap, getRegion } from './game/map.js';
import { cancelDuel, getDuel, listDuels, previewDuel, startDuel } from './game/duels.js';
import { normEmail } from './auth/service.js';
import { inferProvider } from './lib/push-native.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    role?: 'user' | 'admin';
    rawBody?: string;
  }
}

function cursorDate(c: string): Date {
  const n = Number(c);
  if (!/^\d{1,15}$/.test(c) || !Number.isFinite(n)) throw badRequest('validation', 'Geçersiz sayfa imleci.');
  return new Date(n);
}

const parse = <T extends ZodTypeAny>(schema: T, v: unknown): z.infer<T> => schema.parse(v);

export async function buildApp(d: Deps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: d.cfg.NODE_ENV === 'test' ? false : { level: d.cfg.LOG_LEVEL, redact: ['req.headers.authorization', 'body.points', 'body.refreshToken'] },
    bodyLimit: 8 * 1024 * 1024,
    trustProxy: (_addr: string, hop: number) => hop < d.cfg.TRUST_PROXY_HOPS,
    genReqId: () => crypto.randomUUID(),
  });

  // Ham gövde (web kancası imzaları için) + JSON.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const s = body as string;
    (req as FastifyRequest).rawBody = s;
    if (!s) return done(null, undefined);
    try {
      done(null, JSON.parse(s));
    } catch {
      done(badRequest('invalid_json', 'JSON gövdesi okunamadı.'), undefined);
    }
  });

  await app.register(compress, { global: true, threshold: 2048 });
  await app.register(helmet, { contentSecurityPolicy: false });
  const origins = list(d.cfg.CORS_ORIGINS);
  await app.register(cors, { origin: origins.includes('*') ? true : origins, credentials: false });
  await app.register(rateLimit, {
    max: d.cfg.RATE_LIMIT_PER_MIN,
    timeWindow: '1 minute',
    // Anahtar istemci IP'si: başlıkla değiştirilebilen bir değer sınırı atlatamaz.
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: () => ({ statusCode: 429, error: { code: 'rate_limited', message: 'Çok fazla istek. Biraz bekle.' } }),
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    let status = 500;
    let body: ApiError = { error: { code: 'internal', message: 'Beklenmeyen bir hata oldu.' } };
    if (err instanceof HttpError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } };
    } else if (err instanceof ZodError) {
      status = 400;
      body = { error: { code: 'validation', message: 'İstek geçersiz.', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } };
    } else if (typeof err === 'object' && err && 'statusCode' in err && typeof (err as { statusCode: number }).statusCode === 'number' && (err as { statusCode: number }).statusCode < 500) {
      status = (err as { statusCode: number }).statusCode;
      const e = err as { code?: string; message?: string; error?: { code: string; message: string } };
      body = e.error ? { error: e.error } : { error: { code: status === 429 ? 'rate_limited' : 'bad_request', message: e.message ?? 'İstek geçersiz.' } };
    } else {
      req.log.error({ err }, 'unhandled');
    }
    void reply.status(status).send(body);
  });
  app.setNotFoundHandler((_req, reply) => void reply.status(404).send({ error: { code: 'not_found', message: 'Bulunamadı.' } }));

  const authed = async (req: FastifyRequest) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw unauthorized();
    const c = await verifyAccess(d, h.slice(7));
    // Silinmiş hesabın hâlâ geçerli erişim jetonu 401 alır.
    const u = await d.db.query<{ role: 'user' | 'admin' }>('SELECT role FROM users WHERE id = $1', [c.sub]);
    if (!u.rows[0]) throw unauthorized('Hesap bulunamadı.');
    req.userId = c.sub;
    req.role = u.rows[0].role;
  };
  const adminOnly = async (req: FastifyRequest) => {
    await authed(req);
    if (req.role !== 'admin') throw forbidden();
  };
  const uid = (req: FastifyRequest) => req.userId!;
  const strict = { config: { rateLimit: { max: d.cfg.AUTH_RATE_LIMIT_PER_MIN, timeWindow: '1 minute' } } };

  /* Sağlık */
  app.get('/health', async () => ({ ok: true }));
  app.get('/ready', async (_req, reply) => {
    try {
      await d.db.query('SELECT 1');
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });

  /* Kimlik */
  app.post('/v1/auth/email/start', strict, async (req) => auth.startEmail(d, parse(S.email, req.body).email));
  app.post('/v1/auth/email/verify', strict, async (req) => {
    const b = parse(S.verify, req.body);
    return auth.verifyEmail(d, b.email, b.code);
  });
  app.post('/v1/auth/apple', strict, async (req) => {
    const b = parse(S.apple, req.body);
    return auth.appleLogin(d, b.identityToken, b.fullName);
  });
  app.post('/v1/auth/google', strict, async (req) => auth.googleLogin(d, parse(S.google, req.body).idToken));
  app.post('/v1/auth/refresh', { config: { rateLimit: { max: d.cfg.AUTH_RATE_LIMIT_PER_MIN * 3, timeWindow: '1 minute' } } }, async (req) => auth.refresh(d, parse(S.refresh, req.body).refreshToken));
  app.post('/v1/auth/logout', async (req, reply) => {
    await auth.logout(d, parse(S.refresh, req.body).refreshToken);
    return reply.status(204).send();
  });

  /* Profil */
  app.get('/v1/me', { preHandler: authed }, async (req) => me.getMe(d, uid(req)));
  app.patch('/v1/me', { preHandler: authed }, async (req) => me.updateMe(d, uid(req), parse(S.updateMe, req.body) as never));
  app.delete('/v1/me', { preHandler: authed }, async (req, reply) => {
    await me.deleteAccount(d, uid(req));
    return reply.status(204).send();
  });
  app.get('/v1/me/export', { preHandler: authed, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (req, reply) => {
    void reply.header('content-disposition', 'attachment; filename="hexrun-verilerim.json"');
    return me.exportData(d, uid(req));
  });
  app.get<{ Params: { name: string } }>('/v1/usernames/:name', { preHandler: authed }, async (req) => me.usernameAvailability(d, req.params.name, uid(req)));
  app.put('/v1/me/privacy', { preHandler: authed }, async (req) => {
    const b = parse(S.privacy, req.body);
    return me.setPrivacy(d, uid(req), b.home, b.radiusM);
  });
  app.put('/v1/me/push-token', { preHandler: authed }, async (req, reply) => {
    const b = parse(S.pushToken, req.body);
    // Bir cihaz jetonu tek hesaba bağlı olur.
    await d.db.query('UPDATE users SET push_token = NULL WHERE push_token = $1 AND id <> $2', [b.token, uid(req)]);
    await d.db.query('UPDATE users SET push_token = $2, push_platform = $3, push_provider = $4 WHERE id = $1', [uid(req), b.token, b.platform, inferProvider(b.token, b.platform, b.provider)]);
    return reply.status(204).send();
  });
  app.put('/v1/me/activity', { preHandler: authed }, async (req, reply) => {
    const b = parse(S.activity, req.body);
    await d.db.query('UPDATE users SET running_until = $2, last_active_at = $3 WHERE id = $1', [uid(req), b.running ? new Date(d.clock.now() + 4 * 3_600_000) : null, new Date(d.clock.now())]);
    return reply.status(204).send();
  });
  app.get('/v1/me/stats', { preHandler: authed }, async (req) => me.getStats(d, uid(req)));
  app.get('/v1/me/badges', { preHandler: authed }, async (req) => me.getBadges(d, uid(req)));
  app.put('/v1/me/insignia', { preHandler: authed }, async (req) => me.setInsignia(d, uid(req), parse(S.insignia, req.body).slots));
  app.post('/v1/me/shield', { preHandler: authed }, async (req) => me.activateShield(d, uid(req), parse(S.cells, req.body).cells));

  /* Harita */
  app.get<{ Querystring: { bbox?: string } }>('/v1/map', { preHandler: authed }, async (req) => {
    if (!req.query.bbox) throw badRequest('validation', 'bbox gerekli.');
    return getMap(d, uid(req), req.query.bbox);
  });
  app.get<{ Querystring: { cell?: string } }>('/v1/map/region', { preHandler: authed }, async (req) => {
    const cell = req.query.cell ?? '';
    if (!/^[0-9a-f]{15}$/.test(cell)) throw badRequest('validation', 'cell gerekli.');
    return getRegion(d, uid(req), cell);
  });
  app.get<{ Querystring: { lat?: string; lng?: string } }>('/v1/map/first-loop', { preHandler: authed }, async (req, reply) => {
    const r = await firstLoop(d, Number(req.query.lat), Number(req.query.lng));
    return r ?? reply.status(204).send();
  });

  /* Koşu */
  app.post('/v1/runs', { preHandler: authed, config: { rateLimit: { max: d.cfg.RUN_RATE_LIMIT_PER_MIN, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(S.submitRun, req.body) as SubmitRunRequest;
    const summary = await submitRun(d, uid(req), body);
    if (summary.status !== 'duplicate' && body.source !== 'strava') {
      void integ.exportToStrava(d, uid(req), summary.id).catch((e) => req.log.warn({ err: e }, 'strava export failed'));
    }
    return summary;
  });
  app.get<{ Querystring: { cursor?: string } }>('/v1/runs', { preHandler: authed }, async (req) => {
    const before = req.query.cursor ? cursorDate(req.query.cursor) : new Date(d.clock.now() + 86_400_000);
    const r = await d.db.query<{ id: string; source: string; started_at: Date; ended_at: Date; distance_m: number; duration_ms: number; status: string; gained_area_m2: number; loops: string }>(
      `SELECT r.id, r.source, r.started_at, r.ended_at, r.distance_m, r.duration_ms, r.status, r.gained_area_m2,
         (SELECT COUNT(*) FROM loops l WHERE l.run_id = r.id) loops
       FROM runs r WHERE r.user_id = $1 AND r.started_at < $2 ORDER BY r.started_at DESC LIMIT 30`,
      [uid(req), before],
    );
    const last = r.rows[r.rows.length - 1];
    return {
      items: r.rows.map((x) => ({
        id: x.id,
        source: x.source,
        startedAt: x.started_at.toISOString(),
        endedAt: x.ended_at.toISOString(),
        distanceM: Math.round(x.distance_m),
        durationMs: x.duration_ms,
        status: x.status,
        gainedAreaM2: Math.round(x.gained_area_m2),
        loops: Number(x.loops),
      })),
      nextCursor: r.rows.length === 30 && last ? String(last.started_at.getTime()) : null,
    };
  });
  app.get<{ Params: { id: string } }>('/v1/runs/:id', { preHandler: authed }, async (req) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound('Koşu bulunamadı.');
    const r = await d.db.query<{ summary: unknown }>('SELECT summary FROM runs WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
    if (!r.rows[0]?.summary) throw notFound('Koşu bulunamadı.');
    return r.rows[0].summary;
  });
  app.post<{ Params: { id: string } }>('/v1/runs/:id/note', { preHandler: authed }, async (req, reply) => {
    const b = parse(S.note, req.body);
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound('Koşu bulunamadı.');
    const r = await d.db.query('UPDATE runs SET note = $3 WHERE id = $1 AND user_id = $2', [req.params.id, uid(req), b.text]);
    if (!r.rowCount) throw notFound('Koşu bulunamadı.');
    return reply.status(204).send();
  });
  app.get<{ Params: { id: string } }>('/v1/runs/:id/share', { preHandler: authed }, async (req) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound('Koşu bulunamadı.');
    return me.shareCard(d, uid(req), req.params.id);
  });

  /* Düello */
  app.post('/v1/duels/preview', { preHandler: authed }, async (req) => previewDuel(d, uid(req), parse(S.cells, req.body).cells));
  app.post('/v1/duels', { preHandler: authed }, async (req, reply) => reply.status(201).send(await startDuel(d, uid(req), parse(S.cells, req.body).cells)));
  app.get('/v1/duels', { preHandler: authed }, async (req) => listDuels(d, uid(req)));
  app.get<{ Params: { id: string } }>('/v1/duels/:id', { preHandler: authed }, async (req) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound('Düello bulunamadı.');
    return getDuel(d, uid(req), req.params.id);
  });
  app.delete<{ Params: { id: string } }>('/v1/duels/:id', { preHandler: authed }, async (req, reply) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound('Düello bulunamadı.');
    await cancelDuel(d, uid(req), req.params.id);
    return reply.status(204).send();
  });

  /* Lig, takım, sosyal */
  app.get<{ Querystring: { scope?: string; period?: string } }>('/v1/league', { preHandler: authed }, async (req) => {
    const scope = req.query.scope === 'team' ? 'team' : 'individual';
    const period = req.query.period === 'month' ? 'month' : req.query.period === 'all' ? 'all' : 'week';
    return social.getLeague(d, uid(req), scope, period);
  });
  app.get('/v1/teams/mine', { preHandler: authed }, async (req, reply) => {
    const u = await d.db.query<{ team_id: string | null }>('SELECT team_id FROM users WHERE id = $1', [uid(req)]);
    const t = u.rows[0]?.team_id;
    return t ? social.getTeam(d, uid(req), t) : reply.status(204).send();
  });
  app.get<{ Params: { id: string } }>('/v1/teams/:id', { preHandler: authed }, async (req) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound('Takım bulunamadı.');
    return social.getTeam(d, uid(req), req.params.id);
  });
  app.post('/v1/teams', { preHandler: authed }, async (req, reply) => reply.status(201).send(await social.createTeam(d, uid(req), parse(S.team, req.body).name)));
  app.post('/v1/teams/join', { preHandler: authed }, async (req) => social.joinTeam(d, uid(req), parse(S.code, req.body).code));
  app.post('/v1/teams/leave', { preHandler: authed }, async (req, reply) => {
    await social.leaveTeam(d, uid(req));
    return reply.status(204).send();
  });
  app.get('/v1/friends', { preHandler: authed }, async (req) => social.getFriends(d, uid(req)));
  app.post('/v1/friends/accept', { preHandler: authed }, async (req) => social.acceptFriend(d, uid(req), parse(S.code, req.body).code));
  app.delete<{ Params: { id: string } }>('/v1/friends/:id', { preHandler: authed }, async (req, reply) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound();
    await social.removeFriend(d, uid(req), req.params.id);
    return reply.status(204).send();
  });
  app.get<{ Querystring: { cursor?: string } }>('/v1/feed', { preHandler: authed }, async (req) => {
    if (req.query.cursor) cursorDate(req.query.cursor);
    return social.getFeed(d, uid(req), req.query.cursor ?? null);
  });
  app.post<{ Params: { id: string } }>('/v1/feed/:id/clap', { preHandler: authed }, async (req) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound('Gönderi bulunamadı.');
    return social.clap(d, uid(req), req.params.id);
  });

  /* Bildirim, etkinlik */
  app.get<{ Querystring: { filter?: string; cursor?: string } }>('/v1/notifications', { preHandler: authed }, async (req) => {
    if (req.query.cursor) cursorDate(req.query.cursor);
    return notif.listNotifications(d, uid(req), req.query.filter ?? 'all', req.query.cursor ?? null);
  });
  app.post('/v1/notifications/read', { preHandler: authed }, async (req, reply) => {
    await notif.markRead(d, uid(req), parse(S.readNotifs, req.body ?? {}).ids);
    return reply.status(204).send();
  });
  app.get('/v1/events', { preHandler: authed }, async () => activeEventsDto(d.db, d.clock.now()));
  app.post<{ Params: { id: string } }>('/v1/events/:id/remind', { preHandler: authed }, async (req, reply) => {
    await notif.setReminder(d, uid(req), req.params.id, parse(S.remind, req.body).on);
    return reply.status(204).send();
  });

  /* Entegrasyonlar */
  app.get('/v1/integrations', { preHandler: authed }, async (req) => integ.listIntegrations(d, uid(req)));
  app.post<{ Params: { provider: string } }>('/v1/integrations/:provider/connect', { preHandler: authed }, async (req) => integ.connect(d, uid(req), req.params.provider, parse(S.connectBody, req.body)?.device));
  app.patch<{ Params: { provider: string } }>('/v1/integrations/:provider', { preHandler: authed }, async (req) => integ.patchIntegration(d, uid(req), req.params.provider, parse(S.integrationPatch, req.body)));
  app.delete<{ Params: { provider: string } }>('/v1/integrations/:provider', { preHandler: authed }, async (req, reply) => {
    await integ.disconnect(d, uid(req), req.params.provider);
    return reply.status(204).send();
  });
  app.get<{ Querystring: { state?: string; code?: string; error?: string } }>('/v1/integrations/strava/callback', async (req, reply) => {
    if (req.query.error || !req.query.state || !req.query.code) return reply.redirect('hexrun://integrations?error=strava');
    return reply.redirect(await integ.stravaCallback(d, req.query.state, req.query.code));
  });
  app.get<{ Querystring: Record<string, string> }>('/v1/integrations/strava/webhook', async (req, reply) => {
    if (req.query['hub.mode'] === 'subscribe' && d.cfg.STRAVA_VERIFY_TOKEN && req.query['hub.verify_token'] === d.cfg.STRAVA_VERIFY_TOKEN) {
      return { 'hub.challenge': req.query['hub.challenge'] };
    }
    return reply.status(403).send({ error: { code: 'forbidden', message: 'Doğrulama başarısız.' } });
  });
  app.post('/v1/integrations/strava/webhook', async (req, reply) => {
    // Strava 2 sn içinde yanıt bekler: işlemi arka planda yap.
    const ev = (req.body ?? {}) as { subscription_id?: number | string };
    if (d.cfg.STRAVA_SUBSCRIPTION_ID && String(ev.subscription_id) !== d.cfg.STRAVA_SUBSCRIPTION_ID) {
      return reply.status(403).send({ error: { code: 'forbidden', message: 'Abonelik tanınmadı.' } });
    }
    void integ.stravaEvent(d, ev as never).catch((e) => req.log.warn({ err: e }, 'strava event failed'));
    return reply.status(200).send({ ok: true });
  });
  app.post<{ Params: { provider: string } }>('/v1/integrations/:provider/webhook', async (req) => {
    const r = await integ.providerWebhook(d, req.params.provider, req.rawBody ?? '', req.headers['x-hexrun-signature'] as string | undefined);
    return { ok: true, runId: r?.id ?? null, status: r?.status ?? 'ignored' };
  });
  app.post<{ Params: { provider: string } }>('/v1/integrations/:provider/link', async (req, reply) => {
    const b = parse(S.linkBody, req.body);
    await integ.linkProviderAccount(d, req.params.provider, b.state, b.externalUserId, req.rawBody ?? '', req.headers['x-hexrun-signature'] as string | undefined);
    return reply.status(204).send();
  });

  /* Bekleme listesi (web sitesi) */
  app.post('/v1/waitlist', strict, async (req, reply) => {
    const b = parse(S.waitlist, req.body);
    await d.db.query('INSERT INTO waitlist (email, locale) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING', [normEmail(b.email), b.locale]);
    return reply.status(201).send({ ok: true });
  });

  /* Yönetim */
  app.get('/v1/admin/reviews', { preHandler: adminOnly }, async () => admin.listReviews(d));
  app.post<{ Params: { loopId: string } }>('/v1/admin/reviews/:loopId', { preHandler: adminOnly }, async (req) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.loopId)) throw notFound('Halka bulunamadı.');
    return admin.decideReview(d, uid(req), req.params.loopId, parse(S.decision, req.body).decision);
  });
  app.get('/v1/admin/metrics', { preHandler: adminOnly }, async () => admin.metrics(d));

  return app;
}

export type { FastifyReply };
