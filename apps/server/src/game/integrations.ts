import type { IntegrationDto, Provider, RunSummary, TrackPointDto } from '@hexrun/contracts';
import type { Deps } from '../deps.js';
import { list } from '../config.js';
import { hmac, randomToken, safeEqual } from '../lib/crypto.js';
import { HttpError, badRequest, notFound, unauthorized } from '../lib/errors.js';
import { submitRun } from './runs.js';

export const OAUTH_PROVIDERS: readonly Provider[] = ['garmin', 'coros', 'suunto', 'polar', 'strava'];
export const DEVICE_PROVIDERS = ['apple_watch', 'wear_os', 'apple_health', 'health_connect'] as const;
export type AnyProvider = Provider | (typeof DEVICE_PROVIDERS)[number];
export const ALL_PROVIDERS: readonly AnyProvider[] = ['apple_watch', 'wear_os', 'garmin', 'coros', 'suunto', 'polar', 'strava', 'apple_health', 'health_connect'];

export function isProvider(p: string): p is AnyProvider {
  return (ALL_PROVIDERS as readonly string[]).includes(p);
}

export async function listIntegrations(d: Deps, userId: string): Promise<IntegrationDto[]> {
  const rows = new Map(
    (await d.db.query<{ provider: string; import_enabled: boolean; export_enabled: boolean; last_sync_at: Date | null; device: string | null }>('SELECT provider, import_enabled, export_enabled, last_sync_at, device FROM integrations WHERE user_id = $1', [userId])).rows.map((r) => [r.provider, r]),
  );
  return ALL_PROVIDERS.map((p) => {
    const r = rows.get(p);
    return {
      provider: p,
      connected: !!r,
      importEnabled: r?.import_enabled ?? false,
      exportEnabled: r?.export_enabled ?? false,
      lastSyncAt: r?.last_sync_at?.toISOString() ?? null,
      device: r?.device ?? null,
    };
  });
}

export async function connect(d: Deps, userId: string, provider: string, device?: string): Promise<{ url: string | null }> {
  if (!isProvider(provider)) throw notFound('Bilinmeyen kaynak.');
  if ((DEVICE_PROVIDERS as readonly string[]).includes(provider)) {
    // Cihaz tarafı izinler uygulamada verilir; sunucu yalnız bağlantıyı kaydeder.
    await d.db.query(
      `INSERT INTO integrations (user_id, provider, device, import_enabled) VALUES ($1, $2, $3, true)
       ON CONFLICT (user_id, provider) DO UPDATE SET device = EXCLUDED.device`,
      [userId, provider, device?.slice(0, 80) ?? null],
    );
    return { url: null };
  }
  if (provider === 'strava') {
    if (!d.cfg.STRAVA_CLIENT_ID) throw new HttpError(501, 'not_configured', 'Strava bağlantısı henüz açık değil.');
    const state = randomToken(18);
    await d.db.query('INSERT INTO oauth_states (state, user_id, provider, expires_at) VALUES ($1, $2, $3, $4)', [state, userId, provider, new Date(d.clock.now() + 10 * 60_000)]);
    const u = new URL('https://www.strava.com/oauth/mobile/authorize');
    u.searchParams.set('client_id', d.cfg.STRAVA_CLIENT_ID);
    u.searchParams.set('redirect_uri', `${d.cfg.PUBLIC_BASE_URL}/v1/integrations/strava/callback`);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('approval_prompt', 'auto');
    u.searchParams.set('scope', 'activity:read_all,activity:write');
    u.searchParams.set('state', state);
    return { url: u.toString() };
  }
  // Garmin, Coros, Suunto, Polar: iş ortağı API'leri; adaptör servisi imzalı web kancasıyla koşu gönderir.
  if (!secretFor(d, provider)) throw new HttpError(501, 'not_configured', 'Bu saat bağlantısı henüz açık değil.');
  const state = randomToken(18);
  await d.db.query('INSERT INTO oauth_states (state, user_id, provider, expires_at) VALUES ($1, $2, $3, $4)', [state, userId, provider, new Date(d.clock.now() + 10 * 60_000)]);
  return { url: `${d.cfg.PUBLIC_BASE_URL}/connect/${provider}?state=${state}` };
}

export async function patchIntegration(d: Deps, userId: string, provider: string, body: { importEnabled?: boolean; exportEnabled?: boolean }): Promise<IntegrationDto[]> {
  if (!isProvider(provider)) throw notFound('Bilinmeyen kaynak.');
  const r = await d.db.query(
    'UPDATE integrations SET import_enabled = COALESCE($3, import_enabled), export_enabled = COALESCE($4, export_enabled) WHERE user_id = $1 AND provider = $2',
    [userId, provider, body.importEnabled ?? null, provider === 'strava' ? body.exportEnabled ?? null : null],
  );
  if (!r.rowCount) throw notFound('Bağlantı yok.');
  return listIntegrations(d, userId);
}

export async function disconnect(d: Deps, userId: string, provider: string): Promise<void> {
  await d.db.query('DELETE FROM integrations WHERE user_id = $1 AND provider = $2', [userId, provider]);
}

/* ─────────────── Strava ─────────────── */

interface StravaToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number };
}

export async function stravaCallback(d: Deps, state: string, code: string): Promise<string> {
  const s = (await d.db.query<{ user_id: string; expires_at: Date }>(`DELETE FROM oauth_states WHERE state = $1 AND provider = 'strava' RETURNING user_id, expires_at`, [state])).rows[0];
  if (!s || s.expires_at.getTime() < d.clock.now()) throw unauthorized('Bağlantı isteği geçersiz.');
  const res = await d.fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: d.cfg.STRAVA_CLIENT_ID, client_secret: d.cfg.STRAVA_CLIENT_SECRET, code, grant_type: 'authorization_code' }),
  });
  if (!res.ok) throw badRequest('strava_exchange', 'Strava bağlantısı tamamlanamadı.');
  const t = (await res.json()) as StravaToken;
  await d.db.query(
    `INSERT INTO integrations (user_id, provider, external_user, access_token, refresh_token, expires_at, import_enabled, export_enabled)
     VALUES ($1, 'strava', $2, $3, $4, $5, true, false)
     ON CONFLICT (user_id, provider) DO UPDATE SET external_user = EXCLUDED.external_user, access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token, expires_at = EXCLUDED.expires_at`,
    [s.user_id, String(t.athlete?.id ?? ''), t.access_token, t.refresh_token, new Date(t.expires_at * 1000)],
  );
  return 'hexrun://integrations?connected=strava';
}

async function stravaAccess(d: Deps, userId: string): Promise<string | null> {
  const r = (await d.db.query<{ access_token: string; refresh_token: string; expires_at: Date }>(`SELECT access_token, refresh_token, expires_at FROM integrations WHERE user_id = $1 AND provider = 'strava'`, [userId])).rows[0];
  if (!r) return null;
  if (r.expires_at.getTime() - 60_000 > d.clock.now()) return r.access_token;
  const res = await d.fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: d.cfg.STRAVA_CLIENT_ID, client_secret: d.cfg.STRAVA_CLIENT_SECRET, refresh_token: r.refresh_token, grant_type: 'refresh_token' }),
  });
  if (!res.ok) return null;
  const t = (await res.json()) as StravaToken;
  await d.db.query(`UPDATE integrations SET access_token = $2, refresh_token = $3, expires_at = $4 WHERE user_id = $1 AND provider = 'strava'`, [userId, t.access_token, t.refresh_token, new Date(t.expires_at * 1000)]);
  return t.access_token;
}

/** Strava web kancası: yeni koşu → akışları çek → aynı kurallardan geçir. */
export async function stravaEvent(d: Deps, ev: { object_type?: string; aspect_type?: string; object_id?: number; owner_id?: number }): Promise<RunSummary | null> {
  if (ev.object_type !== 'activity' || ev.aspect_type !== 'create' || !ev.object_id || !ev.owner_id) return null;
  const row = (await d.db.query<{ user_id: string; import_enabled: boolean }>(`SELECT user_id, import_enabled FROM integrations WHERE provider = 'strava' AND external_user = $1`, [String(ev.owner_id)])).rows[0];
  if (!row || !row.import_enabled) return null;
  const token = await stravaAccess(d, row.user_id);
  if (!token) return null;
  const act = await d.fetch(`https://www.strava.com/api/v3/activities/${ev.object_id}`, { headers: { authorization: `Bearer ${token}` } });
  if (!act.ok) return null;
  const a = (await act.json()) as { type?: string; sport_type?: string; start_date?: string; external_id?: string | null; device_name?: string };
  // HexRun'dan Strava'ya giden koşu geri alınmaz.
  if (a.external_id?.startsWith('hexrun-')) return null;
  if (!['Run', 'TrailRun', 'VirtualRun'].includes(a.sport_type ?? a.type ?? '')) return null;
  const st = await d.fetch(`https://www.strava.com/api/v3/activities/${ev.object_id}/streams?keys=latlng,time&key_by_type=true`, { headers: { authorization: `Bearer ${token}` } });
  if (!st.ok) return null;
  const streams = (await st.json()) as { latlng?: { data: Array<[number, number]> }; time?: { data: number[] } };
  const t0 = Date.parse(a.start_date ?? '');
  const ll = streams.latlng?.data ?? [];
  const tt = streams.time?.data ?? [];
  if (!Number.isFinite(t0) || ll.length < 2 || ll.length !== tt.length) return null;
  const points: TrackPointDto[] = ll.map(([lat, lng], i) => ({ lat, lng, t: t0 + tt[i]! * 1000 }));
  await d.db.query(`UPDATE integrations SET last_sync_at = $2, device = COALESCE($3, device) WHERE user_id = $1 AND provider = 'strava'`, [row.user_id, new Date(d.clock.now()), a.device_name ?? null]);
  return submitRun(d, row.user_id, { clientRunId: `strava-${ev.object_id}`, source: 'strava', externalId: String(ev.object_id), points, ...(a.device_name ? { device: a.device_name } : {}) });
}

function toGpx(points: Array<{ lat: number; lng: number; t: number }>): string {
  const pts = points.map((p) => `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="HexRun" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>HexRun koşusu</name><type>running</type><trkseg>${pts}</trkseg></trk></gpx>`;
}

/** HexRun koşusunu Strava'ya gönder (gönderme ayrı açılır). */
export async function exportToStrava(d: Deps, userId: string, runId: string): Promise<boolean> {
  const integ = (await d.db.query<{ export_enabled: boolean }>(`SELECT export_enabled FROM integrations WHERE user_id = $1 AND provider = 'strava'`, [userId])).rows[0];
  if (!integ?.export_enabled) return false;
  const run = (await d.db.query<{ points: Array<{ lat: number; lng: number; t: number }> | null; source: string }>('SELECT points, source FROM runs WHERE id = $1 AND user_id = $2', [runId, userId])).rows[0];
  if (!run?.points || run.source === 'strava') return false;
  const token = await stravaAccess(d, userId);
  if (!token) return false;
  const form = new FormData();
  form.set('file', new Blob([toGpx(run.points)], { type: 'application/gpx+xml' }), `hexrun-${runId}.gpx`);
  form.set('data_type', 'gpx');
  form.set('external_id', `hexrun-${runId}`);
  form.set('activity_type', 'run');
  const res = await d.fetch('https://www.strava.com/api/v3/uploads', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  return res.ok;
}

/* ─────────────── İmzalı web kancası (Garmin, Coros, Suunto, Polar adaptörü) ─────────────── */

export function secretFor(d: Deps, provider: string): string | null {
  for (const pair of list(d.cfg.WEBHOOK_SECRETS)) {
    const [p, s] = pair.split(':');
    if (p === provider && s) return s;
  }
  return null;
}

export interface WebhookRun {
  externalUserId: string;
  externalId: string;
  device?: string;
  points: TrackPointDto[];
}

export async function providerWebhook(d: Deps, provider: string, rawBody: string, signature: string | undefined): Promise<RunSummary | null> {
  if (!['garmin', 'coros', 'suunto', 'polar'].includes(provider)) throw notFound('Bilinmeyen kaynak.');
  const secret = secretFor(d, provider);
  if (!secret) throw new HttpError(501, 'not_configured', 'Yapılandırılmamış.');
  if (!signature || !safeEqual(signature, hmac(secret, rawBody))) throw unauthorized('İmza geçersiz.');
  let body: WebhookRun;
  try {
    body = JSON.parse(rawBody) as WebhookRun;
  } catch {
    throw badRequest('validation', 'JSON geçersiz.');
  }
  if (!body.externalUserId || !body.externalId || !Array.isArray(body.points)) throw badRequest('validation', 'Eksik alan.');
  const row = (await d.db.query<{ user_id: string; import_enabled: boolean }>('SELECT user_id, import_enabled FROM integrations WHERE provider = $1 AND external_user = $2', [provider, body.externalUserId])).rows[0];
  if (!row || !row.import_enabled) return null;
  await d.db.query('UPDATE integrations SET last_sync_at = $3, device = COALESCE($4, device) WHERE user_id = $1 AND provider = $2', [row.user_id, provider, new Date(d.clock.now()), body.device ?? null]);
  return submitRun(d, row.user_id, {
    clientRunId: `${provider}-${body.externalId}`,
    source: provider as Provider,
    externalId: body.externalId,
    points: body.points,
    ...(body.device ? { device: body.device } : {}),
  });
}

/** Adaptör servisi, kullanıcının sağlayıcı hesabını bağlar (state ile). */
export async function linkProviderAccount(d: Deps, provider: string, state: string, externalUserId: string, rawBody: string, signature: string | undefined): Promise<void> {
  const secret = secretFor(d, provider);
  if (!secret) throw new HttpError(501, 'not_configured', 'Yapılandırılmamış.');
  if (!signature || !safeEqual(signature, hmac(secret, rawBody))) throw unauthorized('İmza geçersiz.');
  const s = (await d.db.query<{ user_id: string; expires_at: Date }>('DELETE FROM oauth_states WHERE state = $1 AND provider = $2 RETURNING user_id, expires_at', [state, provider])).rows[0];
  if (!s || s.expires_at.getTime() < d.clock.now()) throw unauthorized('Bağlantı isteği geçersiz.');
  await d.db.query(
    `INSERT INTO integrations (user_id, provider, external_user, import_enabled) VALUES ($1, $2, $3, true)
     ON CONFLICT (user_id, provider) DO UPDATE SET external_user = EXCLUDED.external_user`,
    [s.user_id, provider, externalUserId],
  );
}
