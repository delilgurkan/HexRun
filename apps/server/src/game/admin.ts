import { DAY_MS, cellsAreaM2, dayKey } from '@hexrun/core';
import type { Deps } from '../deps.js';
import { txRetry } from '../db.js';
import { conflict, notFound } from '../lib/errors.js';
import { leagueRegionForCell } from '../lib/regions.js';
import { applyLoopTx } from './play.js';
import { insertNotifications, loadNames, noticeToNotification, type NewNotification } from './notify.js';
import { awardBadges, bumpStats, refreshPeak } from './progress.js';

export async function listReviews(d: Deps) {
  const r = await d.db.query<{
    id: string;
    run_id: string;
    user_id: string;
    username: string | null;
    display_name: string;
    closed_at: Date;
    review: { reasons?: string[]; paceSecPerKm?: number; segmentM?: number } | null;
    distance_m: number;
    cells: string[];
    note: string | null;
    points: Array<{ lat: number; lng: number; t: number }> | null;
  }>(
    `SELECT l.id, l.run_id, l.user_id, u.username, u.display_name, l.closed_at, r.review, r.distance_m, l.cells, r.note, r.points
     FROM loops l JOIN runs r ON r.id = l.run_id JOIN users u ON u.id = l.user_id
     WHERE l.status = 'review' ORDER BY l.closed_at LIMIT 100`,
  );
  return {
    items: r.rows.map((x) => ({
      loopId: x.id,
      runId: x.run_id,
      player: { id: x.user_id, username: x.username ?? '', displayName: x.display_name },
      closedAt: x.closed_at.toISOString(),
      reasons: x.review?.reasons ?? [],
      ...(x.review?.paceSecPerKm ? { paceSecPerKm: x.review.paceSecPerKm } : {}),
      ...(x.review?.segmentM ? { segmentM: x.review.segmentM } : {}),
      distanceM: Math.round(x.distance_m),
      cells: x.cells.length,
      ...(x.note ? { note: x.note } : {}),
      track: (x.points ?? []).map((p) => ({ lat: p.lat, lng: p.lng, t: p.t })),
    })),
  };
}

export async function decideReview(d: Deps, adminId: string, loopId: string, decision: 'approve' | 'reject'): Promise<{ ok: true }> {
  const now = d.clock.now();
  await txRetry(d.db, async (c) => {
    const l = (await c.query<{ id: string; run_id: string; user_id: string; cells: string[]; closed_at: Date; status: string; area_m2: number }>('SELECT * FROM loops WHERE id = $1 FOR UPDATE', [loopId])).rows[0];
    if (!l) throw notFound('Halka bulunamadı.');
    if (l.status !== 'review') throw conflict('already_decided', 'Bu halka için karar verilmiş.');
    const notifs: NewNotification[] = [];
    if (decision === 'reject') {
      await c.query(`UPDATE loops SET status = 'rejected', decided_by = $2, decided_at = $3 WHERE id = $1`, [loopId, adminId, new Date(now)]);
      notifs.push({ userId: l.user_id, kind: 'review_result', category: 'other', title: 'Halkan sayılmadı', body: 'İnceleme sonunda bu halka haritaya işlenmedi. Koşun ve serin kayıtlı kalır.', push: true });
    } else {
      const r = await applyLoopTx(c, l.user_id, l.cells, l.closed_at.getTime(), now);
      const o = r.outcome;
      const captured = o.captured.flatMap((x) => x.cells);
      const gained = Math.round(cellsAreaM2([...o.newCells, ...captured]));
      await c.query(`UPDATE loops SET status = 'applied', decided_by = $2, decided_at = $3, result = jsonb_set(COALESCE(result, '{}'), '{status}', '"applied"') WHERE id = $1`, [loopId, adminId, new Date(now)]);
      await bumpStats(c, l.user_id, { loops_closed: 1, empty_cells_claimed: o.newCells.length, duels_won: o.captured.length }, { biggest_loop_m2: l.area_m2 });
      if (gained) {
        await c.query(
          `INSERT INTO area_gains (user_id, day, region, gained_m2) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, day, region) DO UPDATE SET gained_m2 = area_gains.gained_m2 + EXCLUDED.gained_m2`,
          [l.user_id, dayKey(l.closed_at.getTime()), leagueRegionForCell(l.cells[0]!), gained],
        );
        await c.query('UPDATE runs SET gained_area_m2 = gained_area_m2 + $2 WHERE id = $1', [l.run_id, gained]);
      }
      const names = await loadNames(c, o.notices.flatMap((n) => ('attackerId' in n ? [n.attackerId] : 'defenderId' in n ? [n.defenderId] : [])));
      notifs.push(...o.notices.map((n) => noticeToNotification(n, names)).filter((x): x is NewNotification => !!x));
      notifs.push({ userId: l.user_id, kind: 'review_result', category: 'other', title: 'Halkan onaylandı', body: gained ? `+${gained.toLocaleString('tr-TR')} m² haritaya işlendi.` : 'Halkan haritaya işlendi.', push: true });
      await refreshPeak(c, [l.user_id, ...o.captured.map((x) => x.fromId)]);
      await awardBadges(c, l.user_id, now);
    }
    const left = await c.query(`SELECT 1 FROM loops WHERE run_id = $1 AND status = 'review'`, [l.run_id]);
    if (!left.rowCount) {
      const any = await c.query(`SELECT 1 FROM loops WHERE run_id = $1 AND status = 'applied'`, [l.run_id]);
      await c.query(`UPDATE runs SET status = $2, summary = jsonb_set(summary, '{status}', to_jsonb($2::text)) WHERE id = $1`, [l.run_id, any.rowCount ? 'applied' : 'open']);
    }
    await insertNotifications(c, notifs, now);
  });
  return { ok: true };
}

export async function metrics(d: Deps) {
  const now = d.clock.now();
  const one = async (sql: string, p: unknown[] = []) => Number((await d.db.query<{ n: string }>(sql, p)).rows[0]?.n ?? 0);
  return {
    dau: await one('SELECT COUNT(*) n FROM users WHERE last_active_at >= $1', [new Date(now - DAY_MS)]),
    wau: await one('SELECT COUNT(*) n FROM users WHERE last_active_at >= $1', [new Date(now - 7 * DAY_MS)]),
    runsToday: await one('SELECT COUNT(*) n FROM runs WHERE created_at >= $1', [new Date(now - DAY_MS)]),
    loopsToday: await one(`SELECT COUNT(*) n FROM loops WHERE closed_at >= $1 AND status = 'applied'`, [new Date(now - DAY_MS)]),
    reviewQueue: await one(`SELECT COUNT(*) n FROM loops WHERE status = 'review'`),
    activeDuels: await one(`SELECT COUNT(*) n FROM duels WHERE status = 'active'`),
  };
}
