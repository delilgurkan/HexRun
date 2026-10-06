import {
  BADGES,
  BADGE_BY_ID,
  computeStreak,
  dayKey,
  earnedBadges,
  streakFreezesPerMonth,
  type PlayerStats,
} from '@hexrun/core';
import type { BadgeDto } from '@hexrun/contracts';
import type { Queryable } from '../db.js';
import { uuid } from '../lib/crypto.js';
import { insertNotifications } from './notify.js';

export type StatKey =
  | 'loops_closed'
  | 'empty_cells_claimed'
  | 'duels_won'
  | 'recaptures'
  | 'defenses'
  | 'duels_faced'
  | 'duels_defended'
  | 'early_runs'
  | 'late_runs'
  | 'morning_conquests'
  | 'blitz_attacks'
  | 'evening_defenses'
  | 'imported_runs';

export async function bumpStats(q: Queryable, userId: string, inc: Partial<Record<StatKey, number>>, max: Partial<Record<'biggest_loop_m2' | 'longest_run_m' | 'peak_territory_m2', number>> = {}, addDistance = 0): Promise<void> {
  const keys = Object.entries(inc).filter(([, v]) => v);
  const maxes = Object.entries(max).filter(([, v]) => v !== undefined);
  await q.query('INSERT INTO player_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
  if (!keys.length && !maxes.length && !addDistance) return;
  const sets: string[] = [];
  const vals: unknown[] = [userId];
  for (const [k, v] of keys) {
    vals.push(v);
    sets.push(`${k} = ${k} + $${vals.length}`);
  }
  for (const [k, v] of maxes) {
    vals.push(v);
    sets.push(`${k} = GREATEST(${k}, $${vals.length})`);
  }
  if (addDistance) {
    vals.push(addDistance);
    sets.push(`total_distance_m = total_distance_m + $${vals.length}`);
  }
  await q.query(`UPDATE player_stats SET ${sets.join(', ')} WHERE user_id = $1`, vals);
}

export async function territoryM2(q: Queryable, userId: string): Promise<{ m2: number; cells: number }> {
  const r = await q.query<{ m2: number | null; n: string }>('SELECT COALESCE(SUM(area_m2), 0)::float8 AS m2, COUNT(*) AS n FROM cells WHERE owner_id = $1', [userId]);
  return { m2: Number(r.rows[0]?.m2 ?? 0), cells: Number(r.rows[0]?.n ?? 0) };
}

export async function refreshPeak(q: Queryable, userIds: Iterable<string>): Promise<void> {
  for (const id of new Set(userIds)) {
    const t = await territoryM2(q, id);
    await bumpStats(q, id, {}, { peak_territory_m2: t.m2 });
  }
}

export async function streakFor(q: Queryable, userId: string, now: number, owned?: Set<string>): Promise<{ current: number; best: number }> {
  const r = await q.query<{ day: string }>('SELECT day FROM run_days WHERE user_id = $1 ORDER BY day', [userId]);
  const badges = owned ?? (await ownedBadges(q, userId));
  return computeStreak(r.rows.map((x) => x.day), dayKey(now), streakFreezesPerMonth(badges));
}

export async function ownedBadges(q: Queryable, userId: string): Promise<Set<string>> {
  const r = await q.query<{ badge_id: string }>('SELECT badge_id FROM badges_earned WHERE user_id = $1', [userId]);
  return new Set(r.rows.map((x) => x.badge_id));
}

export async function monthDistance(q: Queryable, userId: string, now: number): Promise<number> {
  const month = dayKey(now).slice(0, 7);
  const r = await q.query<{ m: number }>(`SELECT COALESCE(SUM(distance_m), 0)::float8 AS m FROM run_days WHERE user_id = $1 AND to_char(day, 'YYYY-MM') = $2`, [userId, month]);
  return Number(r.rows[0]?.m ?? 0);
}

export async function playerStats(q: Queryable, userId: string, now: number): Promise<PlayerStats> {
  await q.query('INSERT INTO player_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
  const s = (await q.query('SELECT * FROM player_stats WHERE user_id = $1', [userId])).rows[0] as Record<string, number>;
  const u = (await q.query<{ created_at: Date; team_id: string | null }>('SELECT created_at, team_id FROM users WHERE id = $1', [userId])).rows[0]!;
  const t = await territoryM2(q, userId);
  const owned = await ownedBadges(q, userId);
  const streak = await streakFor(q, userId, now, owned);
  const bestMonth = await q.query<{ m: number }>(
    `SELECT COALESCE(MAX(s), 0)::float8 AS m FROM (SELECT SUM(distance_m) s FROM run_days WHERE user_id = $1 GROUP BY to_char(day, 'YYYY-MM')) x`,
    [userId],
  );
  const friends = await q.query<{ n: string }>('SELECT COUNT(*) n FROM friendships WHERE user_a = $1 OR user_b = $1', [userId]);
  const claps = await q.query<{ n: string }>('SELECT COUNT(*) n FROM claps c JOIN feed_items f ON f.id = c.feed_id WHERE f.user_id = $1', [userId]);
  return {
    loopsClosed: s.loops_closed ?? 0,
    emptyCellsClaimed: s.empty_cells_claimed ?? 0,
    territoryM2: t.m2,
    peakTerritoryM2: Math.max(s.peak_territory_m2 ?? 0, t.m2),
    biggestLoopM2: s.biggest_loop_m2 ?? 0,
    duelsWon: s.duels_won ?? 0,
    recaptures: s.recaptures ?? 0,
    defenses: s.defenses ?? 0,
    duelsDefended: s.duels_defended ?? 0,
    bestStreakDays: streak.best,
    earlyRuns: s.early_runs ?? 0,
    lateRuns: s.late_runs ?? 0,
    morningConquests: s.morning_conquests ?? 0,
    blitzAttacks: s.blitz_attacks ?? 0,
    eveningDefenses: s.evening_defenses ?? 0,
    longestRunM: s.longest_run_m ?? 0,
    bestMonthDistanceM: Number(bestMonth.rows[0]?.m ?? 0),
    totalDistanceM: s.total_distance_m ?? 0,
    inTeam: !!u.team_id,
    friends: Number(friends.rows[0]?.n ?? 0),
    clapsReceived: Number(claps.rows[0]?.n ?? 0),
    importedRuns: s.imported_runs ?? 0,
    daysSinceSignup: Math.floor((now - u.created_at.getTime()) / 86_400_000),
  };
}

/** Yeni kazanılan rozetleri yazar; bildirim ve akış öğesi üretir. */
export async function awardBadges(q: Queryable, userId: string, now: number): Promise<string[]> {
  const stats = await playerStats(q, userId, now);
  const owned = await ownedBadges(q, userId);
  const fresh = earnedBadges(stats).filter((id) => !owned.has(id));
  if (!fresh.length) return [];
  await q.query(
    'INSERT INTO badges_earned (user_id, badge_id, earned_at) SELECT $1, unnest($2::text[]), $3 ON CONFLICT DO NOTHING',
    [userId, fresh, new Date(now)],
  );
  await insertNotifications(
    q,
    fresh.map((id) => {
      const b = BADGE_BY_ID.get(id)!;
      return { userId, kind: 'badge' as const, category: 'other' as const, title: `Yeni rozet: ${b.name}`, body: b.how, data: { badgeId: id }, push: false };
    }),
    now,
  );
  for (const id of fresh) {
    const b = BADGE_BY_ID.get(id)!;
    await q.query('INSERT INTO feed_items (id, user_id, kind, title, subtitle, data, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      uuid(),
      userId,
      'badge',
      `Yeni rozet: ${b.name}`,
      b.how,
      JSON.stringify({ badgeId: id }),
      new Date(now),
    ]);
  }
  // Nişanlar ilk kez açıldıysa (ikinci rozet) ilk uygun nişanı boş slota tak.
  if (owned.size < 2 && owned.size + fresh.length >= 2) {
    await q.query(`INSERT INTO notifications (id, user_id, kind, category, title, body, data, created_at, push, push_after)
      VALUES ($1, $2, 'badge', 'other', 'Nişanlar açıldı', 'Rozetlerin artık haritada iş görür. Aynı anda 3 nişan takabilirsin.', '{"insigniaUnlocked":true}', $3, false, $3)`, [uuid(), userId, new Date(now)]);
  }
  return fresh;
}

export function badgeDto(id: string, stats: PlayerStats, earnedAt: Date | null): BadgeDto {
  const b = BADGE_BY_ID.get(id)!;
  return {
    id: b.id,
    name: b.name,
    category: b.category,
    how: b.how,
    earned: !!earnedAt,
    earnedAt: earnedAt ? earnedAt.toISOString() : null,
    progress: b.progress(stats),
    insignia: b.insignia ? { ...b.insignia } : null,
  };
}

export const ALL_BADGE_IDS = BADGES.map((b) => b.id);
