#!/usr/bin/env node
// HexRun static site build. Zero runtime dependencies: Node built-ins only.
//
//   src/pages/<lang>/**/*.html  -> dist/<route>/index.html  (wrapped in the shared layout)
//   src/static/**               -> dist/** (copied as-is)
//   src/admin/*                 -> dist/admin/* (index.html gets {{tokens}} too)
//   generated: robots.txt, sitemap.xml, manifest.webmanifest, .well-known/*, _headers, _redirects
//
// Each page file starts with a meta comment:  <!--meta { "title": "...", "route": "/gizlilik/", ... } -->
// and may use {{token}} placeholders resolved from `tokens()` below. Unknown tokens fail the build.

import { readFile, writeFile, mkdir, rm, readdir, copyFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heroMap, stepIllustration } from './illustrations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

const config = JSON.parse(await readFile(join(ROOT, 'site.config.json'), 'utf8'));
const warnings = new Set();

// ---------- helpers ----------
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isPlaceholder = (v) => typeof v === 'string' && /^\[.*\]$/.test(v.trim());
const ph = (v) => {
  warnings.add(v);
  return `<mark class="ph" title="Doldurulacak alan / placeholder">${esc(v)}</mark>`;
};
const text = (v) => (isPlaceholder(v) ? ph(v) : esc(v));
const mail = (v) => (isPlaceholder(v) ? ph(v) : `<a href="mailto:${esc(v)}">${esc(v)}</a>`);
const SITE = config.siteUrl.replace(/\/$/, '');
const origin = (u) => {
  try {
    return new URL(u).origin;
  } catch {
    return '';
  }
};

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
async function write(rel, content) {
  const p = join(DIST, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content);
}

// ---------- i18n strings for the shared chrome ----------
const T = {
  tr: {
    locale: 'tr_TR',
    skip: 'İçeriğe geç',
    navLabel: 'Ana menü',
    nav: [
      ['/#nasil-oynanir', 'Nasıl oynanır'],
      ['/#kurallar', 'Kurallar'],
      ['/#gizlilik', 'Gizlilik'],
      ['/#sss', 'SSS'],
      ['/destek/', 'Destek'],
    ],
    langSwitch: 'English',
    langSwitchShort: 'EN',
    footTagline: 'Koş. Halkayı kapat. Mahalleyi al.',
    footGame: 'Oyun',
    footLegal: 'Yasal',
    footMore: 'HexRun',
    footLinks: {
      game: [
        ['/#nasil-oynanir', 'Nasıl oynanır'],
        ['/#kurallar', 'Kurallar'],
        ['/#saatler', 'Saatler ve uygulamalar'],
        ['/#bekleme-listesi', 'Bekleme listesi'],
      ],
      legal: [
        ['/gizlilik/', 'Gizlilik politikası'],
        ['/kosullar/', 'Kullanım koşulları'],
        ['/topluluk-kurallari/', 'Topluluk kuralları'],
        ['/hesap-silme/', 'Hesap silme'],
      ],
      more: [
        ['/destek/', 'Destek ve iletişim'],
        ['/basin/', 'Basın kiti'],
      ],
    },
    homeLabel: 'HexRun ana sayfa',
    cookieNote: 'Bu site çerez kullanmaz ve ziyaretçi takibi yapmaz.',
  },
  en: {
    locale: 'en_US',
    skip: 'Skip to content',
    navLabel: 'Main menu',
    nav: [
      ['/en/#how-it-works', 'How it works'],
      ['/en/#rules', 'Rules'],
      ['/en/#privacy', 'Privacy'],
      ['/en/#faq', 'FAQ'],
      ['/en/support/', 'Support'],
    ],
    langSwitch: 'Türkçe',
    langSwitchShort: 'TR',
    footTagline: 'Run. Close the loop. Take the neighbourhood.',
    footGame: 'Game',
    footLegal: 'Legal',
    footMore: 'HexRun',
    footLinks: {
      game: [
        ['/en/#how-it-works', 'How it works'],
        ['/en/#rules', 'Rules'],
        ['/en/#watches', 'Watches and apps'],
        ['/en/#waitlist', 'Waitlist'],
      ],
      legal: [
        ['/en/privacy/', 'Privacy policy'],
        ['/en/terms/', 'Terms of use'],
        ['/en/community-guidelines/', 'Community guidelines'],
        ['/en/account-deletion/', 'Account deletion'],
      ],
      more: [
        ['/en/support/', 'Support and contact'],
        ['/en/press/', 'Press kit'],
      ],
    },
    homeLabel: 'HexRun home',
    cookieNote: 'This site sets no cookies and does no visitor tracking.',
  },
};

// ---------- brand marks ----------
export const ICON_SVG = (cls = 'icon', label = '') =>
  `<svg class="${cls}" viewBox="0 0 120 120" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"'}><rect width="120" height="120" rx="27" class="icon-bg"/><path d="M60 24 L89.4 41 V75 L60 92 L30.6 75 V41 Z" class="icon-hex" stroke-width="7" stroke-linejoin="round"/><path d="M45 73 L56 92 L34 92 Z" class="icon-start"/></svg>`;

// ---------- store links ----------
function storeLinks(lang) {
  const L = lang === 'tr';
  const items = [
    { url: config.appStoreUrl, store: 'App Store', os: 'iOS', id: 'appstore' },
    { url: config.playUrl, store: 'Google Play', os: 'Android', id: 'play' },
  ];
  const waitHref = L ? '/#bekleme-listesi' : '/en/#waitlist';
  return `<ul class="stores" role="list">${items
    .map((i) => {
      const pending = isPlaceholder(i.url);
      if (pending) warnings.add(i.url);
      const k = pending ? (L ? 'Yakında' : 'Coming soon') : L ? 'İndir' : 'Download';
      const href = pending ? waitHref : esc(i.url);
      const extra = pending ? ` data-placeholder="${esc(i.url)}"` : ' rel="noopener"';
      return `<li><a class="store" href="${href}" data-store="${i.id}"${extra}><span class="store-k">${k} · <span lang="en">${i.os}</span></span><span class="store-v">${i.store}</span></a></li>`;
    })
    .join('')}</ul>`;
}

// ---------- tokens ----------
function tokens(lang) {
  return {
    'company.name': text(config.company.name),
    'company.address': text(config.company.address),
    'company.mersis': text(config.company.mersis),
    'company.registry': text(config.company.registry),
    'company.verbis': text(config.company.verbis),
    'company.euRep': text(config.company.euRepresentative),
    'email.kvkk': mail(config.emails.kvkk),
    'email.support': mail(config.emails.support),
    'email.press': mail(config.emails.press),
    'legal.effectiveDate': text(config.legal.effectiveDate),
    'legal.courts': text(config.legal.governingCourts),
    apiBase: esc(config.apiBase.replace(/\/$/, '')),
    adminApiBase: esc((config.adminApiBase || config.apiBase).replace(/\/$/, '')),
    appScheme: esc(config.appScheme),
    appStoreHref: isPlaceholder(config.appStoreUrl) ? '' : esc(config.appStoreUrl),
    playHref: isPlaceholder(config.playUrl) ? '' : esc(config.playUrl),
    storeLinks: storeLinks(lang),
    icon: ICON_SVG('icon'),
    iconLarge: ICON_SVG('icon icon-lg'),
    heroMap: heroMap(lang),
    'step.run': stepIllustration('run', lang),
    'step.close': stepIllustration('close', lang),
    'step.claim': stepIllustration('claim', lang),
    year: String(new Date().getFullYear()),
  };
}

function fill(tpl, ctx, file) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    if (!(k in ctx)) throw new Error(`Unknown token {{${k}}} in ${file}`);
    return ctx[k];
  });
}

// ---------- layout ----------
const CSP_SITE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${origin(config.apiBase)}`.trim(),
  `form-action 'self' ${origin(config.apiBase)}`.trim(),
  "base-uri 'self'",
  "object-src 'none'",
  "manifest-src 'self'",
].join('; ');
const CSP_ADMIN = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

function head({ lang, meta }) {
  const t = T[lang];
  const url = SITE + meta.route;
  const alt = meta.alt ? SITE + meta.alt : null;
  const title = meta.route === '/' || meta.route === '/en/' ? meta.title : `${meta.title} · HexRun`;
  const robots = meta.noindex ? '<meta name="robots" content="noindex, nofollow">' : '';
  const hreflang =
    alt && !meta.noindex
      ? [
          `<link rel="alternate" hreflang="${lang}" href="${esc(url)}">`,
          `<link rel="alternate" hreflang="${lang === 'tr' ? 'en' : 'tr'}" href="${esc(alt)}">`,
          `<link rel="alternate" hreflang="x-default" href="${esc(lang === 'tr' ? url : alt)}">`,
        ].join('\n')
      : '';
  const scripts = (meta.scripts || []).map((s) => `<script src="${esc(s)}" defer></script>`).join('\n');
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${esc(CSP_SITE)}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta.description)}">
${robots}
${meta.noindex ? '' : `<link rel="canonical" href="${esc(url)}">`}
${hreflang}
<meta property="og:type" content="website">
<meta property="og:site_name" content="HexRun">
<meta property="og:title" content="${esc(meta.ogTitle || title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/assets/img/og-${lang}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(lang === 'tr' ? 'HexRun: Koş. Halkayı kapat. Mahalleyi al.' : 'HexRun: Run. Close the loop. Take the neighbourhood.')}">
<meta property="og:locale" content="${t.locale}">
<meta property="og:locale:alternate" content="${lang === 'tr' ? T.en.locale : T.tr.locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(meta.ogTitle || title)}">
<meta name="twitter:description" content="${esc(meta.description)}">
<meta name="twitter:image" content="${SITE}/assets/img/og-${lang}.png">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F7F6F1">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0F1312">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/assets/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css">
${scripts}`;
}

function header(lang, meta) {
  const t = T[lang];
  const home = lang === 'tr' ? '/' : '/en/';
  const altHref = meta.alt || (lang === 'tr' ? '/en/' : '/');
  return `<a class="skip" href="#icerik">${t.skip}</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="${home}" aria-label="${t.homeLabel}">${ICON_SVG('icon')}<span class="brand-word" aria-hidden="true">hexrun</span></a>
    <nav class="site-nav" aria-label="${t.navLabel}">
      <ul role="list">
        ${t.nav.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join('')}
        <li><a class="lang" href="${esc(altHref)}" hreflang="${lang === 'tr' ? 'en' : 'tr'}" lang="${lang === 'tr' ? 'en' : 'tr'}" data-lang-switch><span aria-hidden="true">${t.langSwitchShort}</span><span class="visually-hidden">${t.langSwitch}</span></a></li>
      </ul>
    </nav>
  </div>
</header>`;
}

function footer(lang) {
  const t = T[lang];
  const col = (title, links) =>
    `<div class="foot-col"><h2 class="foot-h">${title}</h2><ul role="list">${links.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul></div>`;
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-brand">
        <p class="foot-word" aria-hidden="true">hexrun</p>
        <p class="foot-tag">${t.footTagline}</p>
        ${storeLinks(lang)}
      </div>
      ${col(t.footGame, t.footLinks.game)}
      ${col(t.footLegal, t.footLinks.legal)}
      ${col(t.footMore, t.footLinks.more)}
    </div>
    <p class="foot-meta">© ${new Date().getFullYear()} ${text(config.company.name)} · hexrun.co · ${t.cookieNote}</p>
  </div>
</footer>`;
}

function layout({ lang, meta, body }) {
  return `<!DOCTYPE html>
<html lang="${lang}" dir="ltr">
<head>
${head({ lang, meta })}
</head>
<body class="${esc(meta.bodyClass || '')}">
${header(lang, meta)}
<main id="icerik" tabindex="-1">
${body}
</main>
${footer(lang)}
</body>
</html>
`
    .replace(/\n{2,}/g, '\n');
}

// ---------- page discovery ----------
function parsePage(src, file) {
  const m = src.match(/^\s*<!--meta\s+([\s\S]*?)-->/);
  if (!m) throw new Error(`Missing <!--meta {...}--> header in ${file}`);
  let meta;
  try {
    meta = JSON.parse(m[1]);
  } catch (e) {
    throw new Error(`Bad meta JSON in ${file}: ${e.message}`);
  }
  for (const k of ['title', 'description', 'route']) if (!meta[k]) throw new Error(`meta.${k} missing in ${file}`);
  return { meta, body: src.slice(m[0].length) };
}

function routeToFile(route) {
  if (route.endsWith('.html')) return route.replace(/^\//, '');
  return join(route.replace(/^\//, ''), 'index.html');
}

// ---------- generated files ----------
function sitemap(pages) {
  const indexed = pages.filter((p) => !p.meta.noindex);
  const byRoute = new Map(indexed.map((p) => [p.meta.route, p]));
  const urls = indexed
    .map((p) => {
      const alts = [`<xhtml:link rel="alternate" hreflang="${p.lang}" href="${SITE}${p.meta.route}"/>`];
      if (p.meta.alt && byRoute.has(p.meta.alt)) {
        const o = byRoute.get(p.meta.alt);
        alts.push(`<xhtml:link rel="alternate" hreflang="${o.lang}" href="${SITE}${o.meta.route}"/>`);
      }
      return `  <url>\n    <loc>${SITE}${p.meta.route}</loc>\n    ${alts.join('\n    ')}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

const robots = () => `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /invite/
Disallow: /en/invite/
Disallow: /r/
Disallow: /en/r/

Sitemap: ${SITE}/sitemap.xml
`;

const manifest = () =>
  JSON.stringify(
    {
      name: 'HexRun',
      short_name: 'HexRun',
      description: 'Koş. Halkayı kapat. Mahalleyi al.',
      lang: 'tr',
      dir: 'ltr',
      start_url: '/',
      scope: '/',
      display: 'browser',
      background_color: '#F7F6F1',
      theme_color: '#141716',
      icons: [
        { src: '/favicon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
        { src: '/assets/img/icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
        { src: '/assets/img/icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'any' },
        { src: '/assets/img/icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
      ],
    },
    null,
    2,
  ) + '\n';

function aasa() {
  const appID = `${config.ios.teamId}.${config.ios.bundleId}`;
  if (isPlaceholder(config.ios.teamId)) warnings.add(config.ios.teamId);
  return (
    JSON.stringify(
      {
        applinks: {
          apps: [],
          details: [
            {
              appIDs: [appID],
              components: [
                { '/': '/r/*', comment: 'Paylaşım ve yönlendirme bağlantıları / share & referral links' },
                { '/': '/invite/*', comment: 'Arkadaş ve takım davetleri / friend & team invites' },
              ],
              appID,
              paths: ['/r/*', '/invite/*'],
            },
          ],
        },
        webcredentials: { apps: [appID] },
      },
      null,
      2,
    ) + '\n'
  );
}

function assetlinks() {
  for (const f of config.android.sha256Fingerprints) if (isPlaceholder(f)) warnings.add(f);
  return (
    JSON.stringify(
      [
        {
          relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
          target: {
            namespace: 'android_app',
            package_name: config.android.packageName,
            sha256_cert_fingerprints: config.android.sha256Fingerprints,
          },
        },
      ],
      null,
      2,
    ) + '\n'
  );
}

const headersFile = () => `# Cloudflare Pages / Netlify headers. scripts/serve.mjs applies the same rules locally.
/*
  Content-Security-Policy: ${CSP_SITE}; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/admin/*
  Content-Security-Policy: ${CSP_ADMIN}; frame-ancestors 'none'
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
  Referrer-Policy: no-referrer

/.well-known/apple-app-site-association
  Content-Type: application/json

/.well-known/assetlinks.json
  Content-Type: application/json

/apple-app-site-association
  Content-Type: application/json

/assets/fonts/*
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: *

/invite/*
  X-Robots-Tag: noindex

/r/*
  X-Robots-Tag: noindex
`;

const redirectsFile = () => `# Cloudflare Pages / Netlify rewrites (200 = rewrite, URL stays). scripts/serve.mjs reads this file.
/invite/*     /invite/index.html     200
/en/invite/*  /en/invite/index.html  200
/r/*          /r/index.html          200
/en/r/*       /en/r/index.html       200
/admin        /admin/                301
`;

// ---------- main ----------
async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  // static files
  const staticDir = join(SRC, 'static');
  for (const f of await walk(staticDir)) {
    const rel = relative(staticDir, f);
    await mkdir(dirname(join(DIST, rel)), { recursive: true });
    await copyFile(f, join(DIST, rel));
  }

  // pages
  const pages = [];
  for (const lang of ['tr', 'en']) {
    const dir = join(SRC, 'pages', lang);
    const ctx = tokens(lang);
    for (const f of (await walk(dir)).filter((f) => f.endsWith('.html')).sort()) {
      const { meta, body } = parsePage(await readFile(f, 'utf8'), f);
      const html = layout({ lang, meta, body: fill(body, ctx, f) });
      await write(routeToFile(meta.route), html);
      pages.push({ lang, meta, file: f });
    }
  }
  // sanity: alternates point to real pages
  const routes = new Set(pages.map((p) => p.meta.route));
  for (const p of pages) if (p.meta.alt && !routes.has(p.meta.alt)) throw new Error(`${p.file}: alt ${p.meta.alt} not found`);

  // admin console
  const adminDir = join(SRC, 'admin');
  for (const f of await readdir(adminDir)) {
    const src = await readFile(join(adminDir, f), 'utf8');
    const out = f.endsWith('.html')
      ? fill(src, { ...tokens('tr'), csp: esc(CSP_ADMIN) }, f)
      : src;
    await write(join('admin', f), out);
  }

  // generated
  await write('sitemap.xml', sitemap(pages));
  await write('robots.txt', robots());
  await write('manifest.webmanifest', manifest());
  await write('.well-known/apple-app-site-association', aasa());
  await write('apple-app-site-association', aasa());
  await write('.well-known/assetlinks.json', assetlinks());
  await write('_headers', headersFile());
  await write('_redirects', redirectsFile());

  const files = (await walk(DIST)).length;
  let size = 0;
  for (const f of await walk(DIST)) size += (await stat(f)).size;
  console.log(`Built ${pages.length} pages + admin → dist/ (${files} files, ${(size / 1024).toFixed(0)} KB)`);
  if (warnings.size) {
    console.log(`\nPlaceholders still to fill in site.config.json (${warnings.size}):`);
    for (const w of [...warnings].sort()) console.log(`  - ${w}`);
  }
}

await main();
