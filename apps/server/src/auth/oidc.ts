import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { unauthorized } from '../lib/errors.js';

export interface OidcIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface OidcVerifier {
  apple(token: string): Promise<OidcIdentity>;
  google(token: string): Promise<OidcIdentity>;
}

interface Opts {
  appleKeys: JWTVerifyGetKey;
  googleKeys: JWTVerifyGetKey;
  appleAudiences: string[];
  googleAudiences: string[];
  now?: () => number;
}

export function createOidcVerifier(o: Opts): OidcVerifier {
  return {
    async apple(token) {
      try {
        const { payload } = await jwtVerify(token, o.appleKeys, { issuer: 'https://appleid.apple.com', audience: o.appleAudiences, ...(o.now ? { currentDate: new Date(o.now()) } : {}) });
        if (!payload.sub) throw new Error('sub');
        return {
          sub: payload.sub,
          email: typeof payload.email === 'string' ? payload.email : null,
          emailVerified: payload.email_verified === true || payload.email_verified === 'true',
          name: null,
        };
      } catch {
        throw unauthorized('Apple ile giriş doğrulanamadı.');
      }
    },
    async google(token) {
      if (!o.googleAudiences.length) throw unauthorized('Google ile giriş yapılandırılmamış.');
      try {
        const { payload } = await jwtVerify(token, o.googleKeys, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: o.googleAudiences, ...(o.now ? { currentDate: new Date(o.now()) } : {}) });
        if (!payload.sub) throw new Error('sub');
        return {
          sub: payload.sub,
          email: typeof payload.email === 'string' ? payload.email : null,
          emailVerified: payload.email_verified === true,
          name: typeof payload.name === 'string' ? payload.name : null,
        };
      } catch {
        throw unauthorized('Google ile giriş doğrulanamadı.');
      }
    },
  };
}

export function remoteOidc(appleJwks: string, googleJwks: string, appleAud: string[], googleAud: string[]): OidcVerifier {
  return createOidcVerifier({
    appleKeys: createRemoteJWKSet(new URL(appleJwks)),
    googleKeys: createRemoteJWKSet(new URL(googleJwks)),
    appleAudiences: appleAud,
    googleAudiences: googleAud,
  });
}
