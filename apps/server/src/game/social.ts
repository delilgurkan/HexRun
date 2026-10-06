import { DAY_MS, addDays, dayKey, initials, localTime, fmtInt, isSlot, SLOTS } from '@hexrun/core';
import type { FeedItem, FriendsResponse, LeaguePeriod, LeagueResponse, LeagueRow, LeagueScope, Page, TeamResponse } from '@hexrun/contracts';
import type { Deps } from '../deps.js';
import { tx, type Queryable } from '../db.js';
import { inviteCode, uuid } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { regionName } from '../lib/regions.js';
import { asSlot, getUser, loadPublicPlayers, toPublic, type UserRow } from './players.js';

/* ─────────────── Lig ─────────────── */

/** Dönem başlangıcı (yerel gün): hafta Pazartesi, ay 1'i. */
export function periodStart(period: LeaguePeriod, now: number): string | null {
  const today = dayKey(now);
  if (period === 'all') return null;
  if (period === 'month') return `${today.slice(0, 8)}01`;
  const wd = localTime(now).weekday; // 0 Pazar
  return addDays(today, -((wd + 6) % 7));
}

export function periodEnd(period: LeaguePeriod, now: number): string | null {
  const s = periodStart(period, now);
  if (!s) return null;
  if (period === 'week') return addDays(s, 7);
  const [y, m] = s.split('-').map(Number) as [number, number];
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
}

interface Ranked {
  id: string;
  name: string;
  slot: string;
  value: number;
  subtitle: string | null;
}

async function individualRanking(q: Queryable, region: string, period: LeaguePeriod, now: number): Promise<Ranked[]> {
  const start = periodStart(period, now);
  if (start === null) {
    const r = await q.query<{ id: string; display_name: string; username: string | null; slot: string; v: number; team: string | null }>(
      `SELECT u.id, u.display_name, u.username, u.slot, t.name AS team, COALESCE(SUM(c.area_m2), 0)::float8 AS v
       FROM users u LEFT JOIN cells c ON c.owner_id = u.id LEFT JOIN teams t ON t.id = u.team_id
       WHERE u.league_region = $1 GROUP BY u.id, t.name ORDER BY v DESC, u.created_at ASC LIMIT 200`,
      [region],
    );
    return r.rows.map((x) => ({ id: x.id, name: x.display_name || x.username || 'Oyuncu', slot: x.slot, value: x.v, subtitle: x.team }));
  }
  const r = await q.query<{ id: string; display_name: string; username: string | null; slot: string; v: number; team: string | null }>(
    `SELECT u.id, u.display_name, u.username, u.slot, t.name AS team, COALESCE(SUM(g.gained_m2), 0)::float8 AS v
     FROM users u LEFT JOIN area_gains g ON g.user_id = u.id AND g.day >= $2 LEFT JOIN teams t ON t.id = u.team_id
     WHERE u.league_region = $1 GROUP BY u.id, t.name ORDER BY v DESC, u.created_at ASC LIMIT 200`,
    [region, start],
  );
  return r.rows.map((x) => ({ id: x.id, name: x.display_name || x.username || 'Oyuncu', slot: x.slot, value: x.v, subtitle: x.team }));
}

async function teamRanking(q: Queryable, region: string, period: LeaguePeriod, now: number): Promise<Ranked[]> {
  const start = periodStart(period, now);
  const r =
    start === null
      ? await q.query<{ id: string; name: string; slot: string; v: number; members: string }>(
          `SELECT t.id, t.name, t.slot, COALESCE(SUM(c.area_m2), 0)::float8 AS v, COUNT(DISTINCT u.id) AS members
           FROM teams t JOIN users u ON u.team_id = t.id LEFT JOIN cells c ON c.owner_id = u.id
           WHERE t.region = $1 GROUP BY t.id ORDER BY v DESC LIMIT 200`,
          [region],
        )
      : await q.query<{ id: string; name: string; slot: string; v: number; members: string }>(
          `SELECT t.id, t.name, t.slot, COALESCE(SUM(g.gained_m2), 0)::float8 AS v, COUNT(DISTINCT u.id) AS members
           FROM teams t JOIN users u ON u.team_id = t.id LEFT JOIN area_gains g ON g.user_id = u.id AND g.day >= $2
           WHERE t.region = $1 GROUP BY t.id ORDER BY v DESC LIMIT 200`,
          [region, start],
        );
  return r.rows.map((x) => ({ id: x.id, name: x.name, slot: x.slot, value: x.v, subtitle: `${x.members} üye` }));
}

export async function getLeague(d: Deps, userId: string, scope: LeagueScope, period: LeaguePeriod): Promise<LeagueResponse> {
  const now = d.clock.now();
  const me = (await getUser(d.db, userId))!;
  const region = me.league_region ?? (me.team_id ? (await d.db.query<{ region: string | null }>('SELECT region FROM teams WHERE id = $1', [me.team_id])).rows[0]?.region ?? null : null);
  const regionKey = region ?? 'none';
  const ranked = region ? (scope === 'individual' ? await individualRanking(d.db, region, period, now) : await teamRanking(d.db, region, period, now)) : [];
  const myKey = scope === 'individual' ? userId : me.team_id;
  // Önceki günün anlık görüntüsüyle sıra değişimi.
  const snap = await d.db.query<{ ranks: Record<string, number> }>(
    'SELECT ranks FROM league_snapshots WHERE region = $1 AND scope = $2 AND period = $3 AND day < $4 ORDER BY day DESC LIMIT 1',
    [regionKey, scope, period, dayKey(now)],
  );
  const prev = snap.rows[0]?.ranks ?? {};
  const rows: LeagueRow[] = ranked.map((x, i) => ({
    rank: i + 1,
    id: x.id,
    name: x.name,
    initials: initials(x.name),
    slot: asSlot(x.slot),
    valueM2: Math.round(x.value),
    delta: prev[x.id] !== undefined ? prev[x.id]! - (i + 1) : null,
    subtitle: x.subtitle,
    isMe: x.id === myKey,
  }));
  const meRow = rows.find((r) => r.isMe) ?? null;
  let meNote: string | null = null;
  if (meRow) {
    const next = rows[meRow.rank - 2];
    const after = rows[meRow.rank];
    if (meRow.rank === 1 && after) meNote = `2.'ye ${fmtInt(meRow.valueM2 - after.valueM2)} m² önde`;
    else if (next) meNote = `${next.rank}.'ye ${fmtInt(next.valueM2 - meRow.valueM2)} m² geride`;
  }
  const end = periodEnd(period, now);
  return {
    regionId: regionKey,
    regionName: regionName(region),
    scope,
    period,
    rows: rows.slice(0, 100),
    me: meRow,
    meNote,
    endsAt: end ? new Date(Date.parse(`${end}T00:00:00+03:00`)).toISOString() : null,
    updatedAt: new Date(now).toISOString(),
  };
}

/** Günlük sıra anlık görüntüsü (sıra değişimi oku için). */
export async function snapshotLeagues(d: Deps): Promise<number> {
  const now = d.clock.now();
  const regions = (await d.db.query<{ r: string }>('SELECT DISTINCT league_region r FROM users WHERE league_region IS NOT NULL')).rows.map((x) => x.r);
  let n = 0;
  for (const region of regions) {
    for (const period of ['week', 'month', 'all'] as const) {
      for (const scope of ['individual', 'team'] as const) {
        const ranked = scope === 'individual' ? await individualRanking(d.db, region, period, now) : await teamRanking(d.db, region, period, now);
        const ranks = Object.fromEntries(ranked.map((x, i) => [x.id, i + 1]));
        await d.db.query(
          `INSERT INTO league_snapshots (region, scope, period, day, ranks) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (region, scope, period, day) DO UPDATE SET ranks = EXCLUDED.ranks`,
          [region, scope, period, dayKey(now), JSON.stringify(ranks)],
        );
        n++;
      }
    }
  }
  return n;
}

/* ─────────────── Takım ─────────────── */

export async function getTeam(d: Deps, viewerId: string, teamId: string): Promise<TeamResponse> {
  const t = (await d.db.query<{ id: string; name: string; slot: string; captain_id: string; invite_code: string; region: string | null }>('SELECT * FROM teams WHERE id = $1', [teamId])).rows[0];
  if (!t) throw notFound('Takım bulunamadı.');
  const members = (
    await d.db.query<UserRow & { territory: number }>(
      `SELECT u.*, $2::text AS team_name, COALESCE((SELECT SUM(area_m2) FROM cells WHERE owner_id = u.id), 0)::float8 AS territory
       FROM users u WHERE u.team_id = $1 ORDER BY territory DESC`,
      [teamId, t.name],
    )
  ).rows;
  const ids = members.map((m) => m.id);
  const now = d.clock.now();
  const week = periodStart('week', now)!;
  const wg = await d.db.query<{ v: number }>('SELECT COALESCE(SUM(gained_m2), 0)::float8 v FROM area_gains WHERE user_id = ANY($1::uuid[]) AND day >= $2', [ids, week]);
  const cells = await d.db.query<{ n: string }>('SELECT COUNT(*) n FROM cells WHERE owner_id = ANY($1::uuid[])', [ids]);
  let regionRank: number | null = null;
  if (t.region) {
    const ranking = await teamRanking(d.db, t.region, 'all', now);
    const i = ranking.findIndex((x) => x.id === teamId);
    regionRank = i >= 0 ? i + 1 : null;
  }
  const isMember = ids.includes(viewerId);
  const captain = members.find((m) => m.id === t.captain_id);
  return {
    id: t.id,
    name: t.name,
    slot: asSlot(t.slot),
    inviteCode: isMember ? t.invite_code : null,
    captain: captain ? toPublic(captain) : (await loadPublicPlayers(d.db, [t.captain_id])).get(t.captain_id)!,
    members: members.map((m) => ({ player: toPublic(m), role: m.id === t.captain_id ? 'captain' : 'member', territoryM2: Math.round(m.territory) })),
    territoryM2: Math.round(members.reduce((s, m) => s + m.territory, 0)),
    weekGainM2: Math.round(wg.rows[0]?.v ?? 0),
    cells: Number(cells.rows[0]?.n ?? 0),
    regionRank,
  };
}

export function validTeamName(name: unknown): string {
  const s = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (s.length < 3 || s.length > 32 || !/^[\p{L}\p{N} .'-]+$/u.test(s)) throw badRequest('validation', 'Takım adı 3–32 karakter; harf, rakam, boşluk.');
  return s;
}

export async function createTeam(d: Deps, userId: string, name: string): Promise<TeamResponse> {
  const clean = validTeamName(name);
  const id = uuid();
  await tx(d.db, async (c) => {
    const me = (await c.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0]!;
    if (me.team_id) throw conflict('already_in_team', 'Zaten bir takımdasın.');
    const taken = await c.query('SELECT 1 FROM teams WHERE lower(name) = lower($1)', [clean]);
    if (taken.rowCount) throw conflict('team_name_taken', 'Bu takım adı alınmış.');
    // Takım bir slot alır: kaptanın imza rengi.
    await c.query('INSERT INTO teams (id, name, slot, captain_id, invite_code, region, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      id,
      clean,
      isSlot(me.slot) ? me.slot : SLOTS[0],
      userId,
      inviteCode(8),
      me.league_region,
      new Date(d.clock.now()),
    ]);
    await c.query('UPDATE users SET team_id = $2 WHERE id = $1', [userId, id]);
  });
  return getTeam(d, userId, id);
}

export async function joinTeam(d: Deps, userId: string, code: string): Promise<TeamResponse> {
  const t = (await d.db.query<{ id: string; name: string }>('SELECT id, name FROM teams WHERE invite_code = $1', [String(code).trim().toUpperCase()])).rows[0];
  if (!t) throw notFound('Davet kodu geçersiz.');
  await tx(d.db, async (c) => {
    const me = (await c.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0]!;
    if (me.team_id === t.id) return;
    if (me.team_id) throw conflict('already_in_team', 'Önce mevcut takımından ayrıl.');
    const n = await c.query<{ n: string }>('SELECT COUNT(*) n FROM users WHERE team_id = $1', [t.id]);
    if (Number(n.rows[0]!.n) >= 50) throw conflict('team_full', 'Takım dolu (50 üye).');
    await c.query('UPDATE users SET team_id = $2 WHERE id = $1', [userId, t.id]);
    const members = await c.query<{ id: string }>('SELECT id FROM users WHERE team_id = $1 AND id <> $2', [t.id, userId]);
    const name = me.display_name || me.username || 'Yeni üye';
    for (const m of members.rows) {
      await c.query(
        `INSERT INTO notifications (id, user_id, kind, category, title, body, data, created_at, push, push_after) VALUES ($1, $2, 'team', 'team', $3, $4, '{}', $5, false, $5)`,
        [uuid(), m.id, `${name} takıma katıldı`, `${t.name} büyüyor.`, new Date(d.clock.now())],
      );
    }
  });
  return getTeam(d, userId, t.id);
}

export async function leaveTeam(d: Deps, userId: string): Promise<void> {
  await tx(d.db, async (c) => {
    const me = (await c.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0]!;
    if (!me.team_id) return;
    const t = (await c.query<{ captain_id: string }>('SELECT captain_id FROM teams WHERE id = $1 FOR UPDATE', [me.team_id])).rows[0]!;
    await c.query('UPDATE users SET team_id = NULL WHERE id = $1', [userId]);
    if (t.captain_id === userId) {
      const next = await c.query<{ id: string }>('SELECT id FROM users WHERE team_id = $1 ORDER BY created_at LIMIT 1', [me.team_id]);
      if (next.rows[0]) await c.query('UPDATE teams SET captain_id = $2 WHERE id = $1', [me.team_id, next.rows[0].id]);
      else await c.query('DELETE FROM teams WHERE id = $1', [me.team_id]);
    }
  });
}

/* ─────────────── Arkadaşlar ve akış ─────────────── */

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export async function friendIds(q: Queryable, userId: string): Promise<string[]> {
  const r = await q.query<{ id: string }>('SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS id FROM friendships WHERE user_a = $1 OR user_b = $1', [userId]);
  return r.rows.map((x) => x.id);
}

export async function getFriends(d: Deps, userId: string): Promise<FriendsResponse> {
  const now = d.clock.now();
  const ids = await friendIds(d.db, userId);
  const pub = await loadPublicPlayers(d.db, ids);
  const me = (await getUser(d.db, userId))!;
  const besiegers = new Set(
    (await d.db.query<{ id: string }>(`SELECT attacker_id id FROM duels WHERE status = 'active' AND defender_id = $1 AND defender_visible_at <= $2`, [userId, new Date(now)])).rows.map((x) => x.id),
  );
  const targets = new Set((await d.db.query<{ id: string }>(`SELECT defender_id id FROM duels WHERE status = 'active' AND attacker_id = $1`, [userId])).rows.map((x) => x.id));
  const info = new Map(
    (
      await d.db.query<{ id: string; running_until: Date | null; loops: string }>(
        `SELECT u.id, u.running_until, (SELECT COUNT(*) FROM loops l WHERE l.user_id = u.id AND l.closed_at >= $2 AND l.status = 'applied') loops
         FROM users u WHERE u.id = ANY($1::uuid[])`,
        [ids, new Date(Date.parse(`${periodStart('week', now)}T00:00:00+03:00`))],
      )
    ).rows.map((x) => [x.id, x]),
  );
  const friends = ids
    .filter((id) => pub.has(id))
    .map((id) => {
      const i = info.get(id);
      const running = !!i?.running_until && i.running_until.getTime() > now;
      if (besiegers.has(id)) return { player: pub.get(id)!, relation: 'seni kuşatıyor', status: 'besieging_you' as const };
      if (running) return { player: pub.get(id)!, relation: 'şu an koşuyor', status: 'running' as const };
      if (targets.has(id)) return { player: pub.get(id)!, relation: 'onunla düellodasın', status: 'you_besiege' as const };
      return { player: pub.get(id)!, relation: `bu hafta ${Number(i?.loops ?? 0)} halka`, status: 'idle' as const };
    });
  const order = { besieging_you: 0, running: 1, you_besiege: 2, idle: 3 };
  friends.sort((a, b) => order[a.status] - order[b.status] || a.player.displayName.localeCompare(b.player.displayName, 'tr'));
  return { friends, inviteCode: me.invite_code };
}

export async function acceptFriend(d: Deps, userId: string, code: string): Promise<FriendsResponse> {
  const other = (await d.db.query<{ id: string }>('SELECT id FROM users WHERE invite_code = $1', [String(code).trim().toUpperCase()])).rows[0];
  if (!other) throw notFound('Davet kodu geçersiz.');
  if (other.id === userId) throw badRequest('self_invite', 'Kendi davet kodunu kullanamazsın.');
  const [a, b] = pair(userId, other.id);
  const n = await d.db.query<{ n: string }>('SELECT COUNT(*) n FROM friendships WHERE user_a = $1 OR user_b = $1', [userId]);
  if (Number(n.rows[0]!.n) >= 500) throw conflict('friend_limit', 'Arkadaş sınırına ulaştın.');
  await d.db.query('INSERT INTO friendships (user_a, user_b, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [a, b, new Date(d.clock.now())]);
  return getFriends(d, userId);
}

export async function removeFriend(d: Deps, userId: string, otherId: string): Promise<void> {
  const [a, b] = pair(userId, otherId);
  await d.db.query('DELETE FROM friendships WHERE user_a = $1 AND user_b = $2', [a, b]);
}

/** Saatler yuvarlanır: konum-zaman ilişkisi kurulamasın. */
export function roundedTimeLabel(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'Bu saat';
  if (h < 24) return `${h} sa önce`;
  const days = Math.floor(diff / DAY_MS);
  if (days === 1) return 'Dün';
  if (days < 7) return `${days} gün önce`;
  return `${Math.floor(days / 7)} hafta önce`;
}

export async function getFeed(d: Deps, userId: string, cursor: string | null): Promise<Page<FeedItem>> {
  const now = d.clock.now();
  const ids = await friendIds(d.db, userId);
  const before = cursor ? new Date(Number(cursor)) : new Date(now + 1);
  const r = await d.db.query<{ id: string; user_id: string; kind: string; title: string; subtitle: string; data: { cells?: string[] }; created_at: Date; claps: string; mine: boolean }>(
    `SELECT f.*, (SELECT COUNT(*) FROM claps c WHERE c.feed_id = f.id) claps,
       EXISTS (SELECT 1 FROM claps c WHERE c.feed_id = f.id AND c.user_id = $2) mine
     FROM feed_items f WHERE f.user_id = ANY($1::uuid[]) AND f.created_at < $3 ORDER BY f.created_at DESC LIMIT 30`,
    [[...ids, userId], userId, before],
  );
  const pub = await loadPublicPlayers(d.db, r.rows.map((x) => x.user_id));
  const items: FeedItem[] = r.rows.map((x) => ({
    id: x.id,
    player: pub.get(x.user_id)!,
    kind: x.kind as FeedItem['kind'],
    title: x.title,
    subtitle: x.subtitle,
    timeLabel: roundedTimeLabel(x.created_at.getTime(), now),
    claps: Number(x.claps),
    clappedByMe: x.mine,
    silhouette: null,
  }));
  const last = r.rows[r.rows.length - 1];
  return { items, nextCursor: r.rows.length === 30 && last ? String(last.created_at.getTime()) : null };
}

export async function clap(d: Deps, userId: string, feedId: string): Promise<{ claps: number; clappedByMe: boolean }> {
  const f = (await d.db.query<{ user_id: string }>('SELECT user_id FROM feed_items WHERE id = $1', [feedId])).rows[0];
  if (!f) throw notFound('Gönderi bulunamadı.');
  const friends = await friendIds(d.db, userId);
  if (f.user_id !== userId && !friends.includes(f.user_id)) throw forbidden('Akış yalnız arkadaşlara açık.');
  if (f.user_id === userId) throw badRequest('self_clap', 'Kendini alkışlayamazsın.');
  // Tek tepki alkış: ikinci dokunuş geri alır.
  const del = await d.db.query('DELETE FROM claps WHERE feed_id = $1 AND user_id = $2', [feedId, userId]);
  if (!del.rowCount) await d.db.query('INSERT INTO claps (feed_id, user_id, created_at) VALUES ($1, $2, $3)', [feedId, userId, new Date(d.clock.now())]);
  const n = await d.db.query<{ n: string }>('SELECT COUNT(*) n FROM claps WHERE feed_id = $1', [feedId]);
  return { claps: Number(n.rows[0]!.n), clappedByMe: !del.rowCount };
}
