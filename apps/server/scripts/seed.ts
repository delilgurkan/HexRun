/**
 * Geliştirme verisi: Kadıköy'de 8 oyuncu, bölgeler ve bir düello.
 * Kullanım: DATABASE_URL=... npx tsx scripts/seed.ts
 */
import { circleTrack, destination } from '@hexrun/core';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
import { systemClock } from '../src/lib/clock.js';
import { MemoryMailer } from '../src/lib/mailer.js';
import { MemoryPushSender } from '../src/lib/push.js';
import { remoteOidc } from '../src/auth/oidc.js';

const MODA = { lat: 40.9819, lng: 29.0254 };
const PLAYERS: Array<[string, string, string]> = [
  ['Deniz Arslan', 'denizkosar', 'keh'],
  ['Selin Aydın', 'selin', 'gul'],
  ['Zeynep Çelik', 'zeynep', 'gok'],
  ['Kaan Demir', 'kaan', 'lac'],
  ['Burak Öztürk', 'burak', 'kir'],
  ['Emre Şahin', 'emre', 'lim'],
  ['Ece Yıldız', 'ece', 'zum'],
  ['Mert Kaya', 'mert', 'mer'],
];

async function main() {
  const cfg = loadConfig({ ...process.env, NODE_ENV: 'development', RATE_LIMIT_PER_MIN: '100000', AUTH_RATE_LIMIT_PER_MIN: '100000', RUN_RATE_LIMIT_PER_MIN: '100000' });
  const db = createPool(cfg.DATABASE_URL, 5);
  await migrate(db);
  const app = await buildApp({ cfg, db, clock: systemClock, mailer: new MemoryMailer(), push: new MemoryPushSender(), oidc: remoteOidc(cfg.APPLE_JWKS_URL, cfg.GOOGLE_JWKS_URL, [], []), fetch });
  const now = Date.now();
  for (const [i, [name, username, slot]] of PLAYERS.entries()) {
    const email = `${username}@seed.hexrun.co`;
    const s = await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email } });
    const code = s.json().devCode;
    if (!code) {
      console.log(`${name}: zaten var (kod bekleme süresi), atlandı`);
      continue;
    }
    const v = await app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email, code } });
    const token = v.json().accessToken;
    await app.inject({ method: 'PATCH', url: '/v1/me', headers: { authorization: `Bearer ${token}` }, payload: { username, displayName: name, slot } });
    const center = destination(MODA, i * 45, 450);
    const pts = circleTrack(center, 160, 140, now - 3 * 3_600_000 + i * 60_000, 3.1);
    const r = await app.inject({ method: 'POST', url: '/v1/runs', headers: { authorization: `Bearer ${token}` }, payload: { clientRunId: `seed-${username}-1`, source: 'phone', points: pts } });
    console.log(`${name} (${email}): ${r.json().loops?.[0]?.newCells ?? 0} petek`);
  }
  await app.close();
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
