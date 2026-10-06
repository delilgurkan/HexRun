import { test, expect } from '@playwright/test';

test('apple-app-site-association is JSON with /r/* and /invite/*', async ({ request }) => {
  const res = await request.get('/.well-known/apple-app-site-association');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/json');
  const j = await res.json();
  const d = j.applinks.details[0];
  expect(d.appIDs[0]).toMatch(/\.co\.hexrun\.app$/);
  expect(d.components.map((c) => c['/'])).toEqual(['/r/*', '/invite/*']);
  expect(d.paths).toEqual(['/r/*', '/invite/*']);
});

test('assetlinks.json targets the Android package', async ({ request }) => {
  const res = await request.get('/.well-known/assetlinks.json');
  expect(res.headers()['content-type']).toContain('application/json');
  const j = await res.json();
  expect(j[0].relation).toContain('delegate_permission/common.handle_all_urls');
  expect(j[0].target.package_name).toBe('co.hexrun.app');
  expect(j[0].target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
});

test('robots.txt, sitemap.xml, manifest, favicon', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /admin/');
  expect(robots).toContain('Sitemap: https://hexrun.co/sitemap.xml');
  const sm = await (await request.get('/sitemap.xml')).text();
  expect(sm).toContain('<loc>https://hexrun.co/gizlilik/</loc>');
  expect(sm).toContain('hreflang="en" href="https://hexrun.co/en/privacy/"');
  expect(sm).not.toContain('/admin/');
  expect(sm).not.toContain('/invite/');
  const m = await (await request.get('/manifest.webmanifest')).json();
  expect(m.name).toBe('HexRun');
  for (const icon of m.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect((await request.get('/favicon.svg')).headers()['content-type']).toContain('svg');
  expect((await request.get('/favicon.ico')).status()).toBe(200);
});

test('security headers and admin noindex', async ({ request }) => {
  const home = await request.get('/');
  expect(home.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(home.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  const admin = await request.get('/admin/');
  expect(admin.headers()['x-robots-tag']).toContain('noindex');
  expect(await admin.text()).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
});
