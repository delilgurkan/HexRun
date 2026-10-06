import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://hexrun:hexrun@localhost:5432/hexrun'),
  DATABASE_POOL_MAX: z.coerce.number().int().default(20),
  JWT_SECRET: z.string().min(32).default('dev-only-secret-change-me-please-0123456789'),
  /** Gizli oyuncu kimliği ve e-posta kodu karması için. */
  HASH_SECRET: z.string().min(16).default('dev-only-hash-secret-0123456789'),
  ACCESS_TTL_S: z.coerce.number().int().default(15 * 60),
  REFRESH_TTL_DAYS: z.coerce.number().int().default(60),
  CORS_ORIGINS: z.string().default('*'),
  APPLE_CLIENT_IDS: z.string().default('co.hexrun.app'),
  GOOGLE_CLIENT_IDS: z.string().default(''),
  APPLE_JWKS_URL: z.string().url().default('https://appleid.apple.com/auth/keys'),
  GOOGLE_JWKS_URL: z.string().url().default('https://www.googleapis.com/oauth2/v3/certs'),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('HexRun <no-reply@hexrun.co>'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  PUSH_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  JOBS_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  ADMIN_EMAILS: z.string().default(''),
  PUBLIC_BASE_URL: z.string().default('https://api.hexrun.co'),
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  STRAVA_VERIFY_TOKEN: z.string().optional(),
  /** Garmin/Coros/Suunto/Polar ortak web kancası imza anahtarları: "garmin:xxx,polar:yyy". */
  WEBHOOK_SECRETS: z.string().default(''),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().default(300),
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().default(10),
  RUN_RATE_LIMIT_PER_MIN: z.coerce.number().int().default(30),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cfg = schema.parse(env);
  if (cfg.NODE_ENV === 'production') {
    if (cfg.JWT_SECRET.startsWith('dev-only') || cfg.HASH_SECRET.startsWith('dev-only')) {
      throw new Error('Üretimde JWT_SECRET ve HASH_SECRET ayarlanmalı.');
    }
  }
  return cfg;
}

export const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
