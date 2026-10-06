import { SignJWT, jwtVerify } from 'jose';
import type { Deps } from '../deps.js';
import type { Queryable } from '../db.js';
import { randomToken, sha256, uuid } from '../lib/crypto.js';
import { unauthorized } from '../lib/errors.js';

export interface AccessClaims {
  sub: string;
  role: 'user' | 'admin';
}

const enc = (s: string) => new TextEncoder().encode(s);

export async function signAccess(d: Deps, c: AccessClaims): Promise<string> {
  const now = Math.floor(d.clock.now() / 1000);
  return new SignJWT({ role: c.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + d.cfg.ACCESS_TTL_S)
    .setIssuer('hexrun')
    .setAudience('hexrun-app')
    .sign(enc(d.cfg.JWT_SECRET));
}

export async function verifyAccess(d: Deps, token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, enc(d.cfg.JWT_SECRET), {
      issuer: 'hexrun',
      audience: 'hexrun-app',
      currentDate: new Date(d.clock.now()),
      algorithms: ['HS256'],
    });
    if (!payload.sub) throw new Error('sub');
    return { sub: payload.sub, role: payload.role === 'admin' ? 'admin' : 'user' };
  } catch {
    throw unauthorized('Oturum süresi doldu.');
  }
}

export async function issueRefresh(d: Deps, q: Queryable, userId: string, family: string = uuid()): Promise<string> {
  const token = randomToken(32);
  await q.query(
    'INSERT INTO refresh_tokens (id, user_id, family, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [uuid(), userId, family, sha256(token), new Date(d.clock.now() + d.cfg.REFRESH_TTL_DAYS * 86_400_000), new Date(d.clock.now())],
  );
  return token;
}

/**
 * Yenileme jetonu döndürme. Kullanılmış (iptal edilmiş) bir jeton tekrar gelirse
 * çalınmış sayılır ve tüm aile iptal edilir.
 */
export async function rotateRefresh(d: Deps, q: Queryable, token: string): Promise<{ userId: string; refreshToken: string } | null> {
  const r = await q.query<{ id: string; user_id: string; family: string; expires_at: Date; revoked_at: Date | null }>(
    'SELECT id, user_id, family, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE',
    [sha256(token)],
  );
  const row = r.rows[0];
  if (!row) throw unauthorized('Oturum geçersiz.');
  if (row.revoked_at) {
    // İptal işlemi kalıcı olsun diye hata atmadan döner; çağıran işlemi onaylayıp 401 verir.
    await q.query('UPDATE refresh_tokens SET revoked_at = $2 WHERE family = $1 AND revoked_at IS NULL', [row.family, new Date(d.clock.now())]);
    return null;
  }
  if (row.expires_at.getTime() <= d.clock.now()) throw unauthorized('Oturum süresi doldu.');
  await q.query('UPDATE refresh_tokens SET revoked_at = $2 WHERE id = $1', [row.id, new Date(d.clock.now())]);
  const refreshToken = await issueRefresh(d, q, row.user_id, row.family);
  return { userId: row.user_id, refreshToken };
}

export async function revokeRefresh(d: Deps, q: Queryable, token: string): Promise<void> {
  await q.query('UPDATE refresh_tokens SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(token), new Date(d.clock.now())]);
}
