import { RULES, dayKey, localTime, DAY_MS, EVENTS, activeEvents, type EventId } from '@hexrun/core';
import type { NotificationDto, Page } from '@hexrun/contracts';
import type { Deps } from '../deps.js';
import { insertNotifications } from './notify.js';
import { notFound } from '../lib/errors.js';

const CATEGORY_FILTER: Record<string, string[] | null> = {
  all: null,
  siege: ['siege'],
  region: ['region'],
  team: ['team'],
};

export async function listNotifications(d: Deps, userId: string, filter: string, cursor: string | null): Promise<Page<NotificationDto>> {
  const cats = CATEGORY_FILTER[filter] ?? null;
  const before = cursor ? new Date(Number(cursor)) : new Date(d.clock.now() + 1);
  const r = await d.db.query<{ id: string; kind: NotificationDto['kind']; category: NotificationDto['category']; title: string; body: string; data: { action?: NotificationDto['action'] }; created_at: Date; read_at: Date | null }>(
    `SELECT id, kind, category, title, body, data, created_at, read_at FROM notifications
     WHERE user_id = $1 AND created_at < $2 AND push_after <= $4 AND ($3::text[] IS NULL OR category = ANY($3::text[]))
     ORDER BY created_at DESC LIMIT 50`,
    [userId, before, cats, new Date(d.clock.now())],
  );
  const last = r.rows[r.rows.length - 1];
  return {
    items: r.rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      category: n.category,
      title: n.title,
      body: n.body,
      createdAt: n.created_at.toISOString(),
      read: !!n.read_at,
      action: n.data.action ?? null,
    })),
    nextCursor: r.rows.length === 50 && last ? String(last.created_at.getTime()) : null,
  };
}

export async function markRead(d: Deps, userId: string, ids?: string[]): Promise<void> {
  if (ids && ids.length) await d.db.query('UPDATE notifications SET read_at = $3 WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL', [userId, ids, new Date(d.clock.now())]);
  else await d.db.query('UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL', [userId, new Date(d.clock.now())]);
}

const PRIORITY: Record<string, number> = { cells_lost: 0, siege_alarm: 1, duel_started: 2, siege_warn: 3, decay_warning: 4, event_started: 5 };

/**
 * Push gönderimi: kullanıcı başına günde en çok 3 (oyun saat dilimine göre).
 * Tavan aşılırsa bildirim yalnız uygulama içinde kalır.
 */
export async function dispatchPush(d: Deps): Promise<{ sent: number; capped: number; failed: number }> {
  const now = d.clock.now();
  const due = await d.db.query<{ id: string; user_id: string; kind: string; title: string; body: string; data: Record<string, unknown>; push_token: string | null }>(
    `SELECT n.id, n.user_id, n.kind, n.title, n.body, n.data, u.push_token FROM notifications n JOIN users u ON u.id = n.user_id
     WHERE n.push AND n.pushed_at IS NULL AND n.push_status IS NULL AND n.push_after <= $1
     ORDER BY n.push_after LIMIT 1000`,
    [new Date(now)],
  );
  const today = dayKey(now);
  // Oyun saat dilimi Europe/Istanbul (UTC+3, yaz saati yok).
  const startOfDay = new Date(Date.parse(`${today}T00:00:00+03:00`));
  const byUser = new Map<string, typeof due.rows>();
  for (const n of due.rows) {
    const arr = byUser.get(n.user_id) ?? [];
    arr.push(n);
    byUser.set(n.user_id, arr);
  }
  let sent = 0;
  let capped = 0;
  let failed = 0;
  for (const [userId, list] of byUser) {
    const used = Number((await d.db.query<{ n: string }>(`SELECT COUNT(*) n FROM notifications WHERE user_id = $1 AND push_status = 'sent' AND pushed_at >= $2`, [userId, startOfDay])).rows[0]!.n);
    list.sort((a, b) => (PRIORITY[a.kind] ?? 9) - (PRIORITY[b.kind] ?? 9));
    let room = Math.max(0, RULES.PUSH_DAILY_CAP - used);
    for (const n of list) {
      if (!n.push_token || !d.cfg.PUSH_ENABLED) {
        await d.db.query(`UPDATE notifications SET push_status = 'no_token', pushed_at = $2 WHERE id = $1`, [n.id, new Date(now)]);
        continue;
      }
      if (room <= 0) {
        capped++;
        await d.db.query(`UPDATE notifications SET push_status = 'capped', pushed_at = $2 WHERE id = $1`, [n.id, new Date(now)]);
        continue;
      }
      const [res] = await d.push.send([{ to: n.push_token, title: n.title, body: n.body, data: { id: n.id, kind: n.kind, ...n.data }, priority: n.kind === 'cells_lost' || n.kind === 'siege_alarm' ? 'high' : 'default' }]);
      if (res?.ok) {
        room--;
        sent++;
        await d.db.query(`UPDATE notifications SET push_status = 'sent', pushed_at = $2 WHERE id = $1`, [n.id, new Date(now)]);
      } else {
        failed++;
        await d.db.query(`UPDATE notifications SET push_status = 'failed', pushed_at = $2 WHERE id = $1`, [n.id, new Date(now)]);
        if (res?.invalidToken) await d.db.query('UPDATE users SET push_token = NULL WHERE id = $1 AND push_token = $2', [userId, n.push_token]);
      }
    }
  }
  return { sent, capped, failed };
}

/** "Kalamış eriyor": 3 gündür halka atılmayan petekler için hatırlatma (3 günde bir). */
export async function decayWarnings(d: Deps): Promise<number> {
  const now = d.clock.now();
  const r = await d.db.query<{ owner_id: string; n: string; p: number; lost: number }>(
    `SELECT owner_id, COUNT(*) n, AVG(power)::float8 p, (AVG(power) + 5 * 3)::float8 lost FROM cells
     WHERE owner_id IS NOT NULL AND last_owner_loop_at <= $1 AND last_owner_loop_at > $2
     GROUP BY owner_id`,
    [new Date(now - 3 * DAY_MS), new Date(now - 4 * DAY_MS)],
  );
  const list = [];
  for (const row of r.rows) {
    const recent = await d.db.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'decay_warning' AND created_at >= $2`, [row.owner_id, new Date(now - 3 * DAY_MS)]);
    if (recent.rowCount) continue;
    list.push({
      userId: row.owner_id,
      kind: 'decay_warning' as const,
      category: 'region' as const,
      title: 'Bölgen eriyor',
      body: `3 gündür halka yok · ${row.n} petek · güç ${Math.round(row.lost)} → ${Math.round(row.p)}`,
      data: { action: { label: 'Koş', deeplink: 'hexrun://run' } },
      push: true,
    });
  }
  await insertNotifications(d.db, list, now);
  return list.length;
}

/** Hatırlatma isteyenlere etkinlik başlangıcı (tek sefer / etkinlik penceresi). */
export async function eventReminders(d: Deps): Promise<number> {
  const now = d.clock.now();
  const active = activeEvents(now).map((e) => e.id);
  let n = 0;
  for (const id of active) {
    const key = `${id}:${dayKey(now)}:${id === 'blitz' ? 'w' : localTime(now).hour}`;
    const done = await d.db.query(`SELECT 1 FROM job_state WHERE name = $1`, [`event:${key}`]);
    if (done.rowCount) continue;
    await d.db.query(`INSERT INTO job_state (name, value) VALUES ($1, 'true') ON CONFLICT DO NOTHING`, [`event:${key}`]);
    const ev = EVENTS[id as EventId];
    const users = await d.db.query<{ user_id: string }>('SELECT user_id FROM event_reminders WHERE event_id = $1', [id]);
    await insertNotifications(
      d.db,
      users.rows.map((u) => ({ userId: u.user_id, kind: 'event_started' as const, category: 'other' as const, title: `${ev.name} başladı`, body: ev.description, push: true })),
      now,
    );
    n += users.rows.length;
  }
  return n;
}

export async function setReminder(d: Deps, userId: string, eventId: string, on: boolean): Promise<void> {
  if (!(eventId in EVENTS)) throw notFound('Etkinlik bulunamadı.');
  if (on) await d.db.query('INSERT INTO event_reminders (user_id, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, eventId]);
  else await d.db.query('DELETE FROM event_reminders WHERE user_id = $1 AND event_id = $2', [userId, eventId]);
}
