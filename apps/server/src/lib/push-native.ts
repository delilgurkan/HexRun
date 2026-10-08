import { connect, constants, type ClientHttp2Session } from 'node:http2';
import { SignJWT, importPKCS8 } from 'jose';
import type { PushMessage, PushResult, PushSender } from './push.js';

export type PushProvider = 'apns' | 'fcm' | 'expo';

/** Sağlayıcıya göre yönlendiren gönderici. */
export class RoutingPushSender implements PushSender {
  constructor(private readonly by: Partial<Record<PushProvider, PushSender>>) {}
  async send(msgs: PushMessage[]): Promise<PushResult[]> {
    const out: PushResult[] = new Array(msgs.length);
    const groups = new Map<PushProvider, number[]>();
    msgs.forEach((m, i) => {
      const p = m.provider ?? 'expo';
      groups.set(p, [...(groups.get(p) ?? []), i]);
    });
    for (const [p, idx] of groups) {
      const s = this.by[p];
      if (!s) {
        idx.forEach((i) => (out[i] = { ok: false, error: `${p}_not_configured` }));
        continue;
      }
      const res = await s.send(idx.map((i) => msgs[i]!));
      idx.forEach((i, k) => (out[i] = res[k] ?? { ok: false, error: 'no_result' }));
    }
    return out;
  }
}

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  /** .p8 anahtarının PEM içeriği. */
  key: string;
  topic: string;
  production: boolean;
  /** Test için: "http://127.0.0.1:port" (h2c). */
  endpoint?: string;
}

/**
 * Apple Push Notification service, jeton tabanlı kimlik (ES256 JWT, 50 dakikada bir yenilenir), HTTP/2.
 * https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
 */
export class ApnsPushSender implements PushSender {
  private jwt: { token: string; at: number } | null = null;
  private session: ClientHttp2Session | null = null;
  constructor(private readonly c: ApnsConfig, private readonly now: () => number = Date.now) {}

  private origin(): string {
    return this.c.endpoint ?? (this.c.production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com');
  }

  private async token(): Promise<string> {
    if (this.jwt && this.now() - this.jwt.at < 50 * 60_000) return this.jwt.token;
    const key = await importPKCS8(this.c.key, 'ES256');
    const iat = Math.floor(this.now() / 1000);
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: this.c.keyId }).setIssuer(this.c.teamId).setIssuedAt(iat).sign(key);
    this.jwt = { token, at: this.now() };
    return token;
  }

  private client(): ClientHttp2Session {
    if (!this.session || this.session.closed || this.session.destroyed) {
      this.session = connect(this.origin());
      this.session.on('error', () => {
        this.session = null;
      });
      this.session.unref();
    }
    return this.session;
  }

  close(): void {
    this.session?.close();
    this.session = null;
  }

  async send(msgs: PushMessage[]): Promise<PushResult[]> {
    const auth = await this.token();
    return Promise.all(msgs.map((m) => this.one(m, auth)));
  }

  private one(m: PushMessage, auth: string): Promise<PushResult> {
    const { url, ...rest } = (m.data ?? {}) as Record<string, unknown>;
    const body = JSON.stringify({
      aps: { alert: { title: m.title, body: m.body }, sound: 'default', 'thread-id': String(rest.kind ?? 'hexrun') },
      ...rest,
      ...(url ? { url } : {}),
    });
    return new Promise((resolve) => {
      let settled = false;
      const done = (r: PushResult) => {
        if (!settled) {
          settled = true;
          resolve(r);
        }
      };
      try {
        const req = this.client().request({
          [constants.HTTP2_HEADER_METHOD]: 'POST',
          [constants.HTTP2_HEADER_PATH]: `/3/device/${m.to}`,
          authorization: `bearer ${auth}`,
          'apns-topic': this.c.topic,
          'apns-push-type': 'alert',
          'apns-priority': m.priority === 'high' ? '10' : '5',
          'content-type': 'application/json',
        });
        let status = 0;
        let chunks = '';
        req.setTimeout(10_000, () => {
          req.close();
          done({ ok: false, error: 'timeout' });
        });
        req.on('response', (h) => (status = Number(h[constants.HTTP2_HEADER_STATUS])));
        req.on('data', (d: Buffer) => (chunks += d.toString()));
        req.on('end', () => {
          if (status === 200) return done({ ok: true });
          let reason = `http_${status}`;
          try {
            reason = (JSON.parse(chunks) as { reason?: string }).reason ?? reason;
          } catch {
            /* gövde yok */
          }
          done({ ok: false, error: reason, invalidToken: status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' });
        });
        req.on('error', (e) => done({ ok: false, error: e.message }));
        req.end(body);
      } catch (e) {
        done({ ok: false, error: (e as Error).message });
      }
    });
  }
}

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  /** Test için uç noktalar. */
  tokenUrl?: string;
  sendUrl?: string;
}

/**
 * Firebase Cloud Messaging HTTP v1. Hizmet hesabı JWT'si ile OAuth2 erişim jetonu alınır (55 dk önbellek).
 * https://firebase.google.com/docs/cloud-messaging/send-message
 */
export class FcmPushSender implements PushSender {
  private access: { token: string; until: number } | null = null;
  constructor(private readonly c: FcmConfig, private readonly fetchFn: typeof fetch = fetch, private readonly now: () => number = Date.now) {}

  static fromServiceAccountJson(json: string, fetchFn?: typeof fetch): FcmPushSender {
    const sa = JSON.parse(json) as { project_id: string; client_email: string; private_key: string };
    return new FcmPushSender({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }, fetchFn);
  }

  private async accessToken(): Promise<string> {
    if (this.access && this.access.until > this.now()) return this.access.token;
    const tokenUrl = this.c.tokenUrl ?? 'https://oauth2.googleapis.com/token';
    const key = await importPKCS8(this.c.privateKey, 'RS256');
    const iat = Math.floor(this.now() / 1000);
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(this.c.clientEmail)
      .setAudience(tokenUrl)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(key);
    const res = await this.fetchFn(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`fcm_oauth_${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in?: number };
    this.access = { token: j.access_token, until: this.now() + Math.min(55 * 60, (j.expires_in ?? 3600) - 60) * 1000 };
    return j.access_token;
  }

  async send(msgs: PushMessage[]): Promise<PushResult[]> {
    let token: string;
    try {
      token = await this.accessToken();
    } catch (e) {
      return msgs.map(() => ({ ok: false, error: (e as Error).message }));
    }
    const url = this.c.sendUrl ?? `https://fcm.googleapis.com/v1/projects/${this.c.projectId}/messages:send`;
    return Promise.all(
      msgs.map(async (m): Promise<PushResult> => {
        // FCM veri alanları yalnız dizgi kabul eder.
        const data = Object.fromEntries(Object.entries(m.data ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
        try {
          const res = await this.fetchFn(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({
              message: {
                token: m.to,
                notification: { title: m.title, body: m.body },
                data,
                android: { priority: m.priority === 'high' ? 'HIGH' : 'NORMAL', notification: { channel_id: 'game' } },
              },
            }),
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) return { ok: true };
          const j = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string } };
          const status = j.error?.status ?? `http_${res.status}`;
          return { ok: false, error: status, invalidToken: res.status === 404 || status === 'UNREGISTERED' || status === 'NOT_FOUND' };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      }),
    );
  }
}

/** Jeton biçiminden ve platformdan sağlayıcı çıkarımı. */
export function inferProvider(token: string, platform: 'ios' | 'android', provider?: PushProvider): PushProvider {
  if (provider) return provider;
  if (/^Expo(nent)?PushToken\[/.test(token)) return 'expo';
  return platform === 'ios' ? 'apns' : 'fcm';
}
