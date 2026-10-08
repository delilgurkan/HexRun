import type { GameNotice } from '@hexrun/core';
import type { NotificationKind } from '@hexrun/contracts';
import type { Queryable } from '../db.js';
import { uuid } from '../lib/crypto.js';

export interface NewNotification {
  userId: string;
  kind: NotificationKind;
  category: 'siege' | 'region' | 'team' | 'other';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  push: boolean;
  pushAfter?: number;
}

export async function insertNotifications(q: Queryable, list: readonly NewNotification[], now: number): Promise<void> {
  if (!list.length) return;
  await q.query(
    `INSERT INTO notifications (id, user_id, kind, category, title, body, data, created_at, push, push_after)
     SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::jsonb[], $8::timestamptz[], $9::bool[], $10::timestamptz[])`,
    [
      list.map(() => uuid()),
      list.map((n) => n.userId),
      list.map((n) => n.kind),
      list.map((n) => n.category),
      list.map((n) => n.title),
      list.map((n) => n.body),
      list.map((n) => JSON.stringify(n.data ?? {})),
      list.map(() => new Date(now)),
      list.map((n) => n.push),
      list.map((n) => new Date(n.pushAfter ?? now)),
    ],
  );
}

/** Ad sözlüğü: oyuncu kimliği → görünen ad. */
export type Names = Map<string, string>;

export async function loadNames(q: Queryable, ids: Iterable<string>): Promise<Names> {
  const list = [...new Set(ids)];
  if (!list.length) return new Map();
  const r = await q.query<{ id: string; display_name: string; username: string | null }>(
    'SELECT id, display_name, username FROM users WHERE id = ANY($1::uuid[])',
    [list],
  );
  return new Map(r.rows.map((u) => [u.id, u.display_name || u.username || 'Bir oyuncu']));
}

/** Türkçe iyelik/vasıta ekleri için basit ünlü uyumu: "Selin'le", "Emre'yle". */
export function withSuffix(name: string): string {
  const v = [...name.toLocaleLowerCase('tr-TR')].reverse().find((ch) => 'aeıioöuü'.includes(ch));
  const endsVowel = 'aeıioöuü'.includes(name.slice(-1).toLocaleLowerCase('tr-TR'));
  const back = v ? 'aıou'.includes(v) : false;
  return `${name}'${endsVowel ? 'y' : ''}${back ? 'la' : 'le'}`;
}

/**
 * Motor uyarılarını bildirime çevirir:
 * - kuşatma/el değiştirme bildirimleri sahip düelloyu görebildiği andan önce görünmez (Şafak Akıncısı gecikmesi),
 * - gizlilik bölgesindeki peteklerin sahibi kazanılan düello bildiriminde adıyla anılmaz,
 * - her bildirim andığı oyuncuyu `actorId` olarak saklar (hesap silmede temizlenir).
 */
export async function buildNotifications(q: Queryable, notices: readonly GameNotice[], now: number, hiddenName: string): Promise<NewNotification[]> {
  if (!notices.length) return [];
  const duelIds = [...new Set(notices.map((n) => ('duelId' in n ? n.duelId : null)).filter((x): x is string => !!x))];
  const duels = new Map(
    (
      await q.query<{ id: string; cells: string[]; defender_id: string; defender_visible_at: Date | null }>('SELECT id, cells, defender_id, defender_visible_at FROM duels WHERE id = ANY($1::uuid[])', [duelIds])
    ).rows.map((x) => [x.id, x]),
  );
  const names = await loadNames(q, notices.flatMap((n) => ('attackerId' in n ? [n.attackerId] : 'defenderId' in n ? [n.defenderId] : [])));
  const { loadZones, anyHidden } = await import('./privacy.js');
  const zones = await loadZones(q, [...duels.values()].map((x) => x.defender_id));
  const out: NewNotification[] = [];
  for (const n of notices) {
    let local = names;
    if (n.type === 'duel_won') {
      const du = duels.get(n.duelId);
      if (du && anyHidden(zones.get(du.defender_id), du.cells)) local = new Map([...names, [n.defenderId, hiddenName]]);
    }
    const x = noticeToNotification(n, local);
    if (!x) continue;
    const actor = 'attackerId' in n ? n.attackerId : 'defenderId' in n ? n.defenderId : null;
    if (actor) x.data = { ...(x.data ?? {}), actorId: actor };
    if (n.type === 'siege_warn' || n.type === 'siege_alarm' || n.type === 'cells_lost') {
      const vis = duels.get(n.duelId)?.defender_visible_at?.getTime() ?? now;
      x.pushAfter = Math.max(now, vis);
    }
    out.push(x);
  }
  return out;
}

export function noticeToNotification(n: GameNotice, names: Names): NewNotification | null {
  const nm = (id: string) => names.get(id) ?? 'Bir oyuncu';
  switch (n.type) {
    case 'duel_started':
      return {
        userId: n.to,
        kind: 'duel_started',
        category: 'siege',
        title: `${withSuffix(nm(n.attackerId))} düello · ${n.cells} petek`,
        body: `${nm(n.attackerId)} alanında halka kapattı. Savunmak için o peteklerden geçen bir halka kapat.`,
        data: { duelId: n.duelId, action: { label: 'Savun', deeplink: `hexrun://run?defend=${n.duelId}` } },
        push: true,
        pushAfter: n.notBefore,
      };
    case 'siege_warn':
    case 'siege_alarm': {
      const loops = Math.max(1, Math.ceil(n.hp / 10));
      return {
        userId: n.to,
        kind: n.type,
        category: 'siege',
        title: `${withSuffix(nm(n.attackerId))} düello · can ${Math.round(n.hp)}`,
        body: `${nm(n.attackerId)} ${loops} halka daha atarsa onun olur.`,
        data: { duelId: n.duelId, action: { label: 'Savun', deeplink: `hexrun://run?defend=${n.duelId}` } },
        push: true,
      };
    }
    case 'cells_lost':
      return {
        userId: n.to,
        kind: 'cells_lost',
        category: 'region',
        title: `${nm(n.attackerId)} düelloyu kazandı`,
        body: `${n.cells} peteğin ${nm(n.attackerId)} oyuncusuna geçti. Geri almak için düello aç.`,
        data: { duelId: n.duelId, action: { label: 'Geri al', deeplink: `hexrun://duel/revenge/${n.duelId}` } },
        push: true,
      };
    case 'duel_won':
      return {
        userId: n.to,
        kind: 'duel_won',
        category: 'region',
        title: `${withSuffix(nm(n.defenderId))} düelloyu kazandın`,
        body: `${n.cells} petek senin.`,
        data: { duelId: n.duelId },
        push: false,
      };
    case 'duel_reset':
      return {
        userId: n.to,
        kind: 'duel_reset',
        category: 'region',
        title: 'Düellon kapandı',
        body:
          n.reason === 'captured_by_other'
            ? 'Bu petekleri başka bir oyuncu aldı; düello hakkın geri döndü.'
            : 'Alan 7 peteğin altına indi; düello hakkın geri döndü.',
        data: { duelId: n.duelId },
        push: false,
      };
    case 'duel_expired':
      return {
        userId: n.to,
        kind: 'duel_expired',
        category: 'region',
        title: 'Düello süresi doldu',
        body: '48 saatte sayılan halka gelmedi; düello hakkın geri döndü.',
        data: { duelId: n.duelId },
        push: false,
      };
    case 'decay_lost':
      return {
        userId: n.to,
        kind: 'decay_lost',
        category: 'region',
        title: 'Petekler boşa düştü',
        body: `${n.cells} peteğin eriyerek boşaldı. Halka atarak yeniden alabilirsin.`,
        push: false,
      };
  }
}
