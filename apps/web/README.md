# HexRun web — hexrun.co + admin console

Static site (TR first, EN second) and the internal loop-review console. **Zero runtime dependencies**:
plain HTML/CSS, two tiny vanilla JS files for the site, one for admin. A ~400-line Node script does the templating.

```
npm install          # dev-only deps: @playwright/test, @axe-core/playwright, html-validate
npm run build        # -> dist/
npm run serve        # http://localhost:4173 (mimics Cloudflare Pages/Netlify: _redirects, _headers, 404)
npm test             # build + html-validate + Playwright (e2e, link crawl, axe light/dark, 320/360 px overflow)
npm run images       # re-render OG images, PNG app icons, favicon.ico (only after brand changes; outputs are committed)
```

Playwright uses a pre-installed Chromium from `PLAYWRIGHT_BROWSERS_PATH` (defaults to `/opt/pw-browsers` when that
folder exists). Elsewhere run `npx playwright install chromium` once. `@playwright/test` is pinned to 1.56.1 to match it.

## Layout

| Path | What |
| --- | --- |
| `site.config.json` | **All deploy-time values and placeholders** (API base, store URLs, company/legal details, emails, iOS team ID, Android SHA-256). |
| `src/pages/{tr,en}/*.html` | Page bodies. First line is `<!--meta {title, description, route, alt, noindex?, scripts?}-->`. `{{tokens}}` come from `scripts/build.mjs` → `tokens()`; unknown tokens fail the build. |
| `scripts/build.mjs` | Layout (header/footer/meta/CSP), page build, sitemap, robots, manifest, `.well-known/*`, `_headers`, `_redirects`. |
| `scripts/illustrations.mjs` | Build-time SVG: hero "saha haritası" and the 3 how-it-works steps (pointy-top hex grid, themed via CSS classes). |
| `src/static/` | Copied as-is: CSS, JS, self-hosted fonts (Archivo, IBM Plex Mono, OFL), brand SVGs, PNGs, favicon. |
| `src/admin/` | Admin console → `dist/admin/` (`noindex`, `X-Robots-Tag`, `Cache-Control: no-store`). |
| `tests/` | Playwright specs. |

Routes: `/`, `/en/`, `/gizlilik/` · `/en/privacy/`, `/kosullar/` · `/en/terms/`, `/hesap-silme/` · `/en/account-deletion/`,
`/topluluk-kurallari/` · `/en/community-guidelines/`, `/destek/` · `/en/support/`, `/basin/` · `/en/press/`,
`/invite/<code>` · `/en/invite/<code>`, `/r/<path>` · `/en/r/<path>`, `/404.html`, `/admin/`.

## Deploy

Any static host works; upload `dist/`.

- **Cloudflare Pages**: build command `npm run build`, output `dist`, root `apps/web`. `_headers` and `_redirects` are honoured.
- **Netlify**: base `apps/web`, build `npm run build`, publish `dist`. Same `_headers` / `_redirects` format.
- **Other hosts** (S3, nginx, GitHub Pages): replicate `dist/_redirects` (rewrites `/invite/*`, `/r/*` to their `index.html`
  with status 200 — required for universal-link fallbacks), serve `dist/404.html` for misses, and send
  `Content-Type: application/json` for `/.well-known/apple-app-site-association` (no extension, no redirect).
  Pages also carry a `<meta>` CSP, so the main policy holds even without `_headers` (but `frame-ancestors` needs the header).

Universal links: the domain must serve `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` over
HTTPS without redirects. The iOS app needs the `applinks:hexrun.co` entitlement; the Android manifest needs an
`autoVerify` intent filter for `https://hexrun.co/invite/*` and `/r/*`. The fallback pages build `hexrun://invite/<code>`
(Android: `intent://…;S.browser_fallback_url=…`), never auto-redirect, and show store links.

### API expectations

- `POST {apiBase}/v1/waitlist` with JSON `{ email, locale: "tr" | "en" }` → 2xx ok; 409 = already listed (shown as
  success); 400/422 = invalid email; 429 = rate limited; anything else = generic error. Must send CORS headers
  allowing `https://hexrun.co` and `Content-Type`. The site CSP allows `connect-src` to the `apiBase` origin only.
- Admin: `GET /v1/admin/metrics`, `GET /v1/admin/reviews`, `POST /v1/admin/reviews/:loopId {decision}` with
  `Authorization: Bearer <token>`; 401/403 sends the user back to login. CORS must allow the `Authorization` header.
  Reason codes are translated in `src/admin/admin.js` (`REASONS`; unknown codes are shown raw). Fast segments are
  drawn where pace < 2'30"/km (`FAST_SEC_PER_KM`, same as `packages/core` `ANTICHEAT.MIN_PACE_SEC_PER_KM`).
  Track `t` may be epoch ms or ISO strings. The token lives only in `sessionStorage`. Protect `/admin/` additionally at
  the edge (e.g. Cloudflare Access) — the page itself is public HTML; the API is the security boundary.

## Placeholders to fill (`site.config.json`)

The build prints every unfilled `[PLACEHOLDER]`. Unfilled values render as a highlighted `<mark>` in legal pages;
unset store URLs render as "Yakında / Coming soon" links to the waitlist.

| Key | Placeholder |
| --- | --- |
| `appStoreUrl`, `playUrl` | `[APP_STORE_URL]`, `[PLAY_URL]` |
| `apiBase`, `adminApiBase` | defaults to `https://api.hexrun.co` — change if different |
| `ios.teamId` (+ `ios.bundleId`) | `[APPLE_TEAM_ID]` (bundle ID assumed `co.hexrun.app`) |
| `android.sha256Fingerprints` (+ `packageName`) | `[ANDROID_SHA256_CERT_FINGERPRINT]` — Play App Signing key, plus upload key if needed |
| `company.*` | `[ŞİRKET UNVANI]`, `[ŞİRKET ADRESİ]`, `[MERSİS NO]`, `[TİCARET SİCİL MÜDÜRLÜĞÜ VE NO]`, `[VERBİS KAYIT DURUMU]`, `[AB TEMSİLCİSİ …]` |
| `emails.*` | `[KVKK_EMAIL]`, `[DESTEK_EMAIL]`, `[BASIN_EMAIL]` |
| `legal.*` | `[YÜRÜRLÜK TARİHİ]`, `[YETKİLİ MAHKEME / İCRA DAİRELERİ]` |

Inline placeholders inside page copy (edit the page files directly): cloud provider/region, map tile provider, email
provider, error-monitoring provider, backup / waitlist / log / anti-cheat-record retention periods, launch date
(`grep -rn 'class="ph"' src/pages`).

**Legal copy is a drafted starting point, not legal advice.** Have the privacy policy (KVKK aydınlatma metni + GDPR),
terms and deletion page reviewed by counsel before launch, especially legal bases, retention periods, transfer
mechanisms and the in-app paths named there (`Profil › Ayarlar › Hesabı sil`, `Verilerimi indir`, `Bilgi ekle`).
