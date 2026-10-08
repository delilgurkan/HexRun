import {
  activeEvents,
  cellsAreaM2,
  detectLoops,
  haversineM,
  importDecision,
  localTime,
  loopCells,
  reviewTrack,
  suggestDuels,
  trackStats,
  closeRadiusFor,
  minLoopLengthFor,
  dayKey,
  fmtInt,
  fmtKm,
  outline,
  pathLengthM,
  HIDDEN_PLAYER_NAME,
  type GameNotice,
  type PlayerState,
  type ReviewResult,
  type TrackPoint,
} from '@hexrun/core';
import type { DuelHitDto, LoopResult, RunSummary, SubmitRunRequest, DuelSuggestion } from '@hexrun/contracts';
import type { Deps } from '../deps.js';
import { txRetry, type Tx } from '../db.js';
import { uuid } from '../lib/crypto.js';
import { badRequest } from '../lib/errors.js';
import { leagueRegionFor } from '../lib/regions.js';
import { applyLoopTx, lockForRun, type LoopTxResult } from './play.js';
import { buildNotifications, insertNotifications } from './notify.js';
import { anyHidden, hiddenPlayer, loadZones } from './privacy.js';
import { loadPublicPlayers } from './players.js';
import { awardBadges, badgeDto, bumpStats, monthDistance, playerStats, refreshPeak, streakFor, type StatKey } from './progress.js';

const MAX_AGE_MS = 30 * 86_400_000;

export const REVIEW_TEXT: Record<string, string> = {
  pace_too_fast: 'Tempo koşu temposunun çok üstünde',
  teleport: 'GPS sıçraması',
  sparse_gps: 'GPS kopukluğu',
  non_monotonic_time: 'Zaman damgaları tutarsız',
  too_few_points: 'Çok az GPS noktası',
};

export async function submitRun(d: Deps, userId: string, req: SubmitRunRequest): Promise<RunSummary> {
  const now = d.clock.now();
  const pts: TrackPoint[] = req.points.map((p) => ({ lat: p.lat, lng: p.lng, t: p.t, ...(p.acc !== undefined ? { acc: p.acc } : {}) }));
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last || pts.length < 2) throw badRequest('validation', 'Koşu en az iki nokta içermeli.');
  if (last.t > now + 5 * 60_000) throw badRequest('future_run', 'Koşu zamanı ileri tarihli.');
  if (now - last.t > MAX_AGE_MS) throw badRequest('too_old', '30 günden eski koşu aktarılamaz.');

  return txRetry(d.db, async (c) => {
    const existing = await c.query<{ summary: RunSummary | null }>('SELECT summary FROM runs WHERE user_id = $1 AND client_run_id = $2', [userId, req.clientRunId]);
    if (existing.rows[0]?.summary) return existing.rows[0].summary;
    if (req.externalId) {
      const ex = await c.query<{ summary: RunSummary | null }>('SELECT summary FROM runs WHERE user_id = $1 AND source = $2 AND external_id = $3', [userId, req.source, req.externalId]);
      if (ex.rows[0]?.summary) return ex.rows[0].summary;
    }
    // Kullanıcı başına sıraya sok: aynı anda iki koşu gelirse tekrar kontrolü güvenli olsun.
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`user:${userId}`]);
    const again = await c.query<{ summary: RunSummary | null }>('SELECT summary FROM runs WHERE user_id = $1 AND client_run_id = $2', [userId, req.clientRunId]);
    if (again.rows[0]?.summary) return again.rows[0].summary;
    if (req.externalId) {
      const ex = await c.query<{ summary: RunSummary | null }>('SELECT summary FROM runs WHERE user_id = $1 AND source = $2 AND external_id = $3', [userId, req.source, req.externalId]);
      if (ex.rows[0]?.summary) return ex.rows[0].summary;
    }
    return processRun(d, c, userId, req, pts, now);
  });
}

async function processRun(d: Deps, c: Tx, userId: string, req: SubmitRunRequest, pts: TrackPoint[], now: number): Promise<RunSummary> {
  const runId = uuid();
  const startedAt = pts[0]!.t;
  const endedAt = pts[pts.length - 1]!.t;
  const st = trackStats(pts);
  const distanceM = st.distanceM;
  const userRow = (await c.query<{ created_at: Date; insignia: string[]; league_region: string | null }>('SELECT created_at, insignia, league_region FROM users WHERE id = $1', [userId])).rows[0]!;
  const me: PlayerState = { id: userId, createdAt: userRow.created_at.getTime(), insignia: userRow.insignia as PlayerState['insignia'], shield: null };

  // Aynı koşu iki kaynaktan gelirse bir kez sayılır.
  const near = await c.query<{ started_at: Date; ended_at: Date; distance_m: number }>(
    `SELECT started_at, ended_at, distance_m FROM runs WHERE user_id = $1 AND status <> 'duplicate'
       AND started_at < $3 AND ended_at > $2`,
    [userId, new Date(startedAt), new Date(endedAt)],
  );
  const decision = importDecision(
    { startedAt, endedAt, distanceM },
    near.rows.map((r) => ({ startedAt: r.started_at.getTime(), endedAt: r.ended_at.getTime(), distanceM: r.distance_m })),
    now,
  );
  const base: Omit<RunSummary, 'status' | 'loops' | 'review' | 'newBadges' | 'suggestions' | 'totalGainedAreaM2' | 'openGapM' | 'streakDays' | 'monthDistanceM'> = {
    id: runId,
    source: req.source,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    distanceM: Math.round(distanceM),
    durationMs: st.durationMs,
    paceSecPerKm: st.paceSecPerKm === null ? null : Math.round(st.paceSecPerKm),
  };

  if (decision === 'duplicate') {
    const summary: RunSummary = { ...base, status: 'duplicate', loops: [], review: null, newBadges: [], suggestions: [], totalGainedAreaM2: 0, openGapM: null, streakDays: (await streakFor(c, userId, now)).current, monthDistanceM: await monthDistance(c, userId, now) };
    await insertRun(c, runId, userId, req, startedAt, endedAt, distanceM, st.durationMs, st.paceSecPerKm, 'duplicate', null, null, 0, summary, pts);
    return summary;
  }

  const review: ReviewResult = reviewTrack(pts);
  const closeR = closeRadiusFor(me);
  const loops = detectLoops(pts, { closeRadiusM: closeR, minLoopLengthM: minLoopLengthFor(me, startedAt) });
  const reviewInfo = review.status === 'review' && loops.length
    ? {
        reasons: review.findings.map((f) => REVIEW_TEXT[f.reason] ?? f.reason),
        ...(review.findings[0]?.paceSecPerKm ? { paceSecPerKm: review.findings[0].paceSecPerKm } : {}),
        ...(review.findings.find((f) => f.segmentM)?.segmentM ? { segmentM: review.findings.find((f) => f.segmentM)!.segmentM! } : {}),
      }
    : null;

  // Koşu satırı önce yazılır (halkalar ona bağlı).
  await insertRun(c, runId, userId, req, startedAt, endedAt, distanceM, st.durationMs, st.paceSecPerKm, 'processing', reviewInfo, null, 0, null, pts);

  const results: LoopResult[] = [];
  const notices: GameNotice[] = [];
  const inc: Partial<Record<StatKey, number>> = {};
  const add = (k: StatKey, n = 1) => (inc[k] = (inc[k] ?? 0) + n);
  const losers = new Set<string>();
  const suggestions: DuelSuggestion[] = [];
  const opponentIds = new Set<string>();
  const applied: Array<{ idx: number; tx: LoopTxResult; cells: string[] }> = [];
  let biggest = 0;
  let gainedTotal = 0;
  const gainedCells: string[] = [];

  const cellsByLoop = new Map(loops.map((l) => [l.index, loopCells(l)]));
  if (!reviewInfo && decision !== 'stats_only' && loops.length) await lockForRun(c, userId, [...cellsByLoop.values()].flat());
  for (const loop of loops) {
    const cells = cellsByLoop.get(loop.index)!;
    const areaM2 = cellsAreaM2(cells);
    const status = reviewInfo ? 'review' : decision === 'stats_only' ? 'stats_only' : 'applied';
    const lr: LoopResult = {
      index: loop.index,
      status,
      closedAt: new Date(loop.closedAt).toISOString(),
      lengthM: Math.round(loop.lengthM),
      areaM2: Math.round(areaM2),
      cells: cells.length,
      newCells: 0,
      reinforced: 0,
      capturedCells: 0,
      gainedAreaM2: 0,
      hits: [],
      multipliers: { gain: 1, attack: 1, pushback: 1 },
    };
    if (status === 'applied') {
      const r = await applyLoopTx(c, userId, cells, loop.closedAt, now);
      applied.push({ idx: loop.index, tx: r, cells });
      const o = r.outcome;
      const captured = o.captured.flatMap((x) => x.cells);
      lr.newCells = o.newCells.length;
      lr.reinforced = o.reinforced.length;
      lr.capturedCells = captured.length;
      lr.gainedAreaM2 = Math.round(cellsAreaM2([...o.newCells, ...captured]));
      lr.multipliers = o.multipliers;
      gainedTotal += lr.gainedAreaM2;
      gainedCells.push(...o.newCells, ...captured);
      biggest = Math.max(biggest, areaM2);
      notices.push(...r.tickOutcome.notices, ...o.notices);
      add('loops_closed');
      add('empty_cells_claimed', o.newCells.length);
      add('duels_won', o.captured.length);
      add('recaptures', r.recaptured);
      const ev = activeEvents(loop.closedAt).map((e) => e.id);
      if ((o.newCells.length || captured.length) && ev.includes('morning')) add('morning_conquests');
      for (const h of o.hits) {
        const duel = r.world.duels.get(h.duelId)!;
        const opp = h.role === 'attack' ? duel.defenderId : duel.attackerId;
        opponentIds.add(opp);
        if (h.counted && h.role === 'defense') {
          add('defenses');
          if (h.multiplier > 1) add('evening_defenses');
        }
        if (h.counted && h.role === 'attack' && ev.includes('blitz')) add('blitz_attacks');
      }
      for (const cap of o.captured) losers.add(cap.fromId);
      // Düello önerisi (kendiliğinden başlamaz).
      for (const s of suggestDuels(r.world, userId, cells)) {
        opponentIds.add(s.defenderId);
        suggestions.push({ defender: { id: s.defenderId } as never, cells: s.cells, avgPower: s.avgPower, routeLengthM: Math.round(pathLengthM(outline(s.cells))) });
      }
      // Düello bitişleri: sahibin "atlattığı" düellolar ve yeni başlayan kuşatmalar.
      for (const pd of r.persisted.duels) {
        const before = r.persisted.before.duels.get(pd.id);
        if (before?.firstCountedAt === null && pd.firstCountedAt !== null) await bumpStats(c, pd.defenderId, { duels_faced: 1 });
        if (before?.status === 'active' && (pd.status === 'expired' || pd.status === 'closed') && pd.firstCountedAt !== null) {
          await bumpStats(c, pd.defenderId, { duels_defended: 1 });
        }
      }
    }
    await c.query(
      `INSERT INTO loops (id, run_id, user_id, idx, started_at, closed_at, length_m, area_m2, cells, status, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [uuid(), runId, userId, loop.index, new Date(loop.startedAt), new Date(loop.closedAt), loop.lengthM, areaM2, cells, status, JSON.stringify(lr)],
    );
    results.push(lr);
  }

  // Rakip bilgisi
  const pub = await loadPublicPlayers(c, opponentIds);
  const zones = await loadZones(c, opponentIds);
  // Gizlilik bölgesindeki peteklerin sahibi saldırgana adıyla gösterilmez.
  const oppFor = (id: string, cells: readonly string[]) =>
    pub.has(id) ? (anyHidden(zones.get(id), cells) ? hiddenPlayer(d, id, pub.get(id)!.slot) : pub.get(id)!) : null;
  for (const a of applied) {
    const lr = results.find((x) => x.index === a.idx)!;
    lr.hits = a.tx.outcome.hits.map((h): DuelHitDto => {
      const duel = a.tx.world.duels.get(h.duelId)!;
      const opp = h.role === 'attack' ? duel.defenderId : duel.attackerId;
      return {
        duelId: h.duelId,
        role: h.role,
        counted: h.counted,
        ...(h.reason ? { reason: h.reason } : {}),
        opponent: h.role === 'attack' ? oppFor(opp, duel.cells) : pub.get(opp) ?? null,
        hpBefore: Math.round(h.hpBefore),
        hpAfter: Math.round(h.hpAfter),
        captured: h.captured,
        cells: duel.cells.length,
      };
    });
  }
  const sugg = suggestions
    .filter((s) => pub.has(s.defender.id))
    .map((s) => ({ ...s, defender: oppFor(s.defender.id, s.cells)! }))
    .filter((s, i, arr) => arr.findIndex((x) => x.defender.id === s.defender.id) === i);

  // Bildirimler
  await insertNotifications(c, await buildNotifications(c, notices, now, HIDDEN_PLAYER_NAME), now);

  // İstatistik, seri, lig
  const lt = localTime(startedAt);
  if (lt.hour < 6) add('early_runs');
  if (lt.hour >= 22) add('late_runs');
  if (req.source !== 'phone') add('imported_runs');
  await bumpStats(c, userId, inc, { biggest_loop_m2: biggest, longest_run_m: distanceM }, distanceM);
  await c.query(
    `INSERT INTO run_days (user_id, day, distance_m) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, day) DO UPDATE SET distance_m = run_days.distance_m + EXCLUDED.distance_m`,
    [userId, dayKey(startedAt), distanceM],
  );
  const region = leagueRegionFor(pts[0]!);
  await c.query('UPDATE users SET league_region = $2, running_until = NULL, last_active_at = $3 WHERE id = $1', [userId, region, new Date(now)]);
  if (gainedTotal > 0) {
    for (const a of applied) {
      const lr = results.find((x) => x.index === a.idx)!;
      if (!lr.gainedAreaM2) continue;
      await c.query(
        `INSERT INTO area_gains (user_id, day, region, gained_m2) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, day, region) DO UPDATE SET gained_m2 = area_gains.gained_m2 + EXCLUDED.gained_m2`,
        [userId, dayKey(Date.parse(lr.closedAt)), region, lr.gainedAreaM2],
      );
    }
  }
  await refreshPeak(c, [userId, ...losers]);
  const fresh = await awardBadges(c, userId, now);
  const stats = fresh.length ? await playerStats(c, userId, now) : null;

  // Akış: fetih
  const totalCells = results.reduce((s, r) => s + r.newCells + r.capturedCells, 0);
  const duelCells = results.reduce((s, r) => s + r.capturedCells, 0);
  if (totalCells > 0) {
    await c.query('INSERT INTO feed_items (id, user_id, kind, title, subtitle, data, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      uuid(),
      userId,
      'conquest',
      `${totalCells} petek aldı`,
      `+${fmtInt(gainedTotal)} m² · ${fmtKm(distanceM, 1)} km${duelCells ? ` · ${duelCells}'i düelloyla` : ''}`,
      JSON.stringify({ runId, cells: gainedCells.slice(0, 2000) }),
      new Date(endedAt),
    ]);
  }

  const openGapM = loops.length === 0 ? Math.max(0, Math.round(haversineM(pts[0]!, pts[pts.length - 1]!) - closeR)) : null;
  const status: RunSummary['status'] =
    decision === 'stats_only' ? 'stats_only' : reviewInfo ? 'review' : results.some((r) => r.status === 'applied') ? 'applied' : 'open';
  const summary: RunSummary = {
    ...base,
    status,
    loops: results,
    openGapM,
    review: reviewInfo,
    newBadges: stats ? fresh.map((id) => badgeDto(id, stats, new Date(now))) : [],
    streakDays: (await streakFor(c, userId, now)).current,
    monthDistanceM: Math.round(await monthDistance(c, userId, now)),
    suggestions: sugg,
    totalGainedAreaM2: gainedTotal,
  };
  await c.query('UPDATE runs SET status = $2, summary = $3, gained_area_m2 = $4, open_gap_m = $5 WHERE id = $1', [runId, status, JSON.stringify(summary), gainedTotal, openGapM]);
  return summary;
}

async function insertRun(
  c: Tx,
  id: string,
  userId: string,
  req: SubmitRunRequest,
  startedAt: number,
  endedAt: number,
  distanceM: number,
  durationMs: number,
  pace: number | null,
  status: string,
  review: unknown,
  note: string | null,
  gained: number,
  summary: RunSummary | null,
  pts: TrackPoint[],
): Promise<void> {
  await c.query(
    `INSERT INTO runs (id, user_id, client_run_id, source, external_id, device, started_at, ended_at, distance_m, duration_ms, pace, status, points, review, note, gained_area_m2, summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      id,
      userId,
      req.clientRunId,
      req.source,
      req.externalId ?? null,
      req.device ?? null,
      new Date(startedAt),
      new Date(endedAt),
      distanceM,
      durationMs,
      pace,
      status,
      JSON.stringify(pts),
      review === null ? null : JSON.stringify(review),
      note,
      gained,
      summary === null ? null : JSON.stringify(summary),
    ],
  );
}
