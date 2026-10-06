import { loadConfig, list } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { buildApp } from './app.js';
import { systemClock } from './lib/clock.js';
import { MemoryMailer, SmtpMailer } from './lib/mailer.js';
import { ExpoPushSender } from './lib/push.js';
import { remoteOidc } from './auth/oidc.js';
import { startJobs } from './jobs.js';
import type { Deps } from './deps.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const db = createPool(cfg.DATABASE_URL, cfg.DATABASE_POOL_MAX);
  if (process.env.MIGRATE_ON_START !== 'false') await migrate(db);
  if (cfg.NODE_ENV === 'production' && !cfg.SMTP_URL) throw new Error('Üretimde SMTP_URL gerekli (e-posta giriş kodları).');
  const deps: Deps = {
    cfg,
    db,
    clock: systemClock,
    mailer: cfg.SMTP_URL ? new SmtpMailer(cfg.SMTP_URL, cfg.MAIL_FROM) : new MemoryMailer(),
    push: new ExpoPushSender(cfg.EXPO_ACCESS_TOKEN),
    oidc: remoteOidc(cfg.APPLE_JWKS_URL, cfg.GOOGLE_JWKS_URL, list(cfg.APPLE_CLIENT_IDS), list(cfg.GOOGLE_CLIENT_IDS)),
    fetch: globalThis.fetch,
  };
  const app = await buildApp(deps);
  const stopJobs = cfg.JOBS_ENABLED ? startJobs(deps, app.log) : () => undefined;
  await app.listen({ port: cfg.PORT, host: cfg.HOST });

  const shutdown = async (sig: string) => {
    app.log.info({ sig }, 'shutting down');
    stopJobs();
    await app.close();
    await db.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
