import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));

function migrationsDir(): string {
  // src/ ve dist/ içinden çalışır.
  return join(here, '..', 'migrations');
}

export async function migrate(db: Db, dir = migrationsDir()): Promise<string[]> {
  const c = await db.connect();
  try {
    await c.query('SELECT pg_advisory_lock(727274)');
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const applied: string[] = [];
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = await readFile(join(dir, f), 'utf8');
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await c.query('COMMIT');
        applied.push(f);
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`Göç başarısız: ${f}: ${(e as Error).message}`);
      }
    }
    return applied;
  } finally {
    await c.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    c.release();
  }
}
