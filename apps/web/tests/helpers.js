import { readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** Every built HTML page as a URL path (dir/index.html -> dir/). */
export function builtPages() {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith('.html')) {
        const rel = '/' + relative(DIST, p).split('\\').join('/');
        out.push(rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel);
      }
    }
  };
  walk(DIST);
  return out.sort();
}

export const PUBLIC_PAGES = () => builtPages().filter((p) => !p.startsWith('/admin/'));

/** Collect console errors and uncaught exceptions on a page. */
export function trackErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}
