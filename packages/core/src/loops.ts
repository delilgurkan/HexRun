import { RULES } from './constants.js';
import { cellsInPolygon, type CellId } from './cells.js';
import { haversineM, polygonAreaM2, type LatLng, type TrackPoint } from './geo.js';

export interface LoopOptions {
  /** Yakalama yarıçapı (m): 50, Halka Ustası ile 60. */
  closeRadiusM?: number;
  /** Asgari halka çevresi (m). */
  minLoopLengthM?: number;
  /** Doğruluğu bundan kötü noktalar yok sayılır (m). */
  maxAccuracyM?: number;
  /** Bundan hızlı ani sıçramalar (m/s) yok sayılır. */
  maxJumpSpeedMps?: number;
}

export interface ClosedLoop {
  /** Halka içinde 1'den başlayan sıra. */
  index: number;
  /** Halkayı oluşturan noktalar (başlangıca kapatılmış). */
  ring: TrackPoint[];
  lengthM: number;
  areaM2: number;
  closedAt: number;
  startedAt: number;
}

export interface TrackerState {
  distanceM: number;
  durationMs: number;
  /** Başlangıç noktasına kuş uçuşu mesafe. */
  distToStartM: number;
  /** Halka kurulmuş mu (başlangıçtan yeterince uzaklaşıldı ve asgari çevre aşıldı). */
  armed: boolean;
  /** HUD'un "halkayı kapat" modu (≤300 m). */
  closingMode: boolean;
  /** Ortalama tempo sn/km (yeterli veri yoksa null). */
  paceSecPerKm: number | null;
  loops: ClosedLoop[];
  start: TrackPoint | null;
}

/**
 * Artımlı halka dedektörü. Hem istemcideki HUD hem sunucudaki yetkili hesap
 * aynı sınıfı kullanır; böylece "telefonda kapandı ama sunucuda kapanmadı" olmaz.
 */
export class LoopTracker {
  private readonly closeR: number;
  private readonly minLen: number;
  private readonly maxAcc: number;
  private readonly maxJump: number;
  private pts: TrackPoint[] = [];
  private segStart = 0;
  private segLen = 0;
  private maxSegDist = 0;
  private dist = 0;
  private movingMs = 0;
  private start: TrackPoint | null = null;
  private loops: ClosedLoop[] = [];
  private lastDistToStart = 0;
  private paused = false;
  private resumeGap = false;

  constructor(opts: LoopOptions = {}) {
    this.closeR = opts.closeRadiusM ?? RULES.LOOP_CLOSE_M;
    this.minLen = opts.minLoopLengthM ?? RULES.MIN_LOOP_LENGTH_M;
    this.maxAcc = opts.maxAccuracyM ?? 50;
    this.maxJump = opts.maxJumpSpeedMps ?? 12;
  }

  /** Duraklatma: duraklatılmış süre ve mesafe sayılmaz; devamda sıçrama yok sayılır. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.resumeGap = true;
  }

  /** Yeni GPS noktası. Halka kapandıysa onu döndürür. */
  push(p: TrackPoint): ClosedLoop | null {
    if (this.paused) return null;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !Number.isFinite(p.t)) return null;
    if (p.acc !== undefined && p.acc > this.maxAcc) return null;
    const prev = this.pts[this.pts.length - 1];
    if (prev) {
      if (p.t <= prev.t) return null;
      const d = haversineM(prev, p);
      const dt = (p.t - prev.t) / 1000;
      if (d / dt > this.maxJump) {
        if (!this.resumeGap) return null;
      }
      if (this.resumeGap) {
        // Duraklatmadan dönüş: arada geçen mesafe/süre koşuya eklenmez.
        this.resumeGap = false;
      } else {
        this.dist += d;
        this.segLen += d;
        this.movingMs += p.t - prev.t;
      }
    } else {
      this.start = p;
    }
    this.pts.push(p);
    const start = this.start!;
    const ds = haversineM(start, p);
    this.lastDistToStart = ds;
    if (ds > this.maxSegDist) this.maxSegDist = ds;

    if (this.isArmed() && ds <= this.closeR) {
      const seg = this.pts.slice(this.segStart);
      const ring: TrackPoint[] = [...seg];
      const first = ring[0]!;
      if (first.lat !== start.lat || first.lng !== start.lng) ring.unshift({ ...start, t: first.t });
      ring.push({ ...start, t: p.t });
      const loop: ClosedLoop = {
        index: this.loops.length + 1,
        ring,
        lengthM: this.segLen + ds,
        areaM2: polygonAreaM2(ring),
        closedAt: p.t,
        startedAt: first.t,
      };
      this.loops.push(loop);
      this.segStart = this.pts.length - 1;
      this.segLen = 0;
      this.maxSegDist = ds;
      return loop;
    }
    return null;
  }

  private isArmed(): boolean {
    return this.maxSegDist > this.closeR + RULES.LOOP_ARM_EXTRA_M && this.segLen >= this.minLen;
  }

  state(): TrackerState {
    const armed = this.isArmed();
    return {
      distanceM: this.dist,
      durationMs: this.movingMs,
      distToStartM: this.lastDistToStart,
      armed,
      closingMode: armed && this.lastDistToStart <= RULES.CLOSING_MODE_M,
      paceSecPerKm: this.dist >= 50 ? this.movingMs / 1000 / (this.dist / 1000) : null,
      loops: [...this.loops],
      start: this.start,
    };
  }

  /** Halka açıkken kapanırsa alınacak önizleme poligonu (başlangıca düz kapatılmış). */
  previewRing(): LatLng[] {
    if (!this.start) return [];
    const seg = this.pts.slice(this.segStart);
    return [this.start, ...seg, this.start];
  }

  points(): readonly TrackPoint[] {
    return this.pts;
  }
}

export function detectLoops(points: readonly TrackPoint[], opts: LoopOptions = {}): ClosedLoop[] {
  const tr = new LoopTracker(opts);
  for (const p of points) tr.push(p);
  return tr.state().loops;
}

export function loopCells(loop: Pick<ClosedLoop, 'ring'>): CellId[] {
  return cellsInPolygon(loop.ring);
}

/** Koşu özeti istatistikleri. */
export function trackStats(points: readonly TrackPoint[]): { distanceM: number; durationMs: number; paceSecPerKm: number | null } {
  const tr = new LoopTracker({ minLoopLengthM: Number.POSITIVE_INFINITY });
  for (const p of points) tr.push(p);
  const s = tr.state();
  return { distanceM: s.distanceM, durationMs: s.durationMs, paceSecPerKm: s.paceSecPerKm };
}
