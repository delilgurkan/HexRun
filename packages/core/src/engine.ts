import { DAY_MS, HOUR_MS, RULES } from './constants.js';
import { bfsTake, components as connectedPieces, isConnected, type CellId } from './cells.js';
import { eventMultiplier } from './events.js';
import type { InsigniaId } from './badges.js';
import { bump, counterValue, dayKey, type DayCounter } from './time.js';

/* ────────────────────────────── Durum ────────────────────────────── */

export interface CellState {
  id: CellId;
  ownerId: string | null;
  power: number;
  ownedSince: number | null;
  /** Sahibin bu peteği içeren son halkası (erime saati buradan sayılır). */
  lastOwnerLoopAt: number | null;
  /** Son halkadan beri uygulanmış erime adımı. */
  decaySteps: number;
  /** Sahibin bugün bu petekte sayılan halkaları. */
  ownerLoops: DayCounter | null;
}

export type DuelStatus = 'active' | 'won' | 'expired' | 'closed' | 'reset';

export interface DuelState {
  id: string;
  attackerId: string;
  defenderId: string;
  /** Sabit alan; sahibin erimeyle kaybettiği petekler çıkar. */
  cells: CellId[];
  progress: number;
  createdAt: number;
  firstCountedAt: number | null;
  lastAttackAt: number | null;
  attackDecaySteps: number;
  attacks: DayCounter | null;
  defenses: DayCounter | null;
  /** Gönderilmiş kuşatma uyarısı: 0 yok, 1 = %70, 2 = %90. */
  warned: 0 | 1 | 2;
  status: DuelStatus;
  endedAt: number | null;
}

export interface PlayerState {
  id: string;
  createdAt: number;
  insignia: InsigniaId[];
  /** Kale Bekçisi kalkanı. */
  shield: { cells: CellId[]; until: number } | null;
}

export interface LossRecord {
  cellId: CellId;
  playerId: string;
  at: number;
}

export interface World {
  cells: Map<CellId, CellState>;
  duels: Map<string, DuelState>;
  players: Map<string, PlayerState>;
  /** Son 7 günde kaybedilen petekler (Geri Alan). */
  losses: LossRecord[];
  tz?: string;
  /** Zaman çarpanları açık mı (varsayılan açık; bölgesel kapatma ve simülasyon için). */
  eventsEnabled?: boolean;
}

export function emptyWorld(): World {
  return { cells: new Map(), duels: new Map(), players: new Map(), losses: [] };
}

export function getCell(w: World, id: CellId): CellState {
  let c = w.cells.get(id);
  if (!c) {
    c = { id, ownerId: null, power: 0, ownedSince: null, lastOwnerLoopAt: null, decaySteps: 0, ownerLoops: null };
    w.cells.set(id, c);
  }
  return c;
}

/* ────────────────────────────── Olaylar ────────────────────────────── */

export type GameNotice =
  | { type: 'duel_started'; to: string; duelId: string; attackerId: string; cells: number; notBefore: number }
  | { type: 'siege_warn' | 'siege_alarm'; to: string; duelId: string; attackerId: string; hp: number; power: number; progress: number }
  | { type: 'cells_lost'; to: string; duelId: string; attackerId: string; cells: number }
  | { type: 'duel_won'; to: string; duelId: string; defenderId: string; cells: number }
  | { type: 'duel_reset'; to: string; duelId: string; reason: 'captured_by_other' | 'too_small' }
  | { type: 'duel_expired'; to: string; duelId: string }
  | { type: 'decay_lost'; to: string; cells: number };

export interface DuelHit {
  duelId: string;
  role: 'attack' | 'defense';
  counted: boolean;
  reason?: 'coverage' | 'daily_limit' | 'too_small';
  hpBefore: number;
  hpAfter: number;
  progressDelta: number;
  captured: boolean;
  multiplier: number;
}

export interface LoopOutcome {
  newCells: CellId[];
  reinforced: CellId[];
  /** Günlük sınırı dolduğu için güç almayan kendi petekleri. */
  limited: CellId[];
  rivalCells: CellId[];
  hits: DuelHit[];
  captured: Array<{ duelId: string; fromId: string; cells: CellId[] }>;
  notices: GameNotice[];
  changedCells: Set<CellId>;
  changedDuels: Set<string>;
  /** Etkin çarpanlar (özet ekranı için). */
  multipliers: { gain: number; attack: number; pushback: number };
}

/* ────────────────────────────── Yardımcılar ────────────────────────────── */

export function isNewbie(p: PlayerState | undefined, at: number): boolean {
  return !!p && at - p.createdAt < RULES.NEWBIE_DAYS * DAY_MS;
}

export function hasInsignia(p: PlayerState | undefined, id: InsigniaId): boolean {
  return !!p && p.insignia.includes(id);
}

export function closeRadiusFor(p: PlayerState | undefined): number {
  return hasInsignia(p, 'halka-ustasi') ? RULES.LOOP_CLOSE_M_MASTER : RULES.LOOP_CLOSE_M;
}

export function minLoopLengthFor(p: PlayerState | undefined, at: number): number {
  return isNewbie(p, at) ? RULES.MIN_LOOP_LENGTH_M_NEWBIE : RULES.MIN_LOOP_LENGTH_M;
}

/** Düello alanı: hâlâ sahibinde olan petekler. */
export function liveArea(w: World, d: DuelState): CellId[] {
  return d.cells.filter((id) => w.cells.get(id)?.ownerId === d.defenderId);
}

export function duelPower(w: World, d: DuelState): number {
  const area = liveArea(w, d);
  if (!area.length) return 0;
  const sum = area.reduce((s, id) => s + (w.cells.get(id)?.power ?? 0), 0);
  return sum / area.length;
}

/** Düello canı = alanın ortalama gücü − saldırganın ilerlemesi. */
export function duelHp(w: World, d: DuelState): number {
  return Math.max(0, duelPower(w, d) - d.progress);
}

export function coverage(loopCells: ReadonlySet<CellId>, area: readonly CellId[]): number {
  if (!area.length) return 0;
  let n = 0;
  for (const c of area) if (loopCells.has(c)) n++;
  return n / area.length;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/* ────────────────────────────── Halka uygula ────────────────────────────── */

export interface LoopInput {
  playerId: string;
  cells: readonly CellId[];
  /** Halkanın kapandığı an (çarpanlar ve günlük sınırlar buna göre). */
  at: number;
}

export function applyLoop(w: World, input: LoopInput): LoopOutcome {
  const tz = w.tz ?? RULES.TIMEZONE;
  const { playerId, at } = input;
  const me = w.players.get(playerId);
  const day = dayKey(at, tz);
  const loopSet = new Set(input.cells);
  const out: LoopOutcome = {
    newCells: [],
    reinforced: [],
    limited: [],
    rivalCells: [],
    hits: [],
    captured: [],
    notices: [],
    changedCells: new Set(),
    changedDuels: new Set(),
    multipliers: {
      gain: w.eventsEnabled === false ? 1 : eventMultiplier('gain', at, tz),
      attack: w.eventsEnabled === false ? 1 : eventMultiplier('attack', at, tz),
      pushback: w.eventsEnabled === false ? 1 : eventMultiplier('pushback', at, tz),
    },
  };

  // Halka öncesi düello canları (kuşatma eşikleri ve özet için).
  const myDefDuels = [...w.duels.values()].filter((d) => d.status === 'active' && d.defenderId === playerId);
  const hpBefore = new Map(myDefDuels.map((d) => [d.id, duelHp(w, d)]));

  // 1) Petekler: boş → al; kendi → güçlendir; rakip → kendi başına bir şey yapmaz.
  const newPower = hasInsignia(me, 'oncu') ? RULES.NEW_CELL_POWER_PIONEER : RULES.NEW_CELL_POWER;
  for (const id of [...loopSet].sort()) {
    const c = getCell(w, id);
    if (!c.ownerId) {
      c.ownerId = playerId;
      c.power = newPower;
      c.ownedSince = at;
      c.lastOwnerLoopAt = at;
      c.decaySteps = 0;
      c.ownerLoops = { day, count: 1 };
      out.newCells.push(id);
      out.changedCells.add(id);
    } else if (c.ownerId === playerId) {
      c.lastOwnerLoopAt = at;
      c.decaySteps = 0;
      out.changedCells.add(id);
      if (counterValue(c.ownerLoops, day) < RULES.OWNER_DAILY_LIMIT) {
        c.ownerLoops = bump(c.ownerLoops, day);
        c.power = Math.min(RULES.MAX_POWER, c.power + RULES.OWNER_GAIN * out.multipliers.gain);
        out.reinforced.push(id);
      } else {
        out.limited.push(id);
      }
    } else {
      out.rivalCells.push(id);
    }
  }

  // 2) Savunma: sahibin alanı dolaşan halkası saldırganları geri iter.
  for (const d of myDefDuels) {
    if (d.status !== 'active') continue;
    const area = liveArea(w, d);
    const cov = coverage(loopSet, area);
    const before = hpBefore.get(d.id) ?? 0;
    if (cov < RULES.DUEL_COVERAGE) continue;
    if (counterValue(d.defenses, day) >= RULES.DEFENSE_DAILY_LIMIT) {
      out.hits.push({ duelId: d.id, role: 'defense', counted: false, reason: 'daily_limit', hpBefore: before, hpAfter: duelHp(w, d), progressDelta: 0, captured: false, multiplier: out.multipliers.pushback });
      continue;
    }
    d.defenses = bump(d.defenses, day);
    const prev = d.progress;
    d.progress = Math.max(0, round1(d.progress - RULES.PUSHBACK * out.multipliers.pushback));
    // Tehlike geçtiyse uyarı seviyesi düşer; tekrar yükselirse yeniden uyarılır.
    const pw = duelPower(w, d);
    const ratio = pw > 0 ? d.progress / pw : 0;
    if (ratio < RULES.SIEGE_WARN) d.warned = 0;
    else if (ratio < RULES.SIEGE_ALARM && d.warned === 2) d.warned = 1;
    out.changedDuels.add(d.id);
    out.hits.push({ duelId: d.id, role: 'defense', counted: true, hpBefore: before, hpAfter: duelHp(w, d), progressDelta: d.progress - prev, captured: false, multiplier: out.multipliers.pushback });
  }

  // 3) Saldırı: saldırganın düello alanını dolaşan halkası canı düşürür.
  const myAtkDuels = [...w.duels.values()]
    .filter((d) => d.status === 'active' && d.attackerId === playerId)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  const limit = isNewbie(me, at) ? RULES.NEWBIE_ATTACK_LIMIT : RULES.ATTACK_DAILY_LIMIT;
  for (const d of myAtkDuels) {
    if (d.status !== 'active') continue; // önceki bir fetih bu düelloyu sıfırlamış olabilir
    const area = liveArea(w, d);
    const before = duelHp(w, d);
    if (area.length < RULES.DUEL_MIN_CELLS) {
      closeDuel(w, d, at, 'closed');
      out.changedDuels.add(d.id);
      out.notices.push({ type: 'duel_reset', to: d.attackerId, duelId: d.id, reason: 'too_small' });
      out.hits.push({ duelId: d.id, role: 'attack', counted: false, reason: 'too_small', hpBefore: before, hpAfter: before, progressDelta: 0, captured: false, multiplier: 1 });
      continue;
    }
    const cov = coverage(loopSet, area);
    if (cov < RULES.DUEL_COVERAGE) {
      // Kapsamadı: halka sayılmaz. Gizli tolerans kullanıcıya gösterilmez.
      out.hits.push({ duelId: d.id, role: 'attack', counted: false, reason: 'coverage', hpBefore: before, hpAfter: before, progressDelta: 0, captured: false, multiplier: 1 });
      continue;
    }
    if (counterValue(d.attacks, day) >= limit) {
      out.hits.push({ duelId: d.id, role: 'attack', counted: false, reason: 'daily_limit', hpBefore: before, hpAfter: before, progressDelta: 0, captured: false, multiplier: 1 });
      continue;
    }
    const mult = attackMultiplier(w, d, area, at, out.multipliers.attack);
    const prev = d.progress;
    d.attacks = bump(d.attacks, day);
    d.progress = round1(d.progress + RULES.ATTACK * mult);
    d.lastAttackAt = at;
    d.attackDecaySteps = 0;
    out.changedDuels.add(d.id);
    if (d.firstCountedAt === null) {
      d.firstCountedAt = at;
      const stealth = hasInsignia(me, 'safak-akincisi') ? 2 * HOUR_MS : 0;
      out.notices.push({ type: 'duel_started', to: d.defenderId, duelId: d.id, attackerId: playerId, cells: area.length, notBefore: at + stealth });
    }
    const pw = duelPower(w, d);
    const hp = Math.max(0, pw - d.progress);
    const hit: DuelHit = { duelId: d.id, role: 'attack', counted: true, hpBefore: before, hpAfter: hp, progressDelta: d.progress - prev, captured: false, multiplier: mult };
    out.hits.push(hit);
    if (hp <= 0) {
      hit.captured = true;
      out.captured.push({ duelId: d.id, fromId: d.defenderId, cells: area });
      capture(w, d, area, at, out);
    } else {
      const ratio = pw > 0 ? d.progress / pw : 0;
      if (ratio >= RULES.SIEGE_ALARM && d.warned < 2) {
        d.warned = 2;
        out.notices.push({ type: 'siege_alarm', to: d.defenderId, duelId: d.id, attackerId: playerId, hp: round1(hp), power: round1(pw), progress: d.progress });
      } else if (ratio >= RULES.SIEGE_WARN && d.warned < 1) {
        d.warned = 1;
        out.notices.push({ type: 'siege_warn', to: d.defenderId, duelId: d.id, attackerId: playerId, hp: round1(hp), power: round1(pw), progress: d.progress });
      }
    }
  }
  return out;
}

/** Saldırı çarpanı: etkinlik × (1 + saldırgan nişanı), toplam ≤ 2x; sonra savunan nişanı (≤ −%20). */
export function attackMultiplier(w: World, d: DuelState, area: readonly CellId[], at: number, eventMult: number): number {
  const atk = w.players.get(d.attackerId);
  const def = w.players.get(d.defenderId);
  let bonus = 0;
  if (hasInsignia(atk, 'geri-alan')) {
    const since = at - 7 * DAY_MS;
    const lost = new Set(w.losses.filter((l) => l.playerId === d.attackerId && l.at >= since).map((l) => l.cellId));
    const n = area.filter((c) => lost.has(c)).length;
    if (n * 2 >= area.length) bonus += 0.2;
  }
  const up = Math.min(RULES.MAX_TOTAL_MULTIPLIER, eventMult * (1 + Math.min(RULES.INSIGNIA_MAX_EFFECT, bonus)));
  let red = 0;
  if (hasInsignia(def, 'ilk-kalkan')) red += 0.1;
  if (hasInsignia(def, 'kale-bekcisi') && def?.shield && def.shield.until > at) {
    const sh = new Set(def.shield.cells);
    const n = area.filter((c) => sh.has(c)).length;
    if (n * 2 >= area.length) red += 0.2;
  }
  return round1(up * (1 - Math.min(RULES.INSIGNIA_MAX_EFFECT, red)) * 100) / 100;
}

function capture(w: World, d: DuelState, area: readonly CellId[], at: number, out: LoopOutcome): void {
  const tz = w.tz ?? RULES.TIMEZONE;
  const day = dayKey(at, tz);
  const taken = new Set(area);
  for (const id of area) {
    const c = getCell(w, id);
    const old = c.power;
    c.ownerId = d.attackerId;
    c.power = Math.min(RULES.CAPTURE_POWER, old);
    c.ownedSince = at;
    c.lastOwnerLoopAt = at;
    c.decaySteps = 0;
    // Fetih halkası aynı gün güçlendirme sayılmaz; yeni sahip ertesi halkada güç kazanır.
    c.ownerLoops = { day, count: 0 };
    w.losses.push({ cellId: id, playerId: d.defenderId, at });
    out.changedCells.add(id);
  }
  d.status = 'won';
  d.endedAt = at;
  out.changedDuels.add(d.id);
  out.notices.push({ type: 'cells_lost', to: d.defenderId, duelId: d.id, attackerId: d.attackerId, cells: area.length });
  out.notices.push({ type: 'duel_won', to: d.attackerId, duelId: d.id, defenderId: d.defenderId, cells: area.length });
  // O peteklerdeki diğer düellolar sıfırlanır; hak geri döner.
  for (const o of w.duels.values()) {
    if (o.id === d.id || o.status !== 'active') continue;
    if (o.cells.some((c) => taken.has(c))) {
      closeDuel(w, o, at, 'reset');
      out.changedDuels.add(o.id);
      out.notices.push({ type: 'duel_reset', to: o.attackerId, duelId: o.id, reason: 'captured_by_other' });
    }
  }
}

function closeDuel(_w: World, d: DuelState, at: number, status: DuelStatus): void {
  d.status = status;
  d.endedAt = at;
}

/* ────────────────────────────── Düello başlat ────────────────────────────── */

export type DuelError =
  | 'self'
  | 'size'
  | 'not_owned'
  | 'mixed_owner'
  | 'not_connected'
  | 'limit'
  | 'overlap'
  | 'duplicate_cells';

export function validateDuel(w: World, attackerId: string, cells: readonly CellId[]): { ok: true; defenderId: string } | { ok: false; error: DuelError } {
  if (new Set(cells).size !== cells.length) return { ok: false, error: 'duplicate_cells' };
  if (cells.length < RULES.DUEL_MIN_CELLS || cells.length > RULES.DUEL_MAX_CELLS) return { ok: false, error: 'size' };
  const owners = new Set<string | null>(cells.map((id) => w.cells.get(id)?.ownerId ?? null));
  if (owners.has(null)) return { ok: false, error: 'not_owned' };
  if (owners.size > 1) return { ok: false, error: 'mixed_owner' };
  const defenderId = [...owners][0]!;
  if (defenderId === attackerId) return { ok: false, error: 'self' };
  if (!isConnected(cells)) return { ok: false, error: 'not_connected' };
  const active = [...w.duels.values()].filter((d) => d.status === 'active' && d.attackerId === attackerId);
  if (active.length >= RULES.MAX_ACTIVE_DUELS) return { ok: false, error: 'limit' };
  const mine = new Set(active.flatMap((d) => d.cells));
  if (cells.some((c) => mine.has(c))) return { ok: false, error: 'overlap' };
  return { ok: true, defenderId };
}

export function createDuel(w: World, id: string, attackerId: string, cells: readonly CellId[], at: number): DuelState | DuelError {
  const v = validateDuel(w, attackerId, cells);
  if (!v.ok) return v.error;
  const d: DuelState = {
    id,
    attackerId,
    defenderId: v.defenderId,
    cells: [...cells].sort(),
    progress: 0,
    createdAt: at,
    firstCountedAt: null,
    lastAttackAt: null,
    attackDecaySteps: 0,
    attacks: null,
    defenses: null,
    warned: 0,
    status: 'active',
    endedAt: null,
  };
  w.duels.set(id, d);
  return d;
}

/* ────────────────────────────── Zaman ilerlemesi ────────────────────────────── */

export interface TickOutcome {
  changedCells: Set<CellId>;
  changedDuels: Set<string>;
  emptied: CellId[];
  notices: GameNotice[];
  /** Erime miktarları (hayalet segment için): petek → kaybedilen güç. */
  decayed: Map<CellId, number>;
}

export function decayRateFor(p: PlayerState | undefined): number {
  return hasInsignia(p, 'sur') ? RULES.DECAY * (1 - RULES.INSIGNIA_MAX_EFFECT) : RULES.DECAY;
}

/**
 * Erime, saldırgan erimesi, süre aşımı ve küçülen alanlar. İdempotent: aynı `now` ile
 * iki kez çağrılmak sonucu değiştirmez; arada kaçırılan günler toplu uygulanır.
 */
export function tick(w: World, now: number): TickOutcome {
  const out: TickOutcome = { changedCells: new Set(), changedDuels: new Set(), emptied: [], notices: [], decayed: new Map() };
  const lostBy = new Map<string, number>();
  for (const c of w.cells.values()) {
    if (!c.ownerId) continue;
    const anchor = c.lastOwnerLoopAt ?? c.ownedSince;
    if (anchor === null) continue;
    const due = Math.floor((now - anchor) / (RULES.DECAY_AFTER_H * HOUR_MS));
    const steps = due - c.decaySteps;
    if (steps <= 0) continue;
    const rate = decayRateFor(w.players.get(c.ownerId));
    const loss = Math.min(c.power, steps * rate);
    c.power = round1(c.power - loss);
    c.decaySteps = due;
    out.decayed.set(c.id, loss);
    out.changedCells.add(c.id);
    if (c.power <= 0) {
      lostBy.set(c.ownerId, (lostBy.get(c.ownerId) ?? 0) + 1);
      w.losses.push({ cellId: c.id, playerId: c.ownerId, at: now });
      c.ownerId = null;
      c.power = 0;
      c.ownedSince = null;
      c.lastOwnerLoopAt = null;
      c.decaySteps = 0;
      c.ownerLoops = null;
      out.emptied.push(c.id);
    }
  }
  for (const [to, cells] of lostBy) out.notices.push({ type: 'decay_lost', to, cells });

  for (const d of w.duels.values()) {
    if (d.status !== 'active') continue;
    if (d.firstCountedAt === null) {
      if (now - d.createdAt >= RULES.DUEL_EXPIRE_H * HOUR_MS) {
        closeDuel(w, d, now, 'expired');
        out.changedDuels.add(d.id);
        out.notices.push({ type: 'duel_expired', to: d.attackerId, duelId: d.id });
        continue;
      }
    } else if (d.lastAttackAt !== null) {
      const after = now - d.lastAttackAt - RULES.ATTACK_DECAY_AFTER_H * HOUR_MS;
      const due = after >= 0 ? Math.floor(after / DAY_MS) + 1 : 0;
      const steps = due - d.attackDecaySteps;
      if (steps > 0) {
        d.progress = Math.max(0, round1(d.progress - steps * RULES.ATTACK_DECAY));
        d.attackDecaySteps = due;
        out.changedDuels.add(d.id);
      }
    }
    if (liveArea(w, d).length < RULES.DUEL_MIN_CELLS) {
      closeDuel(w, d, now, 'closed');
      out.changedDuels.add(d.id);
      out.notices.push({ type: 'duel_reset', to: d.attackerId, duelId: d.id, reason: 'too_small' });
    }
  }
  // 7 günden eski kayıplar unutulur.
  const cutoff = now - 7 * DAY_MS;
  w.losses = w.losses.filter((l) => l.at >= cutoff);
  return out;
}

/* ────────────────────────────── Öneri ────────────────────────────── */

/**
 * Halka bir rakibin en az 7 peteğinden geçtiyse özet bu seçimi dolu açarak önerir.
 * Düelloyu kendiliğinden başlatmaz, koşuyu geriye dönük saymaz.
 */
export function suggestDuels(w: World, playerId: string, loopCells: readonly CellId[]): Array<{ defenderId: string; cells: CellId[]; avgPower: number }> {
  const inDuel = new Set(
    [...w.duels.values()].filter((d) => d.status === 'active' && d.attackerId === playerId).flatMap((d) => d.cells),
  );
  const byOwner = new Map<string, CellId[]>();
  for (const id of loopCells) {
    const c = w.cells.get(id);
    if (!c?.ownerId || c.ownerId === playerId || inDuel.has(id)) continue;
    const arr = byOwner.get(c.ownerId) ?? [];
    arr.push(id);
    byOwner.set(c.ownerId, arr);
  }
  const out: Array<{ defenderId: string; cells: CellId[]; avgPower: number }> = [];
  for (const [defenderId, ids] of byOwner) {
    if (ids.length < RULES.DUEL_MIN_CELLS) continue;
    // En büyük bağlı parça, en fazla 60 petek.
    const comps = connectedPieces(ids);
    const best = bfsTake(comps[0]!, RULES.DUEL_MAX_CELLS);
    if (best.length < RULES.DUEL_MIN_CELLS) continue;
    const avg = best.reduce((s, id) => s + (w.cells.get(id)?.power ?? 0), 0) / best.length;
    out.push({ defenderId, cells: best, avgPower: round1(avg) });
  }
  return out.sort((a, b) => b.cells.length - a.cells.length);
}
