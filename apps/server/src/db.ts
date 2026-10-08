import pg from 'pg';

// bigint (int8) sayılar JS number'a (süreler ms cinsinden güvenli aralıkta).
pg.types.setTypeParser(20, (v) => Number(v));
// date → 'YYYY-MM-DD' dizgesi olarak kalsın.
pg.types.setTypeParser(1082, (v) => v);
// real/double → number
pg.types.setTypeParser(700, (v) => Number(v));
pg.types.setTypeParser(701, (v) => Number(v));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
export type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

export function createPool(url: string, max = 20): Db {
  return new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 30_000 });
}

export async function tx<T>(db: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** Tekrar denenebilir işlem (serileştirme/kilitlenme hatalarında). */
export async function txRetry<T>(db: Db, fn: (c: Tx) => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await tx(db, fn);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (i < attempts - 1 && (code === '40001' || code === '40P01')) continue;
      throw e;
    }
  }
}
