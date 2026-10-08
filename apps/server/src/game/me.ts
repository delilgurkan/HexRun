import {
  BADGES,
  DAY_MS,
  RULES,
  cellsAreaM2,
  clampRadius,
  components,
  dayKey,
  isSlot,
  isSlotInsignia,
  localTime,
  makeZone,
  nearestBadges,
  outline,
  cellCenter,
  inZone,
  fmtInt,
} from '@hexrun/core';
import type { BadgesResponse, Me, ShareCard, StatsResponse, UpdateMeRequest, UsernameAvailability } from '@hexrun/contracts';
import type { Deps } from '../deps.js';
import { tx, txRetry } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { regionName } from '../lib/regions.js';
import { asSlot, getUser, toMe } from './players.js';
import { badgeDto, monthDistance, ownedBadges, playerStats, streakFor, territoryM2 } from './progress.js';
import { getLeague } from './social.js';
import { invalidateMap } from './map.js';

const RESERVED = new Set(['admin', 'hexrun', 'destek', 'support', 'root', 'moderator', 'gizli', 'gizlioyuncu', 'sistem', 'null', 'undefined']);
export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export function normalizeUsername(s: string): string {
  return s
    .trim()
    .replace(/^@/, '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

export async function usernameAvailability(d: Deps, raw: string, selfId?: string): Promise<UsernameAvailability> {
  const u = normalizeUsername(raw);
  if (!USERNAME_RE.test(u) || u.startsWith('.') || u.endsWith('.')) return { username: u, available: false, reason: 'invalid' };
  if (RESERVED.has(u.replace(/[._]/g, ''))) return { username: u, available: false, reason: 'reserved' };
  const r = await d.db.query<{ id: string }>('SELECT id FROM users WHERE lower(username) = $1', [u]);
  const taken = r.rows.some((x) => x.id !== selfId);
  return taken ? { username: u, available: false, reason: 'taken' } : { username: u, available: true };
}

export async function getMe(d: Deps, userId: string): Promise<Me> {
  const u = await getUser(d.db, userId);
  if (!u) throw notFound('Hesap bulunamadı.');
  return toMe(u, d.clock.now());
}

export async function updateMe(d: Deps, userId: string, req: UpdateMeRequest): Promise<Me> {
  if (req.username !== undefined) {
    const a = await usernameAvailability(d, req.username, userId);
    if (!a.available) throw (a.reason === 'taken' ? conflict : badRequest)(`username_${a.reason}`, a.reason === 'taken' ? 'Bu kullanıcı adı alınmış.' : 'Kullanıcı adı 3–20 karakter: harf, rakam, nokta, alt çizgi.');
    try {
      await d.db.query('UPDATE users SET username = $2 WHERE id = $1', [userId, a.username]);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflict('username_taken', 'Bu kullanıcı adı alınmış.');
      throw e;
    }
  }
  if (req.displayName !== undefined) {
    const n = String(req.displayName).trim().replace(/\s+/g, ' ');
    if (n.length < 1 || n.length > 40) throw badRequest('validation', 'Ad 1–40 karakter olmalı.');
    await d.db.query('UPDATE users SET display_name = $2 WHERE id = $1', [userId, n]);
  }
  if (req.slot !== undefined) {
    if (!isSlot(req.slot)) throw badRequest('validation', 'Geçersiz renk.');
    await d.db.query('UPDATE users SET slot = $2 WHERE id = $1', [userId, req.slot]);
  }
  return getMe(d, userId);
}

export async function setPrivacy(d: Deps, userId: string, home: { lat: number; lng: number } | null, radiusM?: number): Promise<Me> {
  if (home === null) {
    await d.db.query('UPDATE users SET privacy_lat = NULL, privacy_lng = NULL, privacy_radius_m = NULL WHERE id = $1', [userId]);
  } else {
    if (!Number.isFinite(home.lat) || !Number.isFinite(home.lng) || Math.abs(home.lat) > 85 || Math.abs(home.lng) > 180) throw badRequest('validation', 'Konum geçersiz.');
    // Ev konumu saklanmaz: yalnız rastgele kaydırılmış merkez.
    const z = makeZone(home, clampRadius(radiusM ?? 400));
    await d.db.query('UPDATE users SET privacy_lat = $2, privacy_lng = $3, privacy_radius_m = $4 WHERE id = $1', [userId, z.center.lat, z.center.lng, z.radiusM]);
  }
  return getMe(d, userId);
}

export async function getStats(d: Deps, userId: string): Promise<StatsResponse> {
  const now = d.clock.now();
  const s = await playerStats(d.db, userId, now);
  const t = await territoryM2(d.db, userId);
  const pace = await d.db.query<{ p: number | null }>(
    `SELECT (SUM(duration_ms) / 1000.0 / NULLIF(SUM(distance_m) / 1000.0, 0))::float8 p FROM runs
     WHERE user_id = $1 AND status <> 'duplicate' AND started_at >= $2`,
    [userId, new Date(Date.parse(`${dayKey(now).slice(0, 8)}01T00:00:00+03:00`))],
  );
  const faced = (await d.db.query<{ duels_faced: number; duels_defended: number }>('SELECT duels_faced, duels_defended FROM player_stats WHERE user_id = $1', [userId])).rows[0];
  const streak = await streakFor(d.db, userId, now);
  const days: StatsResponse['last14Days'] = [];
  const g = await d.db.query<{ day: string; v: number }>('SELECT day, SUM(gained_m2)::float8 v FROM area_gains WHERE user_id = $1 AND day > $2 GROUP BY day', [userId, dayKey(now - 14 * DAY_MS)]);
  const ran = new Set((await d.db.query<{ day: string }>('SELECT day FROM run_days WHERE user_id = $1 AND day > $2', [userId, dayKey(now - 14 * DAY_MS)])).rows.map((x) => x.day));
  const gm = new Map(g.rows.map((x) => [x.day, x.v]));
  for (let i = 13; i >= 0; i--) {
    const day = dayKey(now - i * DAY_MS);
    days.push({ day, gainedM2: Math.round(gm.get(day) ?? 0), ran: ran.has(day) });
  }
  const recentRuns = await d.db.query<{ ended_at: Date; summary: { loops?: Array<{ newCells: number; capturedCells: number; reinforced: number; gainedAreaM2: number; hits: Array<{ role: string; counted: boolean }> }> } | null }>(
    `SELECT ended_at, summary FROM runs WHERE user_id = $1 AND status IN ('applied') ORDER BY ended_at DESC LIMIT 5`,
    [userId],
  );
  const recent = recentRuns.rows.map((r) => {
    const loops = r.summary?.loops ?? [];
    const cells = loops.reduce((a, l) => a + l.newCells + l.capturedCells, 0);
    const duel = loops.reduce((a, l) => a + l.capturedCells, 0);
    const gained = loops.reduce((a, l) => a + l.gainedAreaM2, 0);
    const defended = loops.some((l) => l.hits.some((h) => h.role === 'defense' && h.counted));
    const day = dayKey(r.ended_at.getTime()) === dayKey(now) ? 'Bugün' : dayKey(r.ended_at.getTime()) === dayKey(now - DAY_MS) ? 'Dün' : r.ended_at.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: RULES.TIMEZONE });
    if (cells) return { at: r.ended_at.toISOString(), text: `${day} · ${cells} petek alındı${duel ? `, ${duel}'i düelloyla` : ''}`, delta: `+${fmtInt(gained)} m²` };
    if (defended) return { at: r.ended_at.toISOString(), text: `${day} · savunma halkası`, delta: 'güç +10' };
    return { at: r.ended_at.toISOString(), text: `${day} · halka`, delta: 'güç +10' };
  });
  const owned = (await d.db.query<{ id: string }>('SELECT id FROM cells WHERE owner_id = $1 LIMIT 5000', [userId])).rows.map((x) => x.id);
  const silhouettes = components(owned).slice(0, 8).map((comp) => outline(comp));
  const league = await getLeague(d, userId, 'individual', 'all');
  const me = (await getUser(d.db, userId))!;
  return {
    territoryM2: Math.round(t.m2),
    cells: t.cells,
    regionRank: league.me?.rank ?? null,
    regionName: me.league_region ? regionName(me.league_region) : null,
    monthDistanceM: Math.round(await monthDistance(d.db, userId, now)),
    avgPaceSecPerKm: pace.rows[0]?.p ? Math.round(pace.rows[0].p) : null,
    defenses: { won: faced?.duels_defended ?? 0, total: faced?.duels_faced ?? 0 },
    biggestLoopM2: Math.round(s.biggestLoopM2),
    streakDays: streak.current,
    bestStreakDays: streak.best,
    last14Days: days,
    recent,
    silhouettes,
  };
}

export async function getBadges(d: Deps, userId: string): Promise<BadgesResponse> {
  const now = d.clock.now();
  const stats = await playerStats(d.db, userId, now);
  const earned = new Map((await d.db.query<{ badge_id: string; earned_at: Date }>('SELECT badge_id, earned_at FROM badges_earned WHERE user_id = $1', [userId])).rows.map((x) => [x.badge_id, x.earned_at]));
  const u = (await getUser(d.db, userId))!;
  const slots: Array<string | null> = [0, 1, 2].map((i) => u.insignia[i] ?? null);
  return {
    earned: earned.size,
    total: BADGES.length,
    badges: BADGES.map((b) => badgeDto(b.id, stats, earned.get(b.id) ?? null)),
    nearest: nearestBadges(stats, new Set(earned.keys()), 3).map((x) => badgeDto(x.badge.id, stats, null)),
    slots,
    canChangeInsignia: u.insignia_changed_on !== dayKey(now),
  };
}

export async function setInsignia(d: Deps, userId: string, slots: Array<string | null>): Promise<BadgesResponse> {
  if (!Array.isArray(slots) || slots.length > RULES.INSIGNIA_SLOTS) throw badRequest('validation', 'En çok 3 nişan takılır.');
  const ids = slots.filter((x): x is string => !!x);
  if (new Set(ids).size !== ids.length) throw badRequest('validation', 'Aynı nişan iki kez takılamaz.');
  const now = d.clock.now();
  await tx(d.db, async (c) => {
    const u = (await c.query<{ insignia_changed_on: string | null; running_until: Date | null; insignia: string[] }>('SELECT insignia_changed_on, running_until, insignia FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0]!;
    if (JSON.stringify(u.insignia) === JSON.stringify(ids)) return;
    if (u.insignia_changed_on === dayKey(now)) throw conflict('insignia_daily_limit', 'Nişan değişikliği günde 1 kez.');
    if (u.running_until && u.running_until.getTime() > now) throw conflict('insignia_running', 'Koşu sırasında nişan değiştirilemez.');
    const owned = await ownedBadges(c, userId);
    for (const id of ids) {
      if (!isSlotInsignia(id)) throw badRequest('not_insignia', 'Bu rozet nişan olarak takılamaz.');
      if (!owned.has(id)) throw badRequest('not_earned', 'Bu rozeti henüz kazanmadın.');
    }
    await c.query('UPDATE users SET insignia = $2, insignia_changed_on = $3 WHERE id = $1', [userId, ids, dayKey(now)]);
  });
  return getBadges(d, userId);
}

export function isoWeek(ms: number): string {
  const day = dayKey(ms);
  const wd = localTime(ms).weekday;
  const monday = new Date(Date.parse(`${day}T00:00:00Z`) - ((wd + 6) % 7) * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

export async function activateShield(d: Deps, userId: string, cells: string[]): Promise<Me> {
  const now = d.clock.now();
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > RULES.DUEL_MAX_CELLS) throw badRequest('validation', 'Kalkan 1–60 peteğe uygulanır.');
  const u = (await getUser(d.db, userId))!;
  if (!u.insignia.includes('kale-bekcisi')) throw badRequest('insignia_required', 'Kale Bekçisi nişanı takılı olmalı.');
  if (u.shield_week === isoWeek(now)) throw conflict('shield_weekly_limit', 'Kalkan haftada 1 kez kullanılır.');
  const mine = await d.db.query<{ n: string }>('SELECT COUNT(*) n FROM cells WHERE id = ANY($1::text[]) AND owner_id = $2', [cells, userId]);
  if (Number(mine.rows[0]!.n) !== new Set(cells).size) throw badRequest('not_owned', 'Kalkan yalnız kendi peteklerine uygulanır.');
  await d.db.query('UPDATE users SET shield_cells = $2, shield_until = $3, shield_week = $4 WHERE id = $1', [userId, [...new Set(cells)], new Date(now + DAY_MS), isoWeek(now)]);
  return getMe(d, userId);
}

export async function shareCard(d: Deps, userId: string, runId: string): Promise<ShareCard> {
  const r = (await d.db.query<{ user_id: string; summary: { loops?: Array<{ gainedAreaM2: number; capturedCells: number }> } | null; distance_m: number; duration_ms: number; pace: number | null; ended_at: Date }>('SELECT user_id, summary, distance_m, duration_ms, pace, ended_at FROM runs WHERE id = $1', [runId])).rows[0];
  if (!r || r.user_id !== userId) throw notFound('Koşu bulunamadı.');
  const u = (await getUser(d.db, userId))!;
  const feed = (await d.db.query<{ data: { cells?: string[] } }>(`SELECT data FROM feed_items WHERE user_id = $1 AND kind = 'conquest' AND data->>'runId' = $2`, [userId, runId])).rows[0];
  let cells = feed?.data.cells ?? [];
  // Gizlilik bölgesindeki petekler silüete girmez.
  if (u.privacy_radius_m !== null && u.privacy_lat !== null && u.privacy_lng !== null) {
    const z = { center: { lat: u.privacy_lat, lng: u.privacy_lng! }, radiusM: u.privacy_radius_m };
    cells = cells.filter((c) => !inZone(z, cellCenter(c)));
  }
  const gained = Math.round(cellsAreaM2(cells));
  const captured = (r.summary?.loops ?? []).reduce((s, l) => s + l.capturedCells, 0);
  const lt = new Date(r.ended_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: RULES.TIMEZONE }).toLocaleUpperCase('tr-TR');
  return {
    dateLabel: lt,
    kicker: captured ? 'FETİH · DÜELLO' : 'FETİH',
    gainedAreaM2: gained,
    line: `${cells.length} petek${captured ? `, ${captured}'i düelloyla` : ''}`,
    distanceM: Math.round(r.distance_m),
    durationMs: r.duration_ms,
    paceSecPerKm: r.pace === null ? null : Math.round(r.pace),
    username: u.username ? `@${u.username}` : u.display_name,
    teamName: u.team_name ?? null,
    slot: asSlot(u.slot),
    silhouette: components(cells).slice(0, 12).map((comp) => outline(comp)),
  };
}

/** KVKK/GDPR: tüm kişisel veriyi dışa aktar. */
export async function exportData(d: Deps, userId: string): Promise<Record<string, unknown>> {
  const q = (sql: string) => d.db.query(sql, [userId]).then((r) => r.rows);
  return {
    exportedAt: new Date(d.clock.now()).toISOString(),
    user: (await q('SELECT id, email, username, display_name, slot, locale, created_at, insignia, team_id, league_region FROM users WHERE id = $1'))[0],
    stats: (await q('SELECT * FROM player_stats WHERE user_id = $1'))[0] ?? null,
    runs: await q('SELECT id, source, started_at, ended_at, distance_m, duration_ms, status, points, summary FROM runs WHERE user_id = $1 ORDER BY started_at'),
    loops: await q('SELECT id, run_id, closed_at, length_m, area_m2, status FROM loops WHERE user_id = $1 ORDER BY closed_at'),
    cells: await q('SELECT id, power, owned_since FROM cells WHERE owner_id = $1'),
    badges: await q('SELECT badge_id, earned_at FROM badges_earned WHERE user_id = $1'),
    notifications: await q('SELECT kind, title, body, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at'),
    friends: await q('SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS friend_id, created_at FROM friendships WHERE user_a = $1 OR user_b = $1'),
    integrations: await q('SELECT provider, import_enabled, export_enabled, last_sync_at, device FROM integrations WHERE user_id = $1'),
  };
}

/** Hesabı sil: petekler boşa düşer, düellolar ve tüm kişisel veriler silinir. */
export async function deleteAccount(d: Deps, userId: string): Promise<void> {
  await txRetry(d.db, async (c) => {
    const regions = (await c.query<{ r: string }>('SELECT DISTINCT lock_region r FROM cells WHERE owner_id = $1', [userId])).rows.map((x) => x.r).sort();
    for (const r of regions) await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`region:${r}`]);
    const team = (await c.query<{ team_id: string | null }>('SELECT team_id FROM users WHERE id = $1', [userId])).rows[0]?.team_id;
    if (team) {
      const t = (await c.query<{ captain_id: string }>('SELECT captain_id FROM teams WHERE id = $1', [team])).rows[0];
      if (t?.captain_id === userId) {
        const next = await c.query<{ id: string }>('SELECT id FROM users WHERE team_id = $1 AND id <> $2 ORDER BY created_at LIMIT 1', [team, userId]);
        if (next.rows[0]) await c.query('UPDATE teams SET captain_id = $2 WHERE id = $1', [team, next.rows[0].id]);
        else {
          await c.query('UPDATE users SET team_id = NULL WHERE team_id = $1', [team]);
          await c.query('DELETE FROM teams WHERE id = $1', [team]);
        }
      }
    }
    const released = (await c.query<{ id: string }>('SELECT id FROM cells WHERE owner_id = $1', [userId])).rows.map((x) => x.id);
    invalidateMap(released);
    await c.query(
      `UPDATE cells SET owner_id = NULL, power = 0, owned_since = NULL, last_owner_loop_at = NULL, decay_steps = 0, owner_loops_day = NULL, owner_loops_count = 0 WHERE owner_id = $1`,
      [userId],
    );
    await c.query('UPDATE cell_events SET actor_id = NULL WHERE actor_id = $1', [userId]);
    await c.query('UPDATE cell_events SET from_id = NULL WHERE from_id = $1', [userId]);
    // Başkalarının bildirimlerinde bu oyuncuyu anan satırlar da silinir.
    await c.query(`DELETE FROM notifications WHERE data->>'actorId' = $1`, [userId]);
    await c.query('DELETE FROM users WHERE id = $1', [userId]);
  });
}

