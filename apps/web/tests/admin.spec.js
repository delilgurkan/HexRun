import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { trackErrors } from './helpers.js';

const API = 'https://api.test.hexrun.co';
const TOKEN = 'adm_test_token_123';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type' };

const t0 = Date.parse('2026-10-03T15:02:00Z');
// 0..9: ~12 s per 30 m (2.5 m/s, 6'40"/km); 10..13: 30 m/s (car-like); rest normal again.
function track() {
  const pts = [];
  let lat = 40.9874, lng = 29.0254, t = t0;
  for (let i = 0; i < 24; i++) {
    const fast = i >= 10 && i <= 13;
    pts.push({ lat, lng, t });
    lat += 0.00027 * Math.cos(i / 4);
    lng += 0.00035 * Math.sin(i / 4);
    t += fast ? 1000 : 12000;
  }
  return pts;
}
const ITEMS = [
  {
    loopId: 'loop_1', runId: 'run_1', player: { id: 'u1', username: 'denizkosar', displayName: 'Deniz Aksoy' },
    closedAt: '2026-10-03T15:40:00Z', reasons: ['pace_too_fast', 'teleport'], paceSecPerKm: 125, segmentM: 1200,
    distanceM: 6100, cells: 44, note: 'Tünelden geçtim, GPS koptu.', track: track()
  },
  {
    loopId: 'loop_2', runId: 'run_2', player: { id: 'u2', username: 'selin', displayName: 'Selin Kaya' },
    closedAt: '2026-10-04T06:12:00Z', reasons: ['sparse_gps'], distanceM: 4200, cells: 18, track: track().slice(0, 8)
  }
];
const METRICS = { dau: 1234, wau: 5678, runsToday: 321, loopsToday: 210, reviewQueue: 2, activeDuels: 87 };

async function mockApi(page, opts = {}) {
  const calls = [];
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET, POST' } });
    calls.push({ method: req.method(), path: url.pathname, auth: req.headers()['authorization'], body: req.postDataJSON?.() ?? null });
    if (req.headers()['authorization'] !== `Bearer ${TOKEN}`) return route.fulfill({ status: 401, headers: CORS, body: '' });
    if (url.pathname === '/v1/admin/metrics') return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(METRICS) });
    if (url.pathname === '/v1/admin/reviews') {
      if (opts.reviewsStatus) return route.fulfill({ status: opts.reviewsStatus, headers: CORS, body: '' });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ items: opts.items ?? ITEMS }) });
    }
    if (url.pathname.startsWith('/v1/admin/reviews/')) {
      if (opts.decisionStatus) return route.fulfill({ status: opts.decisionStatus, headers: CORS, body: '' });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '{"ok":true}' });
    }
    return route.fulfill({ status: 404, headers: CORS, body: '' });
  });
  return calls;
}

async function login(page, token = TOKEN) {
  await page.goto('/admin/');
  await page.getByLabel('API adresi').fill(API);
  await page.getByLabel('Bearer token').fill(token);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

test('login renders metrics and the review queue', async ({ page }) => {
  const errors = trackErrors(page);
  const calls = await mockApi(page);
  await login(page);
  await expect(page.locator('[data-metric="dau"] dd')).toHaveText('1.234');
  await expect(page.locator('[data-metric="activeDuels"] dd')).toHaveText('87');
  const cards = page.locator('.review');
  await expect(cards).toHaveCount(2);
  const first = cards.first();
  await expect(first).toContainText('Deniz Aksoy');
  await expect(first).toContainText('@denizkosar');
  await expect(first.locator('[data-reason="pace_too_fast"]')).toHaveText('Tempo koşu temposunun çok üstünde');
  await expect(first.locator('[data-reason="teleport"]')).toHaveText('GPS sıçraması (ışınlanma)');
  await expect(first).toContainText(`2'05"/km`);
  await expect(first).toContainText('1.200 m');
  await expect(first).toContainText('6,1 km');
  await expect(first).toContainText('Tünelden geçtim');
  await expect(first.locator('svg polyline.t-line')).toHaveCount(1);
  expect(await first.locator('svg line.t-fast').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#queue-count')).toHaveText('(2)');
  expect(calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem('hexrun.admin.token'))).toBe(TOKEN);
  expect(errors).toEqual([]);
});

test('approve asks for confirmation and POSTs the decision', async ({ page }) => {
  const calls = await mockApi(page);
  await login(page);
  const card = page.locator('.review[data-loop-id="loop_1"]');
  await card.getByRole('button', { name: 'Onayla' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('44 petek');
  // Cancel first: nothing is sent.
  await dialog.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(dialog).toBeHidden();
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  // Then confirm.
  await card.getByRole('button', { name: 'Onayla' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click();
  await expect(card).toHaveCount(0);
  const post = calls.find((c) => c.method === 'POST');
  expect(post.path).toBe('/v1/admin/reviews/loop_1');
  expect(post.body).toEqual({ decision: 'approve' });
  await expect(page.locator('#live')).toHaveText(/onaylandı/);
  await expect(page.locator('#queue-count')).toHaveText('(1)');
});

test('reject POSTs decision reject; last item leaves an empty state', async ({ page }) => {
  const calls = await mockApi(page, { items: [ITEMS[1]] });
  await login(page);
  await page.getByRole('button', { name: 'Reddet' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reddet' }).click();
  await expect(page.locator('.review')).toHaveCount(0);
  expect(calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/v1/admin/reviews/loop_2', body: { decision: 'reject' } });
  await expect(page.locator('#queue-state')).toHaveText(/Kuyruk boş/);
});

test('empty queue shows the empty state', async ({ page }) => {
  await mockApi(page, { items: [] });
  await login(page);
  await expect(page.locator('#queue-state')).toHaveText(/Kuyruk boş/);
  await expect(page.locator('.review')).toHaveCount(0);
});

test('queue load error shows an error with retry', async ({ page }) => {
  await mockApi(page, { reviewsStatus: 500 });
  await login(page);
  await expect(page.locator('#queue-state')).toContainText('yüklenemedi (HTTP 500)');
  await expect(page.locator('#queue-state').getByRole('button', { name: 'Tekrar dene' })).toBeVisible();
});

test('decision failure keeps the card and shows an inline error', async ({ page }) => {
  await mockApi(page, { decisionStatus: 500 });
  await login(page);
  const card = page.locator('.review[data-loop-id="loop_1"]');
  await card.getByRole('button', { name: 'Onayla' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click();
  await expect(card.locator('.msg')).toContainText('Karar kaydedilemedi');
  await expect(card.getByRole('button', { name: 'Onayla' })).toBeEnabled();
});

test('bad token returns to login with a message; logout clears the token', async ({ page }) => {
  await mockApi(page);
  await login(page, 'wrong');
  await expect(page.locator('#login-msg')).toContainText('Oturum geçersiz');
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('hexrun.admin.token'))).toBeNull();

  await login(page);
  await expect(page.locator('.review')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.review')).toHaveCount(2); // session survives reload
  await page.getByRole('button', { name: 'Çıkış yap' }).click();
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('hexrun.admin.token'))).toBeNull();
});

for (const scheme of ['light', 'dark']) {
  test(`admin dashboard axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await mockApi(page);
    await login(page);
    await expect(page.locator('.review')).toHaveCount(2);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
    expect(bad).toEqual([]);
  });
}

test('admin dashboard has no horizontal overflow at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockApi(page);
  await login(page);
  await expect(page.locator('.review')).toHaveCount(2);
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
});
