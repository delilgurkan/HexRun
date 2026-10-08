import { test, expect } from '@playwright/test';

const API = 'https://api.hexrun.co';

test.describe('waitlist form', () => {
  test('success: posts {email, locale} as JSON and confirms', async ({ page }) => {
    let body = null;
    let contentType = null;
    await page.route(`${API}/v1/waitlist`, async (route) => {
      body = route.request().postDataJSON();
      contentType = route.request().headers()['content-type'];
      await route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}', headers: { 'access-control-allow-origin': '*' } });
    });
    await page.goto('/');
    await page.getByLabel('E-posta adresin').fill('kosucu@ornek.com');
    await page.getByRole('button', { name: 'Listeye katıl' }).click();
    await expect(page.locator('#wl-status')).toHaveText(/Listedesin/);
    expect(body).toEqual({ email: 'kosucu@ornek.com', locale: 'tr' });
    expect(contentType).toContain('application/json');
    await expect(page.getByLabel('E-posta adresin')).toHaveValue('');
  });

  test('success in English sends locale "en"', async ({ page }) => {
    let body = null;
    await page.route(`${API}/v1/waitlist`, async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 200, body: '{}', contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } });
    });
    await page.goto('/en/');
    await page.getByLabel('Your email address').fill('runner@example.com');
    await page.getByRole('button', { name: 'Join the list' }).click();
    await expect(page.locator('#wl-status')).toHaveText(/on the list/);
    expect(body).toEqual({ email: 'runner@example.com', locale: 'en' });
  });

  test('client-side validation blocks invalid email without calling the API', async ({ page }) => {
    let calls = 0;
    await page.route(`${API}/v1/waitlist`, (route) => { calls++; return route.abort(); });
    await page.goto('/');
    await page.getByLabel('E-posta adresin').fill('gecersiz-adres');
    await page.getByRole('button', { name: 'Listeye katıl' }).click();
    await expect(page.locator('#wl-status')).toHaveText(/geçerli görünmüyor/);
    await expect(page.getByLabel('E-posta adresin')).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toBe(0);
  });

  test('server error shows a retryable error and re-enables the button', async ({ page }) => {
    await page.route(`${API}/v1/waitlist`, (route) =>
      route.fulfill({ status: 500, body: '{"error":"x"}', contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }));
    await page.goto('/');
    await page.getByLabel('E-posta adresin').fill('kosucu@ornek.com');
    await page.getByRole('button', { name: 'Listeye katıl' }).click();
    await expect(page.locator('#wl-status')).toHaveText(/kaydedemedik/);
    await expect(page.locator('#wl-status')).toHaveAttribute('data-state', 'error');
    await expect(page.getByRole('button', { name: 'Listeye katıl' })).toBeEnabled();
    await expect(page.getByLabel('E-posta adresin')).toHaveValue('kosucu@ornek.com');
  });

  test('409 duplicate is treated as already on the list; 429 asks to wait; network failure explained', async ({ page }) => {
    let mode = 409;
    await page.route(`${API}/v1/waitlist`, (route) =>
      mode === 0 ? route.abort('failed') : route.fulfill({ status: mode, body: '{}', contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }));
    await page.goto('/');
    const input = page.getByLabel('E-posta adresin');
    const btn = page.getByRole('button', { name: 'Listeye katıl' });
    await input.fill('kosucu@ornek.com');
    await btn.click();
    await expect(page.locator('#wl-status')).toHaveText(/zaten listede/);
    mode = 429;
    await btn.click();
    await expect(page.locator('#wl-status')).toHaveText(/Çok fazla deneme/);
    mode = 422;
    await btn.click();
    await expect(page.locator('#wl-status')).toHaveText(/geçerli görünmüyor/);
    mode = 0;
    await btn.click();
    await expect(page.locator('#wl-status')).toHaveText(/Bağlantı kurulamadı/);
  });
});

test.describe('invite and share landing pages', () => {
  test('/invite/<code> builds hexrun://invite/<code>', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/invite/AB12-cd_9');
    const open = page.getByRole('link', { name: "HexRun'da aç" });
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute('href', 'hexrun://invite/AB12-cd_9');
    await expect(page.locator('[data-code]')).toHaveText('AB12-cd_9');
    await expect(page.locator('[data-missing]')).toBeHidden();
    await expect(page.locator('[data-lang-switch]')).toHaveAttribute('href', '/en/invite/AB12-cd_9');
    await expect(page.locator('.applink .stores a')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('?code= query also works, English page', async ({ page }) => {
    await page.goto('/en/invite/?code=XYZ789');
    await expect(page.getByRole('link', { name: 'Open in HexRun' })).toHaveAttribute('href', 'hexrun://invite/XYZ789');
  });

  test('invalid or missing code shows a message and no open button', async ({ page }) => {
    await page.goto('/invite/');
    await expect(page.locator('[data-missing]')).toBeVisible();
    await expect(page.locator('[data-open]')).toBeHidden();
    await page.goto('/invite/%3Cscript%3E');
    await expect(page.locator('[data-missing]')).toBeVisible();
    await expect(page.locator('[data-open]')).toBeHidden();
  });

  test('Android gets an intent:// link with browser fallback', async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36' });
    const page = await ctx.newPage();
    await page.goto('/invite/ABC123');
    const href = await page.locator('[data-open]').getAttribute('href');
    expect(href).toMatch(/^intent:\/\/invite\/ABC123#Intent;scheme=hexrun;S\.browser_fallback_url=.+;end$/);
    await expect(page.locator('[data-open]')).toHaveAttribute('data-deeplink', 'hexrun://invite/ABC123');
    await ctx.close();
  });

  test('/r/<path> builds hexrun://r/<path>', async ({ page }) => {
    await page.goto('/r/card/k9F2');
    await expect(page.locator('[data-open]')).toHaveAttribute('href', 'hexrun://r/card/k9F2');
  });
});
