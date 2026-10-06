import type { AuthResponse } from '@hexrun/contracts';
import type { Deps } from '../deps.js';
import { tx, type Queryable } from '../db.js';
import { hmac, inviteCode, safeEqual, sixDigitCode, uuid } from '../lib/crypto.js';
import { badRequest, tooMany, unauthorized } from '../lib/errors.js';
import { list } from '../config.js';
import { getUser, toMe } from '../game/players.js';
import { issueRefresh, revokeRefresh, rotateRefresh, signAccess } from './tokens.js';

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const RESEND_MS = 60_000;
const MAX_SENDS_PER_HOUR = 5;

export function normEmail(e: unknown): string {
  const s = typeof e === 'string' ? e.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(s) || s.length > 254) throw badRequest('validation', 'Geçerli bir e-posta gir.');
  return s;
}

export async function startEmail(d: Deps, emailRaw: string): Promise<{ sent: true; devCode?: string }> {
  const email = normEmail(emailRaw);
  const now = d.clock.now();
  const code = sixDigitCode();
  const hash = hmac(d.cfg.HASH_SECRET, `${email}|${code}`);
  const prev = (await d.db.query<{ last_sent_at: Date; sent_count: number; window_start: Date }>('SELECT last_sent_at, sent_count, window_start FROM email_codes WHERE email = $1', [email])).rows[0];
  if (prev) {
    if (now - prev.last_sent_at.getTime() < RESEND_MS) throw tooMany('Yeni kod için bir dakika bekle.');
    const inWindow = now - prev.window_start.getTime() < 3_600_000;
    if (inWindow && prev.sent_count >= MAX_SENDS_PER_HOUR) throw tooMany('Bu saat için kod sınırına ulaştın.');
    await d.db.query(
      `UPDATE email_codes SET code_hash = $2, expires_at = $3, attempts = 0, last_sent_at = $4,
         sent_count = CASE WHEN $5 THEN sent_count + 1 ELSE 1 END, window_start = CASE WHEN $5 THEN window_start ELSE $4 END
       WHERE email = $1`,
      [email, hash, new Date(now + CODE_TTL_MS), new Date(now), inWindow],
    );
  } else {
    await d.db.query('INSERT INTO email_codes (email, code_hash, expires_at, last_sent_at, window_start) VALUES ($1, $2, $3, $4, $4)', [email, hash, new Date(now + CODE_TTL_MS), new Date(now)]);
  }
  await d.mailer.send({
    to: email,
    subject: `HexRun giriş kodun: ${code}`,
    text: `Giriş kodun: ${code}\n\nKod 10 dakika geçerli. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.\n\nHexRun`,
  });
  return d.cfg.NODE_ENV === 'production' ? { sent: true } : { sent: true, devCode: code };
}

export async function verifyEmail(d: Deps, emailRaw: string, code: string): Promise<AuthResponse> {
  const email = normEmail(emailRaw);
  const now = d.clock.now();
  const row = (await d.db.query<{ code_hash: string; expires_at: Date; attempts: number }>('SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = $1', [email])).rows[0];
  if (!row || row.expires_at.getTime() < now) throw unauthorized('Kodun süresi doldu; yeni kod iste.');
  if (row.attempts >= MAX_ATTEMPTS) throw tooMany('Çok fazla hatalı deneme; yeni kod iste.');
  const ok = safeEqual(row.code_hash, hmac(d.cfg.HASH_SECRET, `${email}|${String(code).trim()}`));
  if (!ok) {
    await d.db.query('UPDATE email_codes SET attempts = attempts + 1 WHERE email = $1', [email]);
    throw unauthorized('Kod hatalı.');
  }
  await d.db.query('DELETE FROM email_codes WHERE email = $1', [email]);
  return loginWith(d, { email, emailVerified: true, kind: 'email' });
}

export async function appleLogin(d: Deps, identityToken: string, fullName?: string): Promise<AuthResponse> {
  const id = await d.oidc.apple(identityToken);
  return loginWith(d, { kind: 'apple', sub: id.sub, email: id.email, emailVerified: id.emailVerified, name: fullName ?? null });
}

export async function googleLogin(d: Deps, idToken: string): Promise<AuthResponse> {
  const id = await d.oidc.google(idToken);
  return loginWith(d, { kind: 'google', sub: id.sub, email: id.email, emailVerified: id.emailVerified, name: id.name });
}

type Login =
  | { kind: 'email'; email: string; emailVerified: true }
  | { kind: 'apple' | 'google'; sub: string; email: string | null; emailVerified: boolean; name: string | null };

async function loginWith(d: Deps, l: Login): Promise<AuthResponse> {
  const now = d.clock.now();
  const admins = new Set(list(d.cfg.ADMIN_EMAILS).map((e) => e.toLowerCase()));
  const { userId, refreshToken } = await tx(d.db, async (c) => {
    let userId: string | null = null;
    if (l.kind === 'email') {
      userId = (await c.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [l.email])).rows[0]?.id ?? null;
    } else {
      const col = l.kind === 'apple' ? 'apple_sub' : 'google_sub';
      userId = (await c.query<{ id: string }>(`SELECT id FROM users WHERE ${col} = $1`, [l.sub])).rows[0]?.id ?? null;
      // Doğrulanmış e-posta aynı hesaba bağlanır.
      if (!userId && l.email && l.emailVerified) {
        userId = (await c.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [l.email.toLowerCase()])).rows[0]?.id ?? null;
        if (userId) await c.query(`UPDATE users SET ${col} = $2 WHERE id = $1`, [userId, l.sub]);
      }
    }
    if (!userId) {
      userId = uuid();
      const email = l.kind === 'email' ? l.email : l.emailVerified ? l.email?.toLowerCase() ?? null : null;
      const name = l.kind === 'email' ? '' : (l.name ?? '').trim().slice(0, 40);
      await insertUser(c, userId, email, l.kind === 'apple' ? l.sub : null, l.kind === 'google' ? l.sub : null, name, now);
    }
    const email = (await c.query<{ email: string | null }>('SELECT email FROM users WHERE id = $1', [userId])).rows[0]?.email;
    if (email && admins.has(email.toLowerCase())) await c.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [userId]);
    await c.query('UPDATE users SET last_active_at = $2 WHERE id = $1', [userId, new Date(now)]);
    return { userId, refreshToken: await issueRefresh(d, c, userId) };
  });
  return authResponse(d, userId, refreshToken);
}

async function insertUser(c: Queryable, id: string, email: string | null, appleSub: string | null, googleSub: string | null, name: string, now: number): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      await c.query('INSERT INTO users (id, email, apple_sub, google_sub, display_name, invite_code, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
        id,
        email,
        appleSub,
        googleSub,
        name,
        inviteCode(8),
        new Date(now),
      ]);
      await c.query('INSERT INTO player_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
      return;
    } catch (e) {
      // Davet kodu çakışması: yeniden dene. Diğer benzersizlik hataları yukarı.
      if ((e as { constraint?: string }).constraint !== 'users_invite_code_key') throw e;
    }
  }
  throw new Error('invite code collision');
}

export async function authResponse(d: Deps, userId: string, refreshToken: string): Promise<AuthResponse> {
  const u = await getUser(d.db, userId);
  if (!u) throw unauthorized('Hesap bulunamadı.');
  return {
    accessToken: await signAccess(d, { sub: u.id, role: u.role }),
    refreshToken,
    expiresIn: d.cfg.ACCESS_TTL_S,
    user: toMe(u, d.clock.now()),
    needsProfile: !u.username,
  };
}

export async function refresh(d: Deps, token: string): Promise<AuthResponse> {
  if (typeof token !== 'string' || token.length < 20) throw unauthorized('Oturum geçersiz.');
  const r = await tx(d.db, (c) => rotateRefresh(d, c, token));
  if (!r) throw unauthorized('Oturum geçersiz.');
  return authResponse(d, r.userId, r.refreshToken);
}

export async function logout(d: Deps, token: string): Promise<void> {
  if (typeof token === 'string' && token.length >= 20) await revokeRefresh(d, d.db, token);
}
