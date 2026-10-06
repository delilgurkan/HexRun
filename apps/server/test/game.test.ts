import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cellsInPolygon, circleTrack, destination, RULES } from '@hexrun/core';
import type {
  BadgesResponse,
  DuelPreview,
  DuelSummary,
  FeedItem,
  FriendsResponse,
  LeagueResponse,
  MapResponse,
  NotificationDto,
  Page,
  RegionDetail,
  RunSummary,
  ShareCard,
  StatsResponse,
} from '@hexrun/contracts';
import { D, H, MODA, T0, get, lineRun, loopRun, run, runAt, send, setup, signup, type Ctx, type Player } from './helpers.js';
import { runTick } from '../src/jobs.js';
import { dispatchPush } from '../src/game/notifications.js';

let ctx: Ctx;
let deniz: Player; // sahip
let emre: Player; // saldırgan
beforeAll(async () => {
  ctx = await setup();
  deniz = await signup(ctx, 'Deniz Arslan', 'keh', 'denizkosar');
  emre = await signup(ctx, 'Emre Şahin', 'keh', 'emresahin');
});
afterAll(async () => ctx.close());

const bbox = (c = MODA, m = 1500) => {
  const n = destination(c, 0, m);
  const e = destination(c, 90, m);
  const s = destination(c, 180, m);
  const w = destination(c, 270, m);
  return `${s.lat},${w.lng},${n.lat},${e.lng}`;
};

describe('ilk halka ve harita', () => {
  it('boş harita: ilk halka önerisi', async () => {
    const r = await get<{ ring: unknown[]; lengthM: number; emptyCells: number }>(ctx, deniz, `/v1/map/first-loop?lat=${MODA.lat}&lng=${MODA.lng}`);
    expect(r.lengthM).toBeGreaterThan(2000);
    expect(r.lengthM).toBeLessThan(2200);
    expect(r.emptyCells).toBeGreaterThan(1000);
  });

  it('halka kapanır: boş petekler 10 güçle Deniz\'in', async () => {
    // Pazartesi 12:00 — etkinlik dışı
    const s = await runAt(ctx, deniz, MODA, 150, T0);
    expect(s.status).toBe('applied');
    expect(s.loops).toHaveLength(1);
    const l = s.loops[0]!;
    expect(l.newCells).toBeGreaterThan(200);
    expect(l.gainedAreaM2).toBeGreaterThan(60_000);
    expect(s.totalGainedAreaM2).toBe(l.gainedAreaM2);
    expect(s.newBadges.map((b) => b.id)).toContain('ilk-halka');
    expect(s.streakDays).toBe(1);
    expect(s.openGapM).toBeNull();
    const m = await get<MapResponse>(ctx, deniz, `/v1/map?bbox=${bbox()}`);
    expect(m.cells.length).toBe(l.newCells);
    expect(m.cells.every((c) => c.power === 10 && c.slot === 'keh' && c.ownerId === deniz.id)).toBe(true);
    expect(m.players).toHaveLength(1);
    expect(m.players[0]!.initials).toBe('DA');
    expect(m.players[0]!.marker).not.toBeNull();
  });

  it('aynı clientRunId tekrar gönderilirse aynı özet döner (idempotent)', async () => {
    const pts = loopRun(destination(MODA, 0, 900), 60, T0 + 2 * H);
    ctx.clock.set(pts.at(-1)!.t + 1000);
    const payload = { clientRunId: 'idem-12345678', source: 'phone', points: pts };
    const a = await send(ctx, deniz, 'POST', '/v1/runs', payload);
    const b = await send(ctx, deniz, 'POST', '/v1/runs', payload);
    expect(a.json<RunSummary>().id).toBe(b.json<RunSummary>().id);
    const n = await ctx.db.query(`SELECT COUNT(*)::int n FROM runs WHERE client_run_id = 'idem-12345678'`);
    expect(n.rows[0].n).toBe(1);
    // Aynı koşu başka kaynaktan: bir kez sayılır
    const dup = await send(ctx, deniz, 'POST', '/v1/runs', { ...payload, clientRunId: 'garmin-xyz-1', source: 'garmin', externalId: 'g1' });
    expect(dup.json<RunSummary>().status).toBe('duplicate');
  });

  it('halka açık kalırsa koşu kaydedilir, harita değişmez, eksik mesafe söylenir', async () => {
    const pts = lineRun(destination(MODA, 0, 1500), 90, 1200, T0 + 4 * H);
    ctx.clock.set(pts.at(-1)!.t + 1000);
    const s = await run(ctx, deniz, pts);
    expect(s.status).toBe('open');
    expect(s.loops).toHaveLength(0);
    expect(s.openGapM).toBeGreaterThan(1100);
    expect(s.distanceM).toBeGreaterThan(1150);
  });

  it('başkası haritada rengini kendi görür; çakışan imza rengi kayar', async () => {
    const m = await get<MapResponse>(ctx, emre, `/v1/map?bbox=${bbox()}`);
    // Emre de Kehribar; komşu yok → Deniz kendi rengini korur
    expect(m.cells[0]!.slot).toBe('keh');
    expect(m.attackersLast48h).toBe(0);
  });

  it('bbox doğrulaması', async () => {
    expect((await send(ctx, deniz, 'POST', '/v1/duels/preview', { cells: ['zz'] })).statusCode).toBe(400);
    const tooBig = await ctx.app.inject({ method: 'GET', url: `/v1/map?bbox=${bbox(MODA, 9000)}`, headers: { authorization: `Bearer ${deniz.token}` } });
    expect(tooBig.json().error.code).toBe('bbox_too_large');
    const bad = await ctx.app.inject({ method: 'GET', url: `/v1/map?bbox=1,2,3`, headers: { authorization: `Bearer ${deniz.token}` } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('düello', () => {
  let area: string[];
  let duel: DuelSummary;

  it('seçim önizlemesi hataları ve geçerli seçim', async () => {
    const inner = cellsInPolygon(circleTrack(MODA, 70, 40, 0, 3));
    area = inner.slice(0, 1).length ? (await import('@hexrun/core')).bfsTake(inner, 40) : [];
    expect(area.length).toBe(40);
    const small = await send(ctx, emre, 'POST', '/v1/duels/preview', { cells: area.slice(0, 3) });
    expect(small.json<DuelPreview>()).toMatchObject({ ok: false, error: 'size' });
    const own = await send(ctx, deniz, 'POST', '/v1/duels/preview', { cells: area });
    expect(own.json<DuelPreview>().error).toBe('self');
    const ok = (await send(ctx, emre, 'POST', '/v1/duels/preview', { cells: area })).json<DuelPreview>();
    expect(ok).toMatchObject({ ok: true, cells: 40, avgPower: 10, slotsLeft: 3 });
    expect(ok.routeLengthM).toBeGreaterThan(300);
  });

  it('düello başlar; sahip ilk sayılan halkaya kadar göremez', async () => {
    const r = await send(ctx, emre, 'POST', '/v1/duels', { cells: area });
    expect(r.statusCode).toBe(201);
    duel = r.json<DuelSummary>();
    expect(duel).toMatchObject({ status: 'active', hp: 10, power: 10, progress: 0, attackLimitToday: 3 });
    expect(duel.expiresAt).not.toBeNull();
    expect(duel.route.length).toBeGreaterThan(6);
    const dz = await get<{ attacking: DuelSummary[]; defending: DuelSummary[] }>(ctx, deniz, '/v1/duels');
    expect(dz.defending).toHaveLength(0);
    const g = await ctx.app.inject({ method: 'GET', url: `/v1/duels/${duel.id}`, headers: { authorization: `Bearer ${deniz.token}` } });
    expect(g.statusCode).toBe(404);
    // Aynı peteklerle ikinci düello: örtüşme
    const again = await send(ctx, emre, 'POST', '/v1/duels', { cells: area });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('duel_overlap');
  });

  it('bölge detayı: sahip, alan, düellon', async () => {
    const r = await get<RegionDetail>(ctx, emre, `/v1/map/region?cell=${area[0]}`);
    expect(r.owner!.displayName).toBe('Deniz Arslan');
    expect(r.cells.length).toBeGreaterThan(200);
    expect(r.myDuel!.id).toBe(duel.id);
    expect(r.canStartDuel).toBe(false);
    expect(r.duelSlotsLeft).toBe(2);
    expect(r.history[0]!.text).toContain('Deniz Arslan aldı');
  });

  it('kapsamayan halka sayılmaz; alanı dolaşan halka canı düşürür ve sahibe bildirim gider', async () => {
    // Uzakta küçük bir halka: kapsama yok
    const far = await runAt(ctx, emre, destination(MODA, 45, 1200), 60, T0 + D + 3 * H);
    expect(far.loops[0]!.hits.find((h) => h.duelId === duel.id)).toMatchObject({ counted: false, reason: 'coverage' });
    // Alanı (70 m) saran 90 m'lik halka. Çaylak: günde 3.
    const s = await runAt(ctx, emre, MODA, 90, T0 + D + 4 * H);
    const hit = s.loops[0]!.hits.find((h) => h.duelId === duel.id)!;
    // 28 saat geçti: Deniz'in petekleri bir kez eridi (10 → 5).
    expect(hit).toMatchObject({ role: 'attack', counted: true, hpBefore: 5, hpAfter: 0, captured: true });
    expect(hit.opponent!.displayName).toBe('Deniz Arslan');
    expect(s.loops[0]!.capturedCells).toBe(40);
    expect(s.newBadges.map((b) => b.id)).toContain('ilk-zafer');
    const m = await get<MapResponse>(ctx, emre, `/v1/map?bbox=${bbox()}`);
    const mine = m.cells.filter((c) => c.ownerId === emre.id);
    // Emre'nin kendi halkasındaki rakip petekler değişmez; yalnız düello alanı geçer (+ varsa boş petekler)
    expect(mine.filter((c) => area.includes(c.id))).toHaveLength(40);
    // Fetih canı min(50, eski güç) = 5
    expect(mine.filter((c) => area.includes(c.id)).every((c) => c.power === 5)).toBe(true);
    // Komşu iki Kehribar: Emre kendini Kehribar görür, Deniz kayar
    expect(mine[0]!.slot).toBe('keh');
    const dz = m.cells.find((c) => c.ownerId === deniz.id)!;
    expect(dz.slot).not.toBe('keh');
    expect(dz.slot).not.toBe('mer');
  });

  it('Deniz bildirimleri görür: düello ve el değiştirme', async () => {
    const n = await get<Page<NotificationDto>>(ctx, deniz, '/v1/notifications');
    const kinds = n.items.map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(['duel_started', 'cells_lost']));
    const lost = n.items.find((x) => x.kind === 'cells_lost')!;
    expect(lost.title).toBe('Emre Şahin düelloyu kazandı');
    expect(lost.action!.label).toBe('Geri al');
    const started = n.items.find((x) => x.kind === 'duel_started')!;
    expect(started.title).toBe("Emre Şahin'le düello · 40 petek");
    const siege = await get<Page<NotificationDto>>(ctx, deniz, '/v1/notifications?filter=siege');
    expect(siege.items.every((x) => x.category === 'siege')).toBe(true);
    expect((await send(ctx, deniz, 'POST', '/v1/notifications/read', {})).statusCode).toBe(204);
    const after = await get<Page<NotificationDto>>(ctx, deniz, '/v1/notifications');
    expect(after.items.every((x) => x.read)).toBe(true);
  });

  it('düello geçmişte: kazanılmış görünür', async () => {
    const d = await get<{ attacking: DuelSummary[] }>(ctx, emre, '/v1/duels');
    expect(d.attacking[0]!.status).toBe('won');
  });
});

describe('kuşatma, savunma, erime (zaman ilerledikçe)', () => {
  let area: string[];
  let duelId: string;
  const C2 = destination(MODA, 0, 2600);

  it('Deniz yeni bölge alır ve günlerce güçlendirir (günde en çok 2 halka sayılır)', async () => {
    // Perşembe–Pazar her gün 15:00 ve 16:00 (etkinlik dışı); 17:00 halkası sınıra takılır.
    for (let day = 3; day <= 6; day++) {
      for (const h of [3, 4, 5]) await runAt(ctx, deniz, C2, 150, T0 + day * D + h * H);
    }
    const cells = await ctx.db.query<{ power: number }>('SELECT DISTINCT power FROM cells WHERE owner_id = $1 ORDER BY power', [deniz.id]);
    expect(cells.rows.map((r) => r.power)).toContain(80);
  });

  it('Emre (çaylak) düello açar; günlük sınır; %70 kuşatma uyarısı', async () => {
    const inner = cellsInPolygon(circleTrack(C2, 60, 40, 0, 3));
    area = (await import('@hexrun/core')).bfsTake(inner, 30);
    // Pazartesi öğlen düello açılır (48 saatte sayılan halka gelmezse silinir).
    ctx.clock.set(T0 + 7 * D);
    const r = await send(ctx, emre, 'POST', '/v1/duels', { cells: area });
    expect(r.statusCode).toBe(201);
    duelId = r.json<DuelSummary>().id;
    for (const h of [2, 3, 4]) await runAt(ctx, emre, C2, 80, T0 + 7 * D + h * H);
    const d1 = await get<DuelSummary>(ctx, emre, `/v1/duels/${duelId}`);
    expect(d1).toMatchObject({ progress: 30, attacksToday: 3, power: 80, hp: 50 });
    const s4 = await runAt(ctx, emre, C2, 80, T0 + 7 * D + 5 * H);
    expect(s4.loops[0]!.hits.find((h) => h.duelId === duelId)).toMatchObject({ counted: false, reason: 'daily_limit' });
    // Salı: güç bir kez erdi (75); 3 halka daha → ilerleme 60 → %80
    for (const h of [2, 3, 4]) await runAt(ctx, emre, C2, 80, T0 + 8 * D + h * H);
    const n = await get<Page<NotificationDto>>(ctx, deniz, '/v1/notifications?filter=siege');
    expect(n.items.map((x) => x.kind)).toContain('siege_warn');
    expect(n.items.find((x) => x.kind === 'siege_warn')!.body).toBe('Emre Şahin 2 halka daha atarsa onun olur.');
    const dd = await get<{ defending: DuelSummary[] }>(ctx, deniz, '/v1/duels');
    expect(dd.defending.find((x) => x.id === duelId)).toMatchObject({ hp: 15, loopsToCapture: 2 });
    const map = await get<MapResponse>(ctx, deniz, `/v1/map?bbox=${bbox(C2)}`);
    expect(map.attackersLast48h).toBe(1);
    expect(map.cells.filter((c) => c.duel === 'defending')).toHaveLength(30);
    expect(map.cells.find((c) => c.duel === 'defending')!.progress).toBe(60);
    // Başkası düelloyu görmez
    const ali = await signup(ctx, 'Ali Veli', 'gok');
    const am = await get<MapResponse>(ctx, ali, `/v1/map?bbox=${bbox(C2)}`);
    expect(am.cells.every((c) => c.duel === null && c.progress === null)).toBe(true);
  });

  it('Deniz savunur: güç +10, ilerleme −10, can +20', async () => {
    const before = (await get<{ defending: DuelSummary[] }>(ctx, deniz, '/v1/duels')).defending.find((x) => x.id === duelId)!;
    // 16:30: Pazar 17:00'deki son halkadan 48 saat dolmadan (ikinci erime adımından önce)
    const s = await runAt(ctx, deniz, C2, 150, T0 + 8 * D + 4.5 * H);
    const hit = s.loops[0]!.hits.find((h) => h.duelId === duelId)!;
    expect(hit).toMatchObject({ role: 'defense', counted: true });
    const after = (await get<{ defending: DuelSummary[] }>(ctx, deniz, '/v1/duels')).defending.find((x) => x.id === duelId)!;
    expect(after.hp - before.hp).toBe(20);
    expect(after.defensesToday).toBe(1);
    const b = await get<BadgesResponse>(ctx, deniz, '/v1/me/badges');
    expect(b.badges.find((x) => x.id === 'ilk-kalkan')!.earned).toBe(true);
  });

  it('push: günde en çok 3, fazlası uygulama içinde kalır', async () => {
    await send(ctx, deniz, 'PUT', '/v1/me/push-token', { token: 'ExponentPushToken[deniz]', platform: 'ios' });
    // Bekleyen çok sayıda bildirim
    for (let i = 0; i < 5; i++) {
      await ctx.db.query(
        `INSERT INTO notifications (id, user_id, kind, category, title, body, created_at, push, push_after) VALUES (gen_random_uuid(), $1, 'siege_warn', 'siege', 't', 'b', $2, true, $2)`,
        [deniz.id, new Date(ctx.clock.now())],
      );
    }
    const before = ctx.push.sent.length;
    const r = await dispatchPush(ctx.deps);
    expect(ctx.push.sent.length - before).toBeLessThanOrEqual(3);
    expect(r.capped).toBeGreaterThan(0);
    const r2 = await dispatchPush(ctx.deps);
    expect(r2.sent).toBe(0);
  });

  it('48 saat saldırı yoksa ilerleme erir; sahip halka atmazsa güç erir', async () => {
    const d0 = (await get<{ defending: DuelSummary[] }>(ctx, deniz, '/v1/duels')).defending.find((x) => x.id === duelId)!;
    ctx.clock.set(T0 + 11 * D + 4 * H);
    const t = await runTick(ctx.deps);
    expect(t.regions).toBeGreaterThan(0);
    const d1 = (await get<{ defending: DuelSummary[] }>(ctx, deniz, '/v1/duels')).defending.find((x) => x.id === duelId)!;
    expect(d1.progress).toBeLessThan(d0.progress);
    const ghost = await get<MapResponse>(ctx, deniz, `/v1/map?bbox=${bbox(C2)}`);
    expect(ghost.cells.some((c) => c.ghost > 0)).toBe(true);
    // İdempotent
    await runTick(ctx.deps);
    const d2 = (await get<{ defending: DuelSummary[] }>(ctx, deniz, '/v1/duels')).defending.find((x) => x.id === duelId)!;
    expect(d2.progress).toBe(d1.progress);
  });

  it('kimse gelmezse petekler boşa düşer, düello kapanır', async () => {
    ctx.clock.set(T0 + 40 * D);
    await runTick(ctx.deps);
    const owned = await ctx.db.query('SELECT COUNT(*)::int n FROM cells WHERE owner_id IS NOT NULL');
    expect(owned.rows[0].n).toBe(0);
    const st = await ctx.db.query(`SELECT status FROM duels WHERE id = $1`, [duelId]);
    expect(st.rows[0].status).toBe('closed');
    const n = await get<Page<NotificationDto>>(ctx, deniz, '/v1/notifications?filter=region');
    expect(n.items.map((x) => x.kind)).toContain('decay_lost');
  });
});

describe('inceleme ve yönetim', () => {
  let admin: Player;
  it('araç hızında halka incelemeye düşer, harita değişmez', async () => {
    const base = T0 + 41 * D + 3 * H;
    const pts = circleTrack(destination(MODA, 180, 1800), 300, 260, base, 9); // 9 m/s ≈ 1'51"/km
    ctx.clock.set(pts.at(-1)!.t + 1000);
    const s = await run(ctx, emre, pts);
    expect(s.status).toBe('review');
    expect(s.review!.reasons).toContain('Tempo koşu temposunun çok üstünde');
    expect(s.loops[0]!.status).toBe('review');
    const owned = await ctx.db.query('SELECT COUNT(*)::int n FROM cells WHERE owner_id = $1', [emre.id]);
    expect(owned.rows[0].n).toBe(0);
    expect((await send(ctx, emre, 'POST', `/v1/runs/${s.id}/note`, { text: 'Bisiklet değildi, rüzgâr arkamdaydı.' })).statusCode).toBe(204);
  });

  it('yönetici olmayan erişemez; yönetici onaylar ve halka işlenir', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/admin/reviews', headers: { authorization: `Bearer ${emre.token}` } })).statusCode).toBe(403);
    const s = await ctx.app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'admin@hexrun.co' } });
    const v = await ctx.app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: 'admin@hexrun.co', code: s.json().devCode } });
    admin = { id: v.json().user.id, token: v.json().accessToken, refresh: v.json().refreshToken, name: 'admin' };
    const list = await get<{ items: Array<{ loopId: string; reasons: string[]; note?: string; track: unknown[] }> }>(ctx, admin, '/v1/admin/reviews');
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.note).toContain('rüzgâr');
    expect(list.items[0]!.track.length).toBeGreaterThan(100);
    const ok = await send(ctx, admin, 'POST', `/v1/admin/reviews/${list.items[0]!.loopId}`, { decision: 'approve' });
    expect(ok.statusCode).toBe(200);
    const again = await send(ctx, admin, 'POST', `/v1/admin/reviews/${list.items[0]!.loopId}`, { decision: 'reject' });
    expect(again.statusCode).toBe(409);
    const owned = await ctx.db.query('SELECT COUNT(*)::int n FROM cells WHERE owner_id = $1', [emre.id]);
    expect(owned.rows[0].n).toBeGreaterThan(500);
    const n = await get<Page<NotificationDto>>(ctx, emre, '/v1/notifications');
    expect(n.items.find((x) => x.kind === 'review_result')!.title).toBe('Halkan onaylandı');
    const m = await get<{ reviewQueue: number; activeDuels: number }>(ctx, admin, '/v1/admin/metrics');
    expect(m.reviewQueue).toBe(0);
  });
});

describe('profil, istatistik, rozet, nişan', () => {
  it('istatistikler', async () => {
    const s = await get<StatsResponse>(ctx, emre, '/v1/me/stats');
    expect(s.territoryM2).toBeGreaterThan(100_000);
    expect(s.last14Days).toHaveLength(14);
    expect(s.silhouettes.length).toBeGreaterThan(0);
    expect(s.regionName).toBe('Kadıköy');
    expect(s.regionRank).toBe(1);
    expect(s.recent.length).toBeGreaterThan(0);
  });

  it('nişan: kazanılmamış takılamaz; günde 1 değişiklik', async () => {
    const b = await get<BadgesResponse>(ctx, emre, '/v1/me/badges');
    expect(b.total).toBe(40);
    expect(b.slots).toEqual([null, null, null]);
    expect(b.nearest).toHaveLength(3);
    const bad = await send(ctx, emre, 'PUT', '/v1/me/insignia', { slots: ['sur'] });
    expect(bad.json().error.code).toBe('not_earned');
    const notIns = await send(ctx, emre, 'PUT', '/v1/me/insignia', { slots: ['ilk-halka'] });
    expect(notIns.json().error.code).toBe('not_insignia');
    await ctx.db.query(`INSERT INTO badges_earned (user_id, badge_id, earned_at) VALUES ($1, 'halka-ustasi', now()), ($1, 'oncu', now()) ON CONFLICT DO NOTHING`, [emre.id]);
    const ok = await send(ctx, emre, 'PUT', '/v1/me/insignia', { slots: ['halka-ustasi', 'oncu', null] });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<BadgesResponse>().slots).toEqual(['halka-ustasi', 'oncu', null]);
    expect(ok.json<BadgesResponse>().canChangeInsignia).toBe(false);
    const twice = await send(ctx, emre, 'PUT', '/v1/me/insignia', { slots: ['oncu'] });
    expect(twice.json().error.code).toBe('insignia_daily_limit');
    const dupe = await send(ctx, emre, 'PUT', '/v1/me/insignia', { slots: ['oncu', 'oncu'] });
    expect(dupe.statusCode).toBe(400);
  });

  it('Halka Ustası: 55 m kala halka kapanır', async () => {
    const start = destination(MODA, 90, 2500);
    const t = T0 + 42 * D + 3 * H;
    const pts = circleTrack(start, 200, 180, t, 3).slice(0, -12);
    const end = { ...destination(pts[0]!, 90, 55), t: pts.at(-1)!.t + 30_000, acc: 5 };
    ctx.clock.set(end.t + 1000);
    const s = await run(ctx, emre, [...pts, end]);
    expect(s.loops).toHaveLength(1);
    // Öncü: boş petek 12 güçle
    const p = await ctx.db.query('SELECT DISTINCT power FROM cells WHERE id = ANY($1::text[])', [cellsInPolygon(s.loops.length ? circleTrack(start, 120, 40, 0, 3) : [])]);
    expect(p.rows.map((r) => r.power)).toEqual([12]);
  });

  it('kullanıcı adı kuralları', async () => {
    const taken = await get<{ available: boolean; reason: string }>(ctx, deniz, '/v1/usernames/emresahin');
    expect(taken).toMatchObject({ available: false, reason: 'taken' });
    expect(await get(ctx, deniz, '/v1/usernames/@Şükrü_09')).toMatchObject({ username: 'sukru_09', available: true });
    expect(await get(ctx, deniz, '/v1/usernames/ab')).toMatchObject({ available: false, reason: 'invalid' });
    expect(await get(ctx, deniz, '/v1/usernames/admin')).toMatchObject({ available: false, reason: 'reserved' });
    const r = await send(ctx, deniz, 'PATCH', '/v1/me', { username: 'emresahin' });
    expect(r.statusCode).toBe(409);
    const slot = await send(ctx, deniz, 'PATCH', '/v1/me', { slot: 'xyz' });
    expect(slot.statusCode).toBe(400);
  });

  it('gizlilik bölgesi: merkez kaydırılır, başkaları "Gizli oyuncu" görür', async () => {
    const home = destination(MODA, 90, 2500);
    const r = await send(ctx, emre, 'PUT', '/v1/me/privacy', { home, radiusM: 5000 });
    expect(r.json().privacy).toEqual({ enabled: true, radiusM: 800 });
    const row = (await ctx.db.query('SELECT privacy_lat, privacy_lng FROM users WHERE id = $1', [emre.id])).rows[0];
    expect(row.privacy_lat).not.toBe(home.lat);
    const m = await get<MapResponse>(ctx, deniz, `/v1/map?bbox=${bbox(home, 1000)}`);
    const hidden = m.players.filter((p) => p.hidden);
    expect(hidden.length).toBe(1);
    expect(hidden[0]).toMatchObject({ displayName: 'Gizli oyuncu', initials: '', marker: null });
    expect(m.cells.some((c) => c.ownerId === emre.id)).toBe(false);
    // Kendisi normal görür
    const me = await get<MapResponse>(ctx, emre, `/v1/map?bbox=${bbox(home, 1000)}`);
    expect(me.players.every((p) => !p.hidden)).toBe(true);
    const reg = await get<RegionDetail>(ctx, deniz, `/v1/map/region?cell=${m.cells[0]!.id}`);
    expect(reg).toMatchObject({ owner: null, hidden: true });
    // Paylaşım kartı gizlilik bölgesindeki petekleri içermez
    const runs = await get<Page<{ id: string; gainedAreaM2: number }>>(ctx, emre, '/v1/runs');
    const last = runs.items[0]!;
    const card = await get<ShareCard>(ctx, emre, `/v1/runs/${last.id}/share`);
    expect(card.gainedAreaM2).toBe(0);
    expect(card.silhouette).toHaveLength(0);
    await send(ctx, emre, 'PUT', '/v1/me/privacy', { home: null });
    const card2 = await get<ShareCard>(ctx, emre, `/v1/runs/${last.id}/share`);
    expect(card2.gainedAreaM2).toBeGreaterThan(10_000);
    expect(card2.username).toBe('@emresahin');
  });
});

describe('sosyal', () => {
  it('arkadaşlık, akış, alkış', async () => {
    const f = await get<FriendsResponse>(ctx, emre, '/v1/friends');
    expect(f.friends).toHaveLength(0);
    expect((await send(ctx, emre, 'POST', '/v1/friends/accept', { code: f.inviteCode })).statusCode).toBe(400);
    const acc = await send(ctx, deniz, 'POST', '/v1/friends/accept', { code: f.inviteCode.toLowerCase() });
    expect(acc.json<FriendsResponse>().friends[0]!.player.displayName).toBe('Emre Şahin');
    const feed = await get<Page<FeedItem>>(ctx, deniz, '/v1/feed');
    const item = feed.items.find((x) => x.player.id === emre.id && x.kind === 'conquest')!;
    expect(item.title).toMatch(/petek aldı/);
    expect(item.timeLabel).toMatch(/önce|Dün|Bu saat/);
    const c1 = await send(ctx, deniz, 'POST', `/v1/feed/${item.id}/clap`);
    expect(c1.json()).toEqual({ claps: 1, clappedByMe: true });
    const c2 = await send(ctx, deniz, 'POST', `/v1/feed/${item.id}/clap`);
    expect(c2.json()).toEqual({ claps: 0, clappedByMe: false });
    expect((await send(ctx, emre, 'POST', `/v1/feed/${item.id}/clap`)).statusCode).toBe(400);
    const stranger = await signup(ctx, 'Yabancı Kişi', 'lim');
    expect((await send(ctx, stranger, 'POST', `/v1/feed/${item.id}/clap`)).statusCode).toBe(403);
    expect((await send(ctx, deniz, 'DELETE', `/v1/friends/${emre.id}`)).statusCode).toBe(204);
    expect((await get<FriendsResponse>(ctx, deniz, '/v1/friends')).friends).toHaveLength(0);
  });

  it('takım: kur, katıl, sıralama, ayrıl', async () => {
    const t = await send(ctx, emre, 'POST', '/v1/teams', { name: 'Moda Rüzgarı' });
    expect(t.statusCode).toBe(201);
    const team = t.json();
    expect(team.inviteCode).toHaveLength(8);
    expect((await send(ctx, deniz, 'POST', '/v1/teams', { name: 'moda rüzgarı' })).statusCode).toBe(409);
    expect((await send(ctx, deniz, 'POST', '/v1/teams', { name: 'x' })).statusCode).toBe(400);
    const j = await send(ctx, deniz, 'POST', '/v1/teams/join', { code: team.inviteCode });
    expect(j.json().members).toHaveLength(2);
    const mine = await get<{ name: string; territoryM2: number }>(ctx, deniz, '/v1/teams/mine');
    expect(mine.name).toBe('Moda Rüzgarı');
    const lg = await get<LeagueResponse>(ctx, deniz, '/v1/league?scope=team&period=all');
    expect(lg.rows[0]!.name).toBe('Moda Rüzgarı');
    expect(lg.me!.isMe).toBe(true);
    await send(ctx, emre, 'POST', '/v1/teams/leave');
    const after = await get<{ captain: { id: string } }>(ctx, deniz, '/v1/teams/mine');
    expect(after.captain.id).toBe(deniz.id);
    await send(ctx, deniz, 'POST', '/v1/teams/leave');
    const none = await send(ctx, deniz, 'GET' as never, '/v1/teams/mine');
    expect(none.statusCode).toBe(204);
  });

  it('lig: haftalık / aylık / tümü, benim satırım', async () => {
    for (const period of ['week', 'month', 'all']) {
      const lg = await get<LeagueResponse>(ctx, emre, `/v1/league?scope=individual&period=${period}`);
      expect(lg.regionName).toBe('Kadıköy');
      expect(lg.rows.length).toBeGreaterThan(0);
      if (period !== 'all') expect(lg.endsAt).not.toBeNull();
    }
    const all = await get<LeagueResponse>(ctx, emre, '/v1/league?scope=individual&period=all');
    expect(all.me!.rank).toBe(1);
    expect(all.meNote).toMatch(/önde/);
  });

  it('etkinlikler ve hatırlatma', async () => {
    const ev = await get<Array<{ id: string; active: boolean }>>(ctx, emre, '/v1/events');
    expect(ev.map((e) => e.id)).toEqual(['morning', 'blitz', 'evening']);
    expect((await send(ctx, emre, 'POST', '/v1/events/morning/remind', { on: true })).statusCode).toBe(204);
    expect((await send(ctx, emre, 'POST', '/v1/events/nope/remind', { on: true })).statusCode).toBe(404);
  });
});

describe('hesap', () => {
  it('veri dışa aktarma', async () => {
    const r = await send(ctx, emre, 'GET' as never, '/v1/me/export');
    expect(r.headers['content-disposition']).toContain('hexrun-verilerim.json');
    const j = r.json();
    expect(j.user.username).toBe('emresahin');
    expect(j.runs.length).toBeGreaterThan(3);
  });

  it('hesap silme: petekler boşa düşer, oturum biter', async () => {
    const owned = await ctx.db.query('SELECT COUNT(*)::int n FROM cells WHERE owner_id = $1', [emre.id]);
    expect(owned.rows[0].n).toBeGreaterThan(0);
    expect((await send(ctx, emre, 'DELETE', '/v1/me')).statusCode).toBe(204);
    const left = await ctx.db.query('SELECT COUNT(*)::int n FROM cells WHERE owner_id = $1', [emre.id]);
    expect(left.rows[0].n).toBe(0);
    expect((await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: emre.refresh } })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${emre.token}` } })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/me/stats', headers: { authorization: `Bearer ${emre.token}` } })).statusCode).toBe(401);
    // Başkalarının bildirimlerinde Emre'yi anan satır kalmaz
    const left2 = await ctx.db.query(`SELECT COUNT(*)::int n FROM notifications WHERE title LIKE '%Emre%' OR body LIKE '%Emre%'`);
    expect(left2.rows[0].n).toBe(0);
  });
});

void RULES;
