import type { Deps } from './deps.js';
import { txRetry } from './db.js';
import { tickRegionTx } from './game/play.js';
import { buildNotifications, insertNotifications } from './game/notify.js';
import { decayWarnings, dispatchPush, eventReminders } from './game/notifications.js';
import { bumpStats, refreshPeak } from './game/progress.js';
import { snapshotLeagues } from './game/social.js';
import { DAY_MS, HIDDEN_PLAYER_NAME } from '@hexrun/core';

/** Tüm bölgeler için erime/düello zamanlayıcısı. */
export async function runTick(d: Deps): Promise<{ regions: number; notices: number }> {
  const now = d.clock.now();
  const regions = (
    await d.db.query<{ r: string }>(
      `SELECT DISTINCT lock_region r FROM cells WHERE owner_id IS NOT NULL
       UNION SELECT DISTINCT unnest(lock_regions) r FROM duels WHERE status = 'active'`,
    )
  ).rows.map((x) => x.r);
  let notices = 0;
  for (const region of regions) {
    await txRetry(d.db, async (c) => {
      const r = await tickRegionTx(c, region, now);
      const list = await buildNotifications(c, r.notices, now, HIDDEN_PLAYER_NAME);
      await insertNotifications(c, list, now);
      notices += list.length;
      for (const pd of r.persisted.duels) {
        const before = r.persisted.before.duels.get(pd.id);
        if (before?.status === 'active' && (pd.status === 'expired' || pd.status === 'closed') && pd.firstCountedAt !== null) {
          await bumpStats(c, pd.defenderId, { duels_defended: 1 });
        }
      }
      const losers = r.persisted.cells.filter((x) => !x.ownerId).map((x) => r.persisted.before.cells.get(x.id)?.ownerId).filter((x): x is string => !!x);
      if (losers.length) await refreshPeak(c, losers);
    });
  }
  return { regions: regions.length, notices };
}

/** Saklama politikası: ham GPS 30 gün, tarihçe 90 gün. */
export async function housekeeping(d: Deps): Promise<Record<string, number>> {
  const now = d.clock.now();
  const n = async (sql: string, p: unknown[]) => (await d.db.query(sql, p)).rowCount ?? 0;
  return {
    points: await n('UPDATE runs SET points = NULL WHERE points IS NOT NULL AND ended_at < $1', [new Date(now - 30 * DAY_MS)]),
    events: await n('DELETE FROM cell_events WHERE at < $1', [new Date(now - 90 * DAY_MS)]),
    losses: await n('DELETE FROM losses WHERE at < $1', [new Date(now - 8 * DAY_MS)]),
    codes: await n('DELETE FROM email_codes WHERE expires_at < $1', [new Date(now - DAY_MS)]),
    states: await n('DELETE FROM oauth_states WHERE expires_at < $1', [new Date(now)]),
    tokens: await n('DELETE FROM refresh_tokens WHERE expires_at < $1 OR revoked_at < $2', [new Date(now), new Date(now - 30 * DAY_MS)]),
    notifications: await n('DELETE FROM notifications WHERE created_at < $1', [new Date(now - 90 * DAY_MS)]),
  };
}

interface Job {
  name: string;
  everyMs: number;
  run: (d: Deps) => Promise<unknown>;
}

export const JOBS: Job[] = [
  { name: 'push', everyMs: 30_000, run: dispatchPush },
  { name: 'tick', everyMs: 5 * 60_000, run: runTick },
  { name: 'events', everyMs: 60_000, run: eventReminders },
  { name: 'decay-warnings', everyMs: 60 * 60_000, run: decayWarnings },
  { name: 'league-snapshot', everyMs: 60 * 60_000, run: snapshotLeagues },
  { name: 'housekeeping', everyMs: 6 * 60 * 60_000, run: housekeeping },
];

/**
 * Basit zamanlayıcı: birden çok sunucu örneğinde her iş için yalnız bir örnek çalışır
 * (pg_try_advisory_lock). İşler idempotenttir; kaçırılan çalışma bir sonrakinde telafi edilir.
 */
export function startJobs(d: Deps, log: { error: (o: unknown, m?: string) => void; info: (o: unknown, m?: string) => void }): () => void {
  const timers: NodeJS.Timeout[] = [];
  let stopped = false;
  for (const job of JOBS) {
    const tickOnce = async () => {
      if (stopped) return;
      const c = await d.db.connect();
      try {
        const got = (await c.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) ok', [`job:${job.name}`])).rows[0]?.ok;
        if (!got) return;
        try {
          const r = await job.run(d);
          log.info({ job: job.name, result: r }, 'job done');
        } finally {
          await c.query('SELECT pg_advisory_unlock(hashtext($1))', [`job:${job.name}`]);
        }
      } catch (e) {
        log.error({ err: e, job: job.name }, 'job failed');
      } finally {
        c.release();
      }
    };
    timers.push(setInterval(() => void tickOnce(), job.everyMs));
    setTimeout(() => void tickOnce(), 2_000 + Math.random() * 3_000);
  }
  return () => {
    stopped = true;
    timers.forEach(clearInterval);
  };
}
