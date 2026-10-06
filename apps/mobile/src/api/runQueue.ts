import type { RunSummary, SubmitRunRequest } from '@hexrun/contracts';
import { readJSON, writeJSON, type KV } from '../lib/storage';
import { ApiError } from './errors';

export interface QueuedRun {
  req: SubmitRunRequest;
  attempts: number;
  /** Bir sonraki deneme zamanı (epoch ms). */
  nextAttemptAt: number;
  createdAt: number;
  lastError?: string;
  /** Kalıcı hata (4xx): bir daha denenmez. */
  failed?: boolean;
}

export interface RunQueueState {
  items: QueuedRun[];
  /** clientRunId → sunucu özeti. */
  results: Record<string, RunSummary>;
}

export interface RunQueueOptions {
  kv: KV;
  submit: (req: SubmitRunRequest) => Promise<RunSummary>;
  now?: () => number;
  /** Üstel geri çekilme tabanı (ms). */
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  /** Saklanan sonuç sayısı. */
  keepResults?: number;
}

const KEY = 'hexrun.runQueue.v1';

/**
 * Çevrimdışı koşu kuyruğu. Her koşu bir istemci UUID'si taşır; sunucu `clientRunId` ile
 * idempotent olduğundan aynı koşu tekrar gönderilse de bir kez sayılır.
 * Geçici hatalarda üstel geri çekilme + titreşim; kalıcı 4xx hatada iş bırakılır.
 */
export class RunQueue {
  private readonly kv: KV;
  private readonly submitFn: (req: SubmitRunRequest) => Promise<RunSummary>;
  private readonly now: () => number;
  private readonly base: number;
  private readonly max: number;
  private readonly random: () => number;
  private readonly keep: number;
  private state: RunQueueState | null = null;
  private flushing: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  constructor(o: RunQueueOptions) {
    this.kv = o.kv;
    this.submitFn = o.submit;
    this.now = o.now ?? Date.now;
    this.base = o.baseDelayMs ?? 5_000;
    this.max = o.maxDelayMs ?? 10 * 60_000;
    this.random = o.random ?? Math.random;
    this.keep = o.keepResults ?? 20;
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

  async load(): Promise<RunQueueState> {
    if (!this.state) {
      const s = await readJSON<RunQueueState>(this.kv, KEY);
      this.state = s ?? { items: [], results: {} };
    }
    return this.state;
  }

  private async save(): Promise<void> {
    if (this.state) await writeJSON(this.kv, KEY, this.state);
    this.emit();
  }

  async enqueue(req: SubmitRunRequest): Promise<void> {
    const s = await this.load();
    if (s.results[req.clientRunId] || s.items.some((i) => i.req.clientRunId === req.clientRunId)) return;
    s.items.push({ req, attempts: 0, nextAttemptAt: this.now(), createdAt: this.now() });
    await this.save();
  }

  async pending(): Promise<QueuedRun[]> {
    return (await this.load()).items.filter((i) => !i.failed);
  }

  async result(clientRunId: string): Promise<RunSummary | null> {
    return (await this.load()).results[clientRunId] ?? null;
  }

  async status(clientRunId: string): Promise<'done' | 'pending' | 'failed' | 'unknown'> {
    const s = await this.load();
    if (s.results[clientRunId]) return 'done';
    const it = s.items.find((i) => i.req.clientRunId === clientRunId);
    if (!it) return 'unknown';
    return it.failed ? 'failed' : 'pending';
  }

  backoff(attempts: number): number {
    const exp = Math.min(this.max, this.base * 2 ** Math.max(0, attempts - 1));
    // ±%20 titreşim: aynı anda bağlanan cihazlar sunucuyu birlikte dövmesin.
    return Math.round(exp * (0.8 + 0.4 * this.random()));
  }

  /** Vakti gelen işleri gönderir. `force` geri çekilmeyi yok sayar (ör. "Tekrar dene"). */
  flush(force = false): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.doFlush(force).finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async doFlush(force: boolean): Promise<void> {
    const s = await this.load();
    const due = s.items.filter((i) => !i.failed && (force || i.nextAttemptAt <= this.now()));
    for (const item of due) {
      try {
        const summary = await this.submitFn(item.req);
        s.items = s.items.filter((i) => i !== item);
        s.results[item.req.clientRunId] = summary;
        const ids = Object.keys(s.results);
        for (const id of ids.slice(0, Math.max(0, ids.length - this.keep))) delete s.results[id];
        await this.save();
      } catch (e) {
        item.attempts += 1;
        item.lastError = e instanceof Error ? e.message : String(e);
        if (e instanceof ApiError && !e.isRetryable && e.status !== 401) {
          item.failed = true;
        } else {
          item.nextAttemptAt = this.now() + this.backoff(item.attempts);
        }
        await this.save();
        // Ağ yoksa diğerlerini de deneme.
        if (e instanceof ApiError && e.isNetwork) break;
      }
    }
  }

  /** En yakın deneme zamanı (zamanlayıcı için). */
  async nextDueAt(): Promise<number | null> {
    const items = await this.pending();
    if (!items.length) return null;
    return Math.min(...items.map((i) => i.nextAttemptAt));
  }
}
