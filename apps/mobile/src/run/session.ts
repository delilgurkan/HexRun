import type { RunSource, SubmitRunRequest } from '@hexrun/contracts';
import { LoopTracker, RULES, type ClosedLoop, type LatLng, type TrackPoint, type TrackerState } from '@hexrun/core';
import { readJSON, writeJSON, type KV } from '../lib/storage';
import { closingTicks, type TickStrength } from './closing';

export type RunLogEntry = { k: 'p'; p: TrackPoint } | { k: 'pause'; t: number } | { k: 'resume'; t: number };

export interface RunContext {
  /** hexrun://run?defend=<duelId> ile açıldıysa. */
  defendDuelId?: string;
  /** Hedeflenen düello (saldırı). */
  attackDuelId?: string;
  /** İlk halka önerisiyle başladıysa. */
  firstLoop?: boolean;
}

export interface PersistedRun {
  v: 1;
  clientRunId: string;
  startedAt: number;
  status: 'running' | 'paused';
  log: RunLogEntry[];
  closeRadiusM: number;
  minLoopLengthM: number;
  pausedMs: number;
  pausedAt: number | null;
  /** Fetih anı gösterilmiş halka sayısı. */
  loopsShown: number;
  context: RunContext;
}

export type SessionStatus = 'idle' | 'running' | 'paused' | 'finished';

export type SessionEvent =
  | { type: 'loop'; loop: ClosedLoop }
  | { type: 'closing-enter' }
  | { type: 'closing-exit' }
  | { type: 'tick'; strength: TickStrength };

export interface SessionSnapshot {
  status: SessionStatus;
  clientRunId: string;
  startedAt: number;
  /** Duraklatmalar hariç geçen süre. */
  elapsedMs: number;
  tracker: TrackerState;
  pointCount: number;
  lastPoint: TrackPoint | null;
  closeRadiusM: number;
  context: RunContext;
  loopsShown: number;
}

export interface SessionDeps {
  kv: KV;
  now?: () => number;
  uuid: () => string;
  /** Kalıcı yazma aralığı (ms). 0 → her olayda yaz. */
  persistEveryMs?: number;
}

export const ACTIVE_RUN_KEY = 'hexrun.activeRun.v1';

/**
 * Koşu oturumu durum makinesi: idle → running ⇄ paused → finished.
 * Her GPS noktası ve duraklat/devam bir günlüğe yazılır ve kalıcı saklanır; uygulama
 * öldürülürse günlük `LoopTracker`'a yeniden oynatılarak koşu aynen geri gelir.
 */
export class RunSession {
  private tracker: LoopTracker;
  private data: PersistedRun;
  private status: SessionStatus;
  private readonly kv: KV;
  private readonly now: () => number;
  private readonly persistEvery: number;
  private lastPersist = 0;
  private wasClosing = false;
  private listeners = new Set<() => void>();
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(data: PersistedRun, deps: SessionDeps, status: SessionStatus) {
    this.data = data;
    this.kv = deps.kv;
    this.now = deps.now ?? Date.now;
    this.persistEvery = deps.persistEveryMs ?? 5_000;
    this.status = status;
    this.tracker = RunSession.buildTracker(data);
    this.wasClosing = this.tracker.state().closingMode;
  }

  private static buildTracker(d: PersistedRun): LoopTracker {
    const tr = new LoopTracker({ closeRadiusM: d.closeRadiusM, minLoopLengthM: d.minLoopLengthM });
    for (const e of d.log) {
      if (e.k === 'p') tr.push(e.p);
      else if (e.k === 'pause') tr.pause();
      else tr.resume();
    }
    return tr;
  }

  /** Yeni oturum (henüz başlamadı). */
  static create(deps: SessionDeps, opts: { closeRadiusM?: number; minLoopLengthM?: number; context?: RunContext } = {}): RunSession {
    const now = (deps.now ?? Date.now)();
    const data: PersistedRun = {
      v: 1,
      clientRunId: deps.uuid(),
      startedAt: now,
      status: 'running',
      log: [],
      closeRadiusM: opts.closeRadiusM ?? RULES.LOOP_CLOSE_M,
      minLoopLengthM: opts.minLoopLengthM ?? RULES.MIN_LOOP_LENGTH_M,
      pausedMs: 0,
      pausedAt: null,
      loopsShown: 0,
      context: opts.context ?? {},
    };
    return new RunSession(data, deps, 'idle');
  }

  /** Kalıcı depodan yarım kalan koşuyu geri yükler. */
  static async restore(deps: SessionDeps): Promise<RunSession | null> {
    const d = await readJSON<PersistedRun>(deps.kv, ACTIVE_RUN_KEY);
    if (!d || d.v !== 1 || !d.clientRunId) return null;
    return new RunSession(d, deps, d.status);
  }

  /** Arka plan görevi için: oturum bellekte değilse noktaları doğrudan depoya ekler. */
  static async appendToStored(kv: KV, points: TrackPoint[]): Promise<boolean> {
    const d = await readJSON<PersistedRun>(kv, ACTIVE_RUN_KEY);
    if (!d || d.status !== 'running') return false;
    const lastT = [...d.log].reverse().find((e): e is { k: 'p'; p: TrackPoint } => e.k === 'p')?.p.t ?? 0;
    for (const p of points) if (p.t > lastT) d.log.push({ k: 'p', p });
    await writeJSON(kv, ACTIVE_RUN_KEY, d);
    return true;
  }

  get id(): string {
    return this.data.clientRunId;
  }

  getStatus(): SessionStatus {
    return this.status;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  async start(): Promise<void> {
    if (this.status !== 'idle') throw new Error(`start: geçersiz durum ${this.status}`);
    this.status = 'running';
    this.data.startedAt = this.now();
    this.data.status = 'running';
    await this.persist(true);
    this.emit();
  }

  async pause(): Promise<void> {
    if (this.status !== 'running') return;
    const t = this.now();
    this.status = 'paused';
    this.data.status = 'paused';
    this.data.pausedAt = t;
    this.data.log.push({ k: 'pause', t });
    this.tracker.pause();
    await this.persist(true);
    this.emit();
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return;
    const t = this.now();
    this.status = 'running';
    this.data.status = 'running';
    if (this.data.pausedAt !== null) this.data.pausedMs += Math.max(0, t - this.data.pausedAt);
    this.data.pausedAt = null;
    this.data.log.push({ k: 'resume', t });
    this.tracker.resume();
    await this.persist(true);
    this.emit();
  }

  /** GPS noktalarını işler; halka kapanışı, kapanış modu ve haptik tık olaylarını döner. */
  async addPoints(points: readonly TrackPoint[]): Promise<SessionEvent[]> {
    if (this.status !== 'running') return [];
    const events: SessionEvent[] = [];
    const sorted = [...points].sort((a, b) => a.t - b.t);
    for (const p of sorted) {
      const before = this.tracker.state();
      const prevLen = this.tracker.points().length;
      const loop = this.tracker.push(p);
      if (this.tracker.points().length === prevLen) continue; // reddedilen nokta
      this.data.log.push({ k: 'p', p });
      const after = this.tracker.state();
      if (loop) {
        events.push({ type: 'loop', loop });
        this.wasClosing = false;
        continue;
      }
      if (after.closingMode && !this.wasClosing) events.push({ type: 'closing-enter' });
      if (!after.closingMode && this.wasClosing) events.push({ type: 'closing-exit' });
      if (after.closingMode && before.closingMode) {
        for (const s of closingTicks(before.distToStartM, after.distToStartM, this.data.closeRadiusM)) events.push({ type: 'tick', strength: s });
      }
      this.wasClosing = after.closingMode;
    }
    await this.persist(events.some((e) => e.type === 'loop'));
    if (sorted.length) this.emit();
    return events;
  }

  /** Fetih anı gösterildi (geri yüklemede tekrar gösterilmesin). */
  async markLoopsShown(n: number): Promise<void> {
    this.data.loopsShown = Math.max(this.data.loopsShown, n);
    await this.persist(true);
  }

  snapshot(): SessionSnapshot {
    const now = this.now();
    const pausedNow = this.data.pausedAt !== null ? Math.max(0, now - this.data.pausedAt) : 0;
    const pts = this.tracker.points();
    return {
      status: this.status,
      clientRunId: this.data.clientRunId,
      startedAt: this.data.startedAt,
      elapsedMs: this.status === 'idle' ? 0 : Math.max(0, now - this.data.startedAt - this.data.pausedMs - pausedNow),
      tracker: this.tracker.state(),
      pointCount: pts.length,
      lastPoint: pts[pts.length - 1] ?? null,
      closeRadiusM: this.data.closeRadiusM,
      context: this.data.context,
      loopsShown: this.data.loopsShown,
    };
  }

  previewRing(): LatLng[] {
    return this.tracker.previewRing();
  }

  points(): readonly TrackPoint[] {
    return this.tracker.points();
  }

  /** Koşuyu bitirir: gönderim isteğini döner ve yarım koşu kaydını siler. */
  async finish(source: RunSource = 'phone', device?: string): Promise<SubmitRunRequest> {
    if (this.status === 'idle' || this.status === 'finished') throw new Error(`finish: geçersiz durum ${this.status}`);
    if (this.status === 'paused') {
      const t = this.now();
      if (this.data.pausedAt !== null) this.data.pausedMs += Math.max(0, t - this.data.pausedAt);
      this.data.pausedAt = null;
    }
    this.status = 'finished';
    const req: SubmitRunRequest = {
      clientRunId: this.data.clientRunId,
      source,
      points: this.tracker.points().map((p) => ({ lat: p.lat, lng: p.lng, t: p.t, ...(p.acc !== undefined ? { acc: p.acc } : {}) })),
      ...(device ? { device } : {}),
    };
    await this.writeChain;
    await this.kv.removeItem(ACTIVE_RUN_KEY);
    this.emit();
    return req;
  }

  /** Koşuyu kaydetmeden at. */
  async discard(): Promise<void> {
    this.status = 'finished';
    await this.writeChain;
    await this.kv.removeItem(ACTIVE_RUN_KEY);
    this.emit();
  }

  /** Bekleyen yazmayı hemen yap (uygulama arka plana geçerken). */
  flush(): Promise<void> {
    return this.persist(true);
  }

  private persist(force: boolean): Promise<void> {
    if (this.status === 'idle' || this.status === 'finished') return this.writeChain;
    const now = this.now();
    if (!force && this.persistEvery > 0 && now - this.lastPersist < this.persistEvery) return this.writeChain;
    this.lastPersist = now;
    const snapshot = JSON.stringify(this.data);
    this.writeChain = this.writeChain.then(() => this.kv.setItem(ACTIVE_RUN_KEY, snapshot)).catch(() => undefined);
    return this.writeChain;
  }
}
