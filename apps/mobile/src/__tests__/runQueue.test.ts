import type { RunSummary, SubmitRunRequest } from '@hexrun/contracts';
import { ApiError } from '../api/errors';
import { RunQueue } from '../api/runQueue';
import { memoryKV } from '../lib/storage';

const req = (id: string): SubmitRunRequest => ({ clientRunId: id, source: 'phone', points: [{ lat: 41, lng: 29, t: 1 }, { lat: 41.001, lng: 29, t: 2 }] });
const summary = (id: string) => ({ id: `srv-${id}`, status: 'applied' }) as unknown as RunSummary;

describe('RunQueue (çevrimdışı kuyruk)', () => {
  it('başarılı gönderimde sonucu saklar ve kuyruktan siler', async () => {
    const kv = memoryKV();
    const submit = jest.fn(async (r: SubmitRunRequest) => summary(r.clientRunId));
    const q = new RunQueue({ kv, submit });
    await q.enqueue(req('a'));
    await q.flush();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(await q.result('a')).toEqual(summary('a'));
    expect(await q.pending()).toHaveLength(0);
    expect(await q.status('a')).toBe('done');
  });

  it('aynı clientRunId iki kez kuyruğa girmez (idempotent)', async () => {
    const q = new RunQueue({ kv: memoryKV(), submit: jest.fn(async (r: SubmitRunRequest) => summary(r.clientRunId)) });
    await q.enqueue(req('a'));
    await q.enqueue(req('a'));
    expect(await q.pending()).toHaveLength(1);
  });

  it('ağ hatasında üstel geri çekilme ile tekrar dener, sonra aynı clientRunId ile başarır', async () => {
    let now = 0;
    const kv = memoryKV();
    const seen: string[] = [];
    let fail = 2;
    const submit = jest.fn(async (r: SubmitRunRequest) => {
      seen.push(r.clientRunId);
      if (fail-- > 0) throw new ApiError(0, 'network', 'yok');
      return summary(r.clientRunId);
    });
    const q = new RunQueue({ kv, submit, now: () => now, baseDelayMs: 1000, random: () => 0.5 });
    await q.enqueue(req('x'));
    await q.flush();
    let [item] = await q.pending();
    expect(item!.attempts).toBe(1);
    expect(item!.nextAttemptAt).toBe(1000);
    await q.flush(); // vakti gelmedi
    expect(submit).toHaveBeenCalledTimes(1);
    now = 1000;
    await q.flush();
    [item] = await q.pending();
    expect(item!.attempts).toBe(2);
    expect(item!.nextAttemptAt).toBe(1000 + 2000);
    now = 3000;
    await q.flush();
    expect(await q.result('x')).toEqual(summary('x'));
    expect(new Set(seen)).toEqual(new Set(['x']));
  });

  it('kalıcı 4xx hatada işi başarısız işaretler', async () => {
    const q = new RunQueue({ kv: memoryKV(), submit: jest.fn(async () => Promise.reject(new ApiError(422, 'validation', 'bozuk'))) });
    await q.enqueue(req('bad'));
    await q.flush();
    expect(await q.status('bad')).toBe('failed');
    expect(await q.pending()).toHaveLength(0);
  });

  it('5xx tekrar denenir; kuyruk depodan geri yüklenir', async () => {
    const kv = memoryKV();
    const q1 = new RunQueue({ kv, submit: jest.fn(async () => Promise.reject(new ApiError(503, 'unavailable', 'x'))) });
    await q1.enqueue(req('k'));
    await q1.flush();
    const submit = jest.fn(async (r: SubmitRunRequest) => summary(r.clientRunId));
    const q2 = new RunQueue({ kv, submit });
    expect(await q2.pending()).toHaveLength(1);
    await q2.flush(true);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ clientRunId: 'k' }));
    expect(await q2.status('k')).toBe('done');
  });

  it('eşzamanlı flush çağrıları tek gönderim yapar', async () => {
    const submit = jest.fn(async (r: SubmitRunRequest) => summary(r.clientRunId));
    const q = new RunQueue({ kv: memoryKV(), submit });
    await q.enqueue(req('c'));
    await Promise.all([q.flush(), q.flush(), q.flush()]);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
