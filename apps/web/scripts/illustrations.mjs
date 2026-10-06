// Build-time SVG illustrations: a "saha haritası" (field map) hero and the 3 how-it-works steps.
// Pointy-top hexes like the app's H3 grid. All colours come from CSS classes so the
// drawings follow light/dark themes; only players own colour (p-*), the shell stays ink & paper.

const f = (n) => (Math.round(n * 10) / 10).toString();

function hexCorners(x, y, R) {
  const a = 0.8660254 * R;
  const b = R / 2;
  return [
    [x, y - R],
    [x + a, y - b],
    [x + a, y + b],
    [x, y + R],
    [x - a, y + b],
    [x - a, y - b],
  ];
}
const hexPath = (x, y, R) => {
  const c = hexCorners(x, y, R);
  return 'M' + c.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
};

function grid(w, h, R, fn) {
  const dx = Math.sqrt(3) * R;
  const dy = 1.5 * R;
  for (let r = -1; r * dy < h + R; r++)
    for (let c = -1; c * dx < w + R; c++) fn(c * dx + (r % 2 ? dx / 2 : 0), r * dy, r, c);
}

function inPoly(x, y, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Outline of a set of cells: edges that are not shared by two cells of the set.
function outline(cells, R) {
  const key = (p, q) => {
    const a = f(p[0]) + ',' + f(p[1]);
    const b = f(q[0]) + ',' + f(q[1]);
    return a < b ? a + '|' + b : b + '|' + a;
  };
  const count = new Map();
  for (const [x, y] of cells) {
    const c = hexCorners(x, y, R);
    for (let i = 0; i < 6; i++) {
      const k = key(c[i], c[(i + 1) % 6]);
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  let d = '';
  for (const [k, n] of count) if (n === 1) d += 'M' + k.replace('|', 'L').replace(/,/g, ' ');
  return d;
}

// Smooth closed curve through polygon points (quadratic through midpoints), sampled.
function smoothSamples(pts, perSeg = 12) {
  const n = pts.length;
  const mid = (i) => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2];
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = mid((i - 1 + n) % n);
    const p1 = pts[i];
    const p2 = mid(i);
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
    }
  }
  return out;
}
const line = (pts, close) => 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + (close ? 'Z' : '');
const tri = (x, y, s) => `M${f(x)} ${f(y - s)}L${f(x + s * 0.92)} ${f(y + s * 0.6)}L${f(x - s * 0.92)} ${f(y + s * 0.6)}Z`;

// ---------- how-it-works steps ----------
const STEP_LOOP = [
  [70, 52],
  [118, 34],
  [164, 50],
  [176, 98],
  [148, 136],
  [96, 140],
  [58, 108],
];
const RIVAL = [
  [196, -10],
  [260, -10],
  [260, 180],
  [200, 180],
  [184, 120],
];

const STEP_TEXT = {
  run: {
    tr: 'Petek ızgarası üstünde başlangıç üçgeninden çıkan açık bir koşu izi.',
    en: 'An open running trace leaving the start triangle across the hex grid.',
  },
  close: {
    tr: 'İz başlangıç noktasına döner ve kapalı bir halka olur.',
    en: 'The trace returns to the start point and becomes a closed loop.',
  },
  claim: {
    tr: 'Halkanın içindeki petekler koşucunun rengine boyanır.',
    en: 'The cells inside the loop are filled with the runner’s colour.',
  },
};

export function stepIllustration(kind, lang) {
  const W = 240;
  const H = 168;
  const R = 10;
  let gridD = '';
  const inside = [];
  const rival = [];
  const samples = smoothSamples(STEP_LOOP);
  grid(W, H, R, (x, y) => {
    gridD += hexPath(x, y, R);
    if (inPoly(x, y, samples)) inside.push([x, y]);
    else if (inPoly(x, y, RIVAL)) rival.push([x, y]);
  });
  const start = samples[0];
  let body = `<rect class="m-land" width="${W}" height="${H}"/>`;
  body += `<path class="m-grid" d="${gridD}"/>`;
  body += `<path class="p-gok cells" d="${rival.map(([x, y]) => hexPath(x, y, R * 1.02)).join('')}"/>`;
  body += `<path class="region-edge" d="${outline(rival, R)}"/>`;
  if (kind === 'claim') {
    body += `<path class="p-keh cells" d="${inside.map(([x, y]) => hexPath(x, y, R * 1.02)).join('')}"/>`;
    body += `<path class="region-edge" d="${outline(inside, R)}"/>`;
  }
  if (kind === 'run') {
    const part = samples.slice(0, Math.round(samples.length * 0.68));
    body += `<path class="m-route" d="${line(part)}"/>`;
    const end = part[part.length - 1];
    body += `<circle class="m-runner" cx="${f(end[0])}" cy="${f(end[1])}" r="5.5"/>`;
  } else {
    body += `<path class="m-route${kind === 'claim' ? ' m-route-thin' : ''}" d="${line(samples, true)}"/>`;
  }
  if (kind === 'close') {
    body += `<circle class="m-close-ring" cx="${f(start[0])}" cy="${f(start[1])}" r="17"/>`;
  }
  body += `<path class="m-start" d="${tri(start[0], start[1] - 1, 8)}"/>`;
  return `<svg class="illus" viewBox="0 0 ${W} ${H}" role="img" aria-label="${STEP_TEXT[kind][lang]}">${body}</svg>`;
}

// ---------- hero field map ----------
const HERO_REGIONS = [
  { cls: 'p-gok', p: [[300, 20], [430, 10], [470, 90], [430, 170], [340, 160], [300, 100]] },
  { cls: 'p-zum', p: [[440, 180], [575, 150], [575, 330], [470, 320], [430, 250]] },
  { cls: 'p-kir', p: [[60, 40], [180, 20], [230, 90], [190, 150], [90, 140]] },
  { cls: 'p-gul', p: [[250, 300], [360, 290], [420, 360], [360, 450], [240, 450], [220, 380]] },
  { cls: 'p-keh', p: [[200, 170], [330, 175], [420, 205], [430, 270], [340, 290], [240, 280], [190, 230]] },
];
const HERO_SIEGE = [[360, 40], [440, 30], [450, 110], [380, 130]];
const HERO_LOOP = [[120, 200], [180, 160], [230, 190], [235, 270], [200, 330], [130, 320], [96, 262]];

export function heroMap(lang) {
  const W = 560;
  const H = 440;
  const R = 13;
  const sets = HERO_REGIONS.map(() => []);
  const siege = [];
  let tex = '';
  grid(W, H, R, (x, y) => {
    for (let i = 0; i < HERO_REGIONS.length; i++) {
      if (inPoly(x, y, HERO_REGIONS[i].p)) {
        sets[i].push([x, y]);
        tex += hexPath(x, y, R);
        if (HERO_REGIONS[i].cls === 'p-gok' && inPoly(x, y, HERO_SIEGE)) siege.push([x, y]);
        return;
      }
    }
  });
  const loop = smoothSamples(HERO_LOOP);
  const start = loop[0];
  const label =
    lang === 'tr'
      ? 'Saha haritası: farklı renklerde oyuncu bölgeleri, taralı kuşatılan petekler ve başlangıç üçgeninden çıkan yeni bir halka.'
      : 'Field map: player territories in different colours, hatched cells under siege and a new loop leaving the start triangle.';
  let s = `<svg class="hero-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">`;
  s += `<defs><pattern id="hatch-hero" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="hatch-line" width="2.6" height="6"/></pattern></defs>`;
  s += `<rect class="m-land" width="${W}" height="${H}"/>`;
  s += `<path class="m-water" d="M0 300 C60 320 70 380 40 440 L0 440 Z M480 440 C500 400 560 390 560 370 L560 440 Z"/>`;
  s += `<path class="m-park" d="M470 30 C520 20 548 50 540 96 C530 130 490 128 474 104 C462 84 452 50 470 30 Z M40 170 C70 160 92 180 86 210 C80 236 50 240 36 220 C26 200 26 178 40 170 Z"/>`;
  s += `<path class="m-road-casing" d="M-10 158 C150 150 300 186 570 140 M250 -10 C246 120 270 300 300 450 M-10 360 C140 340 300 330 570 300"/>`;
  s += `<path class="m-road" d="M-10 158 C150 150 300 186 570 140 M250 -10 C246 120 270 300 300 450 M-10 360 C140 340 300 330 570 300"/>`;
  s += `<path class="m-road-minor" d="M120 -10 L150 450 M400 -10 L380 450 M-10 80 L570 60 M-10 250 L570 230 M-10 410 L570 400"/>`;
  HERO_REGIONS.forEach((r, i) => {
    s += `<path class="${r.cls} cells" d="${sets[i].map(([x, y]) => hexPath(x, y, R * 1.02)).join('')}"/>`;
  });
  s += `<path class="m-tex" d="${tex}"/>`;
  s += `<path class="siege" d="${siege.map(([x, y]) => hexPath(x, y, R)).join('')}"/>`;
  sets.forEach((cells) => {
    s += `<path class="region-edge" d="${outline(cells, R)}"/>`;
  });
  s += `<path class="m-route m-route-hero" d="${line(loop.slice(0, Math.round(loop.length * 0.88)), false)}"/>`;
  const head = loop[Math.round(loop.length * 0.88) - 1];
  s += `<circle class="m-runner" cx="${f(head[0])}" cy="${f(head[1])}" r="7"/>`;
  s += `<path class="m-start" d="${tri(start[0], start[1] - 1, 11)}"/>`;
  s += `</svg>`;
  return s;
}
