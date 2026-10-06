import type { DuelSummary, MapCell } from '@hexrun/contracts';
import { RULES, type ClosedLoop, type TrackPoint } from '@hexrun/core';
import type { RunQueue } from '../api/runQueue';
import type { KV } from '../lib/storage';
import { createStore, useStore } from '../lib/store';
import { previewConquest, type ConquestContext, type ConquestPreview } from './conquest';
import { RunSession, type RunContext, type SessionEvent, type SessionSnapshot } from './session';
import type { TickStrength } from './closing';

export interface LocationAdapter {
  /** Konum güncellemelerini başlatır (arka plan dahil). */
  start(onPoints: (pts: TrackPoint[]) => void): Promise<void>;
  stop(): Promise<void>;
}

export interface HapticsAdapter {
  tick(strength: TickStrength): void;
  /** Kare 1: tek sert darbe. */
  closeImpact(): void;
  /** Kare 2: her 10 petekte hafif tık. */
  cellTick(): void;
  /** Rakip petek çatlarken çift tık. */
  crack(): void;
  /** Kare 3: başarı bildirimi. */
  success(): void;
}

export interface KeepAwakeAdapter {
  activate(): void;
  deactivate(): void;
}

export interface ConquestState {
  loop: ClosedLoop;
  preview: ConquestPreview;
  shownAt: number;
}

export type GpsQuality = 'searching' | 'weak' | 'strong';

export interface RunUiState {
  active: boolean;
  snap: SessionSnapshot | null;
  conquest: ConquestState | null;
  gps: GpsQuality;
  locked: boolean;
  recovered: boolean;
}

export const runStore = createStore<RunUiState>({ active: false, snap: null, conquest: null, gps: 'searching', locked: false, recovered: false });

export function useRunState<U>(sel: (s: RunUiState) => U): U {
  return useStore(runStore, sel);
}

export interface ControllerDeps {
  kv: KV;
  uuid: () => string;
  now?: () => number;
  location: LocationAdapter;
  haptics: HapticsAdapter;
  keepAwake: KeepAwakeAdapter;
  queue: RunQueue;
  /** Fetih önizlemesi için son bilinen harita ve düellolar. */
  conquestContext: () => ConquestContext;
  persistEveryMs?: number;
  /** PUT /v1/me/activity: koşu başlarken true, biterken false (en iyi çaba). */
  onActivity?: (running: boolean) => void;
}

export function gpsQuality(acc: number | undefined): GpsQuality {
  if (acc === undefined) return 'strong';
  if (acc <= 20) return 'strong';
  if (acc <= 50) return 'weak';
  return 'searching';
}

/**
 * Koşu modu denetleyicisi: oturum + konum + haptik + ekranı açık tutma + gönderim kuyruğu.
 * UI yalnız `runStore`'u okur; arka plan görevi `ingest`'i çağırır.
 */
export class RunController {
  private session: RunSession | null = null;
  private unsub: (() => void) | null = null;
  private readonly d: ControllerDeps;

  constructor(deps: ControllerDeps) {
    this.d = deps;
  }

  get current(): RunSession | null {
    return this.session;
  }

  private publish() {
    runStore.set({ active: !!this.session && this.session.getStatus() !== 'finished', snap: this.session?.snapshot() ?? null });
  }

  private attach(s: RunSession) {
    this.unsub?.();
    this.session = s;
    this.unsub = s.subscribe(() => this.publish());
    this.publish();
  }

  /** Uygulama açılışında yarım kalan koşuyu geri yükler. */
  async recover(): Promise<boolean> {
    if (this.session) return true;
    const s = await RunSession.restore({ kv: this.d.kv, uuid: this.d.uuid, now: this.d.now, persistEveryMs: this.d.persistEveryMs });
    if (!s) return false;
    this.attach(s);
    runStore.set({ recovered: true });
    this.d.onActivity?.(true);
    this.d.keepAwake.activate();
    await this.d.location.start((pts) => void this.ingest(pts)).catch(() => undefined);
    return true;
  }

  async start(context: RunContext = {}, opts: { closeRadiusM?: number; minLoopLengthM?: number } = {}): Promise<RunSession> {
    if (this.session && this.session.getStatus() !== 'finished') return this.session;
    const s = RunSession.create(
      { kv: this.d.kv, uuid: this.d.uuid, now: this.d.now, persistEveryMs: this.d.persistEveryMs },
      { context, closeRadiusM: opts.closeRadiusM ?? RULES.LOOP_CLOSE_M, minLoopLengthM: opts.minLoopLengthM },
    );
    await s.start();
    this.attach(s);
    runStore.set({ conquest: null, locked: false, recovered: false, gps: 'searching' });
    this.d.keepAwake.activate();
    this.d.onActivity?.(true);
    await this.d.location.start((pts) => void this.ingest(pts));
    return s;
  }

  /** GPS noktaları (ön plan izleyici ya da arka plan görevi). */
  async ingest(points: TrackPoint[]): Promise<SessionEvent[]> {
    if (!points.length) return [];
    const last = points[points.length - 1]!;
    runStore.set({ gps: gpsQuality(last.acc) });
    if (!this.session) {
      await RunSession.appendToStored(this.d.kv, points);
      return [];
    }
    const events = await this.session.addPoints(points);
    for (const e of events) this.handle(e);
    return events;
  }

  private handle(e: SessionEvent) {
    if (e.type === 'tick') this.d.haptics.tick(e.strength);
    if (e.type === 'loop') {
      this.d.haptics.closeImpact();
      const preview = previewConquest(e.loop, this.d.conquestContext());
      runStore.set({ conquest: { loop: e.loop, preview, shownAt: (this.d.now ?? Date.now)() } });
      void this.session?.markLoopsShown(e.loop.index);
    }
  }

  dismissConquest() {
    runStore.set({ conquest: null });
  }

  async pause() {
    await this.session?.pause();
  }

  async resume() {
    await this.session?.resume();
  }

  setLocked(locked: boolean) {
    runStore.set({ locked });
  }

  /** Bitir: kuyruğa koy, göndermeyi dene, oturumu kapat. clientRunId döner. */
  async finish(): Promise<string | null> {
    const s = this.session;
    if (!s) return null;
    await this.d.location.stop().catch(() => undefined);
    this.d.keepAwake.deactivate();
    const req = await s.finish();
    this.d.onActivity?.(false);
    this.unsub?.();
    this.unsub = null;
    this.session = null;
    runStore.set({ active: false, snap: null, conquest: null, locked: false });
    if (req.points.length >= 2) {
      await this.d.queue.enqueue(req);
      void this.d.queue.flush();
      return req.clientRunId;
    }
    return null;
  }

  async discard() {
    await this.d.location.stop().catch(() => undefined);
    this.d.keepAwake.deactivate();
    await this.session?.discard();
    this.d.onActivity?.(false);
    this.unsub?.();
    this.session = null;
    runStore.set({ active: false, snap: null, conquest: null, locked: false });
  }

  /** Saniyelik HUD yenilemesi (süre). */
  refresh() {
    if (this.session) this.publish();
  }
}

/** Haritadan fetih bağlamı oluşturur. */
export function buildConquestContext(myId: string | null, cells: readonly MapCell[] | undefined, attacking: readonly DuelSummary[] | undefined): ConquestContext {
  return { myId, cells: new Map((cells ?? []).map((c) => [c.id, c])), attacking: attacking ?? [] };
}
