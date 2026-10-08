export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'default' | 'high';
  /** Gönderici seçimi (native: apns/fcm). */
  provider?: 'apns' | 'fcm' | 'expo';
}

export interface PushResult {
  ok: boolean;
  /** Jeton geçersizse (cihaz kaldırıldı) true. */
  invalidToken?: boolean;
  error?: string;
}

export interface PushSender {
  send(msgs: PushMessage[]): Promise<PushResult[]>;
}

/** Expo Push API (APNs + FCM). https://docs.expo.dev/push-notifications/sending-notifications/ */
export class ExpoPushSender implements PushSender {
  constructor(private accessToken?: string, private endpoint = 'https://exp.host/--/api/v2/push/send') {}

  async send(msgs: PushMessage[]): Promise<PushResult[]> {
    const out: PushResult[] = [];
    for (let i = 0; i < msgs.length; i += 100) {
      const batch = msgs.slice(i, i + 100);
      try {
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
          },
          body: JSON.stringify(batch.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data, priority: m.priority ?? 'default', sound: 'default' }))),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          batch.forEach(() => out.push({ ok: false, error: `http_${res.status}` }));
          continue;
        }
        const json = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string }; message?: string }> };
        batch.forEach((_, k) => {
          const d = json.data?.[k];
          if (d?.status === 'ok') out.push({ ok: true });
          else out.push({ ok: false, invalidToken: d?.details?.error === 'DeviceNotRegistered', error: d?.message ?? 'unknown' });
        });
      } catch (e) {
        batch.forEach(() => out.push({ ok: false, error: (e as Error).message }));
      }
    }
    return out;
  }
}

export class MemoryPushSender implements PushSender {
  sent: PushMessage[] = [];
  async send(msgs: PushMessage[]): Promise<PushResult[]> {
    this.sent.push(...msgs);
    return msgs.map((m) => (m.to.includes('invalid') ? { ok: false, invalidToken: true } : { ok: true }));
  }
}
