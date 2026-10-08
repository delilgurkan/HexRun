/**
 * Yük testi: gerçek sunucuyu (ayrı veritabanı) ayağa kaldırır, oyuncuları ve
 * bölgeleri tohumlar, ardından autocannon ile harita okuma ve koşu yazma yükü uygular.
 * Kullanım: LOAD_DATABASE_URL=postgres://.../hexrun_load npx tsx scripts/load.ts
 */
import autocannon from 'autocannon';
import { circleTrack, destination } from '@hexrun/core';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
import { systemClock } from '../src/lib/clock.js';
import { MemoryMailer } from '../src/lib/mailer.js';
import { MemoryPushSender } from '../src/lib/push.js';
import { remoteOidc } from '../src/auth/oidc.js';

const URL_DB = process.env.LOAD_DATABASE_URL ?? 'postgres://hexrun:hexrun@localhost:5432/hexrun_test';
const MODA = { lat: 40.9819, lng: 29.0254 };
const PLAYERS = Number(process.env.LOAD_PLAYERS ?? 60);
const DURATION = Number(process.env.LOAD_SECONDS ?? 15);

async function main() {
  const cfg = loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: URL_DB, RATE_LIMIT_PER_MIN: '10000000', AUTH_RATE_LIMIT_PER_MIN: '10000000', RUN_RATE_LIMIT_PER_MIN: '10000000', DATABASE_POOL_MAX: '30' });
  const db = createPool(URL_DB, 30);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  const app = await buildApp({ cfg, db, clock: systemClock, mailer: new MemoryMailer(), push: new MemoryPushSender(), oidc: remoteOidc(cfg.APPLE_JWKS_URL, cfg.GOOGLE_JWKS_URL, [], []), fetch });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const tokens: string[] = [];
  const t0 = Date.now() - 6 * 3_600_000;
  console.log(`Tohumlanıyor: ${PLAYERS} oyuncu…`);
  for (let i = 0; i < PLAYERS; i++) {
    const email = `load${i}@load.hexrun.co`;
    const s = await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email } });
    const v = await app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email, code: s.json().devCode } });
    const tok = v.json().accessToken as string;
    tokens.push(tok);
    await app.inject({ method: 'PATCH', url: '/v1/me', headers: { authorization: `Bearer ${tok}` }, payload: { username: `load${i}`, displayName: `Yük ${i}`, slot: ['keh', 'kir', 'lim', 'zum', 'gok', 'lac', 'gul', 'mer'][i % 8] } });
    const c = destination(MODA, (i * 137) % 360, 200 + (i % 10) * 180);
    const pts = circleTrack(c, 120 + (i % 5) * 20, 120, t0 + i * 1000, 3.2);
    await app.inject({ method: 'POST', url: '/v1/runs', headers: { authorization: `Bearer ${tok}` }, payload: { clientRunId: `load-seed-${i}`, source: 'phone', points: pts } });
  }
  const cells = (await db.query<{ n: string }>('SELECT COUNT(*) n FROM cells WHERE owner_id IS NOT NULL')).rows[0]!.n;
  console.log(`Sahipli petek: ${cells}`);

  const n = destination(MODA, 0, 1400);
  const e = destination(MODA, 90, 1400);
  const s = destination(MODA, 180, 1400);
  const w = destination(MODA, 270, 1400);
  const bbox = `${s.lat},${w.lng},${n.lat},${e.lng}`;

  const read = await autocannon({
    url: `${base}/v1/map?bbox=${bbox}`,
    headers: { authorization: `Bearer ${tokens[0]}`, 'accept-encoding': 'gzip' },
    connections: 20,
    duration: DURATION,
  });
  console.log(`\nGET /v1/map (≈2,8 km kare, ${cells} petek): ${read.requests.average.toFixed(0)} istek/sn · p50 ${read.latency.p50} ms · p99 ${read.latency.p99} ms · hata ${read.errors + read.non2xx}`);

  // Telefon ekranında tipik görünüm: ≈1,2 km × 1,2 km
  const n2 = destination(MODA, 0, 600), e2 = destination(MODA, 90, 600), s2 = destination(MODA, 180, 600), w2 = destination(MODA, 270, 600);
  const typical = await autocannon({
    url: `${base}/v1/map?bbox=${s2.lat},${w2.lng},${n2.lat},${e2.lng}`,
    connections: 20,
    duration: DURATION,
    headers: { authorization: `Bearer ${tokens[1]}`, 'accept-encoding': 'gzip' },
  });
  console.log(`GET /v1/map (≈1,2 km kare, tipik ekran): ${typical.requests.average.toFixed(0)} istek/sn · p50 ${typical.latency.p50} ms · p99 ${typical.latency.p99} ms · hata ${typical.errors + typical.non2xx}`);

  let k = 0;
  const write = await autocannon({
    url: `${base}/v1/runs`,
    connections: 10,
    duration: DURATION,
    requests: [
      {
        method: 'POST',
        setupRequest: (req) => {
          const i = k++;
          const tok = tokens[i % tokens.length]!;
          const c = destination(MODA, (i * 53) % 360, 100 + (i % 12) * 150);
          const pts = circleTrack(c, 90, 80, Date.now() - 3_600_000 + (i % 1000), 3.1);
          return { ...req, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify({ clientRunId: `load-run-${i}-${Date.now()}`, source: 'phone', points: pts }) };
        },
      },
    ],
  });
  console.log(`POST /v1/runs (halka + petek + düello + rozet + bildirim, tek işlem): ${write.requests.average.toFixed(1)} istek/sn · p50 ${write.latency.p50} ms · p99 ${write.latency.p99} ms · hata ${write.errors + write.non2xx}`);
  await app.close();
  await db.end();
  if (read.errors + read.non2xx + typical.errors + typical.non2xx + write.errors + write.non2xx > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
