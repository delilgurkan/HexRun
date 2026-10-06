import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

export const uuid = () => randomUUID();

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function hmac(secret: string, s: string): string {
  return createHmac('sha256', secret).update(s).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function inviteCode(len = 8): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[randomInt(0, ALPHA.length)];
  return s;
}
