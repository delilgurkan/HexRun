#!/usr/bin/env node
// One-off generator for raster brand images (committed under src/static, NOT part of `npm run build`):
//   assets/img/og-tr.png, og-en.png (1200x630, share-card look), apple-touch-icon.png (180),
//   icon-192.png, icon-512.png, icon-maskable-512.png, /favicon.ico (32px PNG inside ICO).
// Run after brand changes:  npm run images   (needs the Playwright Chromium; see playwright.config.js)

import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/static/assets/img');
await mkdir(OUT, { recursive: true });

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';

const font = (await readFile(join(ROOT, 'src/static/assets/fonts/archivo-latin.woff2'))).toString('base64');
const fontExt = (await readFile(join(ROOT, 'src/static/assets/fonts/archivo-latin-ext.woff2'))).toString('base64');
const mono = (await readFile(join(ROOT, 'src/static/assets/fonts/plexmono-500-latin.woff2'))).toString('base64');
const wordmark = await readFile(join(ROOT, 'src/static/assets/brand/hexrun-wordmark-paper.svg'), 'utf8');

const ICON = (bg = '#141716', rx = 27) =>
  `<rect width="120" height="120" rx="${rx}" fill="${bg}"/><path d="M60 24 L89.4 41 V75 L60 92 L30.6 75 V41 Z" fill="#E69F00" fill-opacity="0.28" stroke="#E69F00" stroke-width="7" stroke-linejoin="round"/><path d="M45 73 L56 92 L34 92 Z" fill="#F7F6F1"/>`;

function silhouette() {
  const R = 22, dx = Math.sqrt(3) * R, dy = 1.5 * R;
  const blob = [[60, 70], [210, 30], [380, 80], [430, 230], [370, 400], [190, 440], [60, 360], [20, 210]];
  const inP = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const hx = (x, y) => { const a = 0.866 * R, b = R / 2; return `M${x} ${y - R}l${a} ${b}v${R}l${-a} ${b}l${-a} ${-b}v${-R}z`; };
  let d = '';
  for (let r = 0; r * dy < 470; r++) for (let c = 0; c * dx < 460; c++) { const x = c * dx + (r % 2 ? dx / 2 : 0), y = r * dy + 10; if (inP(x, y, blob)) d += hx(x.toFixed(1), y.toFixed(1)); }
  return `<svg viewBox="0 0 460 470" width="460" height="470"><path d="${d}" fill="#E69F00" fill-opacity=".55" stroke="#0F1312" stroke-width="2"/><path d="M180 330 L200 364 L160 364 Z" fill="#F2F1EA"/></svg>`;
}

const og = (lang) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:A;font-weight:100 900;font-stretch:62% 125%;src:url(data:font/woff2;base64,${font}) format('woff2');unicode-range:U+0000-00FF,U+0131,U+2000-206F}
@font-face{font-family:A;font-weight:100 900;font-stretch:62% 125%;src:url(data:font/woff2;base64,${fontExt}) format('woff2');unicode-range:U+0100-02BA}
@font-face{font-family:M;font-weight:500;src:url(data:font/woff2;base64,${mono}) format('woff2')}
body{margin:0}
.c{width:1200px;height:630px;background:#0F1312;color:#F2F1EA;font-family:A;position:relative;overflow:hidden;box-sizing:border-box;padding:64px}
.top{display:flex;align-items:center;gap:20px}
.top svg.i{width:72px;height:72px}
.top .w svg{height:58px;width:auto;display:block}
.k{font:500 20px/24px M;letter-spacing:.08em;text-transform:uppercase;color:#B4BBB7;margin-top:120px}
h1{margin:18px 0 0;font-weight:900;font-stretch:118%;font-size:66px;line-height:1.02;letter-spacing:-.02em;max-width:640px}
.sil{position:absolute;right:40px;top:80px}
.rule{position:absolute;left:64px;right:64px;bottom:60px;border-top:1.5px solid rgba(242,241,234,.2);padding-top:16px;font:500 20px/24px M;color:#B4BBB7;letter-spacing:.04em}
</style></head><body><div class="c">
<div class="top"><svg class="i" viewBox="0 0 120 120">${ICON('#232927')}</svg><div class="w">${wordmark}</div></div>
<p class="k">${lang === 'tr' ? 'Koşu + toprak oyunu' : 'Running + territory game'}</p>
<h1>${lang === 'tr' ? 'Koş. Halkayı kapat. Mahalleyi al.' : 'Run. Close the loop. Take the neighbourhood.'}</h1>
<div class="sil">${silhouette()}</div>
<div class="rule">hexrun.co · iOS · Android</div>
</div></body></html>`;

const iconPage = (size, maskable, opaque) => `<!doctype html><html><head><style>body{margin:0;background:transparent}</style></head><body>
<svg width="${size}" height="${size}" viewBox="0 0 120 120">${maskable ? `<rect width="120" height="120" fill="#141716"/><g transform="translate(18 18) scale(.7)">${ICON()}</g>` : opaque ? ICON('#141716', 0) : ICON()}</svg></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const lang of ['tr', 'en']) {
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(og(lang));
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.c').screenshot({ path: join(OUT, `og-${lang}.png`) });
}
const icons = [
  ['apple-touch-icon.png', 180, false, true],
  ['icon-192.png', 192, false, false],
  ['icon-512.png', 512, false, false],
  ['icon-maskable-512.png', 512, true, false],
  ['favicon-32.png', 32, false, false],
];
for (const [name, size, maskable, opaque] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(iconPage(size, maskable, opaque));
  await page.locator('svg').screenshot({ path: join(OUT, name), omitBackground: !(maskable || opaque) });
}
await browser.close();

// favicon.ico: ICO container with one embedded 32x32 PNG.
const png = await readFile(join(OUT, 'favicon-32.png'));
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
await writeFile(join(ROOT, 'src/static/favicon.ico'), Buffer.concat([head, png]));
console.log('Rendered OG images, app icons and favicon.ico');
