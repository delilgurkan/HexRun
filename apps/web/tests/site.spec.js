import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { builtPages, PUBLIC_PAGES, trackErrors } from './helpers.js';

const pages = builtPages();

test('expected pages are built', () => {
  for (const p of ['/', '/en/', '/gizlilik/', '/en/privacy/', '/kosullar/', '/en/terms/', '/hesap-silme/',
    '/en/account-deletion/', '/topluluk-kurallari/', '/en/community-guidelines/', '/destek/', '/en/support/',
    '/basin/', '/en/press/', '/invite/', '/en/invite/', '/r/', '/en/r/', '/404.html', '/admin/']) {
    expect(pages, `missing ${p}`).toContain(p);
  }
});

for (const path of pages) {
  test(`loads without console errors: ${path}`, async ({ page }) => {
    const errors = trackErrors(page);
    const res = await page.goto(path, { waitUntil: 'networkidle' });
    expect(res.status()).toBe(200);
    await expect(page.locator('h1:visible')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test('crawl: every internal link and asset resolves', async ({ page, request }) => {
  test.setTimeout(180_000);
  const seen = new Set();
  const checked = new Map();
  const queue = ['/', '/en/', '/404.html', '/admin/', ...PUBLIC_PAGES()];
  const broken = [];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    await page.goto(path);
    const refs = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('a[href]').forEach((a) => out.push({ kind: 'a', url: a.href, raw: a.getAttribute('href') }));
      document.querySelectorAll('link[href]').forEach((l) => out.push({ kind: 'link', url: l.href }));
      document.querySelectorAll('script[src], img[src]').forEach((e) => out.push({ kind: 'res', url: e.src }));
      document.querySelectorAll('meta[property="og:image"]').forEach((m) => out.push({ kind: 'og', url: m.content }));
      return out;
    });
    for (const r of refs) {
      let u;
      try { u = new URL(r.url); } catch { broken.push(`${path}: bad url ${r.url}`); continue; }
      if (r.kind === 'og' || (r.kind === 'link' && u.hostname === 'hexrun.co')) {
        // Absolute production URLs (canonical, hreflang, og:image): check the same path locally.
        u = new URL(u.pathname, page.url());
      }
      if (u.origin !== new URL(page.url()).origin) continue; // external (mailto:, hexrun://, stores)
      const target = u.pathname;
      if (!checked.has(target)) checked.set(target, (await request.get(target, { maxRedirects: 0 })).status());
      const status = checked.get(target);
      if (status !== 200) broken.push(`${path} -> ${target} (${status})`);
      if (r.kind === 'a' && u.hash && u.hash.length > 1) {
        // Fragment must exist on the target page.
        const html = await (await request.get(target)).text();
        const id = decodeURIComponent(u.hash.slice(1));
        if (!html.includes(`id="${id}"`)) broken.push(`${path} -> ${target}${u.hash} (missing anchor)`);
      }
      if (r.kind === 'a' && target.endsWith('/') && !seen.has(target) && !target.startsWith('/assets/')) queue.push(target);
    }
  }
  expect(broken).toEqual([]);
  expect(seen.size).toBeGreaterThanOrEqual(19);
});

test('unknown paths get the 404 page with status 404', async ({ page }) => {
  const res = await page.goto('/olmayan-sayfa/');
  expect(res.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('haritada yok');
});

for (const scheme of ['light', 'dark']) {
  test(`axe: no serious/critical violations (${scheme})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: scheme });
    const failures = [];
    for (const path of pages) {
      await page.goto(path, { waitUntil: 'networkidle' });
      // Open all FAQ items so their content is scanned too.
      await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
      for (const v of result.violations) {
        if (v.impact === 'serious' || v.impact === 'critical') {
          failures.push(`${path} [${v.impact}] ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
}

for (const width of [360, 320]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 800 });
    const over = [];
    for (const path of pages) {
      await page.goto(path, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (sw > cw) over.push(`${path}: scrollWidth ${sw} > ${cw}`);
    }
    expect(over).toEqual([]);
  });
}

test('meta: canonical, hreflang, OG and CSP are present on the home page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://hexrun.co/');
  await expect(page.locator('link[hreflang="en"]')).toHaveAttribute('href', 'https://hexrun.co/en/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://hexrun.co/assets/img/og-tr.png');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  expect(await page.locator('script:not([src])').count()).toBe(0);
  expect(await page.locator('[style]').count()).toBe(0);
});
