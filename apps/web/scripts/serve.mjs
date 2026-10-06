#!/usr/bin/env node
// Tiny static server for dist/ that mimics Cloudflare Pages / Netlify:
// directory index, `_redirects` rewrites (200) and redirects (301/302), `_headers`, 404.html.
// Usage: node scripts/serve.mjs [--port 4173] [--dir dist]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const PORT = Number(arg('port', process.env.PORT || 4173));
const DIR = join(ROOT, arg('dir', 'dist'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

async function loadRules() {
  const redirects = [];
  const headers = [];
  try {
    for (const line of (await readFile(join(DIR, '_redirects'), 'utf8')).split('\n')) {
      const l = line.trim();
      if (!l || l.startsWith('#')) continue;
      const [from, to, code = '301'] = l.split(/\s+/);
      redirects.push({ from, to, code: Number(code) });
    }
  } catch {}
  try {
    let cur = null;
    for (const line of (await readFile(join(DIR, '_headers'), 'utf8')).split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      if (!/^\s/.test(line)) {
        cur = { pattern: line.trim(), set: [] };
        headers.push(cur);
      } else if (cur) {
        const i = line.indexOf(':');
        cur.set.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
      }
    }
  } catch {}
  return { redirects, headers };
}

const matches = (pattern, path) =>
  pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : pattern === path;

async function fileFor(path) {
  const safe = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
  let p = join(DIR, safe);
  if (!p.startsWith(DIR)) return null;
  try {
    const s = await stat(p);
    if (s.isDirectory()) p = join(p, 'index.html');
    await stat(p);
    return p;
  } catch {
    return null;
  }
}

const rules = await loadRules();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = url.pathname;
  let status = 200;

  // Directory without trailing slash -> redirect (like most static hosts).
  for (const r of rules.redirects) {
    if (r.code >= 300 && r.code < 400 && matches(r.from, path)) {
      res.writeHead(r.code, { Location: r.to });
      return res.end();
    }
  }

  let file = await fileFor(path);
  if (file && !path.endsWith('/') && file.endsWith('index.html') && !path.endsWith('.html')) {
    res.writeHead(301, { Location: path + '/' + url.search });
    return res.end();
  }
  if (!file) {
    for (const r of rules.redirects) {
      if (r.code === 200 && matches(r.from, path)) {
        file = await fileFor(r.to);
        if (file) break;
      }
    }
  }
  if (!file) {
    file = join(DIR, '404.html');
    status = 404;
  }

  const hdrs = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' };
  if (!extname(file)) hdrs['Content-Type'] = 'application/json';
  for (const h of rules.headers) if (matches(h.pattern, path)) for (const [k, v] of h.set) hdrs[k] = v;
  // Local dev: HSTS on localhost is unhelpful.
  delete hdrs['Strict-Transport-Security'];
  try {
    const body = await readFile(file);
    res.writeHead(status, hdrs);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500);
    res.end('error');
  }
});

server.listen(PORT, () => console.log(`HexRun web: http://localhost:${PORT}  (serving ${DIR})`));
