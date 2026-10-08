/**
 * Oyuncu renk paleti: renk körlüğüne güvenli Okabe–Ito ailesinden 8 slot.
 * Oyuncu kendini her zaman kendi renginde görür; haritayı boyayan şey komşuluk kuralıdır.
 */
export const SLOTS = ['keh', 'kir', 'lim', 'zum', 'gok', 'lac', 'gul', 'mer'] as const;
export type Slot = (typeof SLOTS)[number];

export const PALETTE: Record<Slot, { name: string; hex: string; darkEdge: string; fillDark: string; fillLight: string }> = {
  keh: { name: 'Kehribar', hex: '#E69F00', darkEdge: '#E69F00', fillDark: '#7D5C0C', fillLight: '#EAC267' },
  kir: { name: 'Kiremit', hex: '#D55E00', darkEdge: '#D55E00', fillDark: '#753C0C', fillLight: '#E19E67' },
  lim: { name: 'Limon', hex: '#F0E442', darkEdge: '#F0E442', fillDark: '#827E2D', fillLight: '#F0E88C' },
  zum: { name: 'Zümrüt', hex: '#009E73', darkEdge: '#009E73', fillDark: '#0A5C45', fillLight: '#6CC2A7' },
  gok: { name: 'Gök', hex: '#56B4E9', darkEdge: '#56B4E9', fillDark: '#356680', fillLight: '#9BCEE8' },
  lac: { name: 'Lacivert', hex: '#0072B2', darkEdge: '#1B7EBF', fillDark: '#184C6B', fillLight: '#6CA9C9' },
  gul: { name: 'Gül', hex: '#CC79A7', darkEdge: '#CC79A7', fillDark: '#70495F', fillLight: '#DCADC3' },
  mer: { name: 'Mercan', hex: '#F9AEA2', darkEdge: '#F9AEA2', fillDark: '#86645C', fillLight: '#F4CAC1' },
};

/** Simülasyonda birbirine en yakın düşen dört çift: komşu olamazlar. */
export const FORBIDDEN_PAIRS: ReadonlyArray<readonly [Slot, Slot]> = [
  ['zum', 'gul'],
  ['keh', 'mer'],
  ['zum', 'lac'],
  ['lac', 'gul'],
];

export function isSlot(x: unknown): x is Slot {
  return typeof x === 'string' && (SLOTS as readonly string[]).includes(x);
}

export function clash(a: Slot, b: Slot): boolean {
  if (a === b) return true;
  return FORBIDDEN_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ColorNode {
  id: string;
  slot: Slot;
}

/**
 * Görüntüleyen için renk ataması. Görüntüleyen sabit; çakışmada rakip kayar.
 * Kayma (oyuncu çifti) için deterministik: aynı girdi her oturumda aynı sonucu verir.
 */
export function assignDisplayColors(
  viewerId: string | null,
  nodes: readonly ColorNode[],
  edges: ReadonlyArray<readonly [string, string]>,
): Map<string, Slot> {
  const adj = new Map<string, Set<string>>();
  const pref = new Map<string, Slot>();
  for (const n of nodes) {
    pref.set(n.id, n.slot);
    adj.set(n.id, new Set());
  }
  for (const [a, b] of edges) {
    if (a === b || !adj.has(a) || !adj.has(b)) continue;
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  const out = new Map<string, Slot>();
  if (viewerId && pref.has(viewerId)) out.set(viewerId, pref.get(viewerId)!);
  // DSatur: en çok renkli komşusu olan önce; eşitlikte derece, sonra kimlik.
  const remaining = new Set(nodes.map((n) => n.id).filter((id) => !out.has(id)));
  while (remaining.size) {
    let best: string | null = null;
    let bestKey: [number, number, string] = [-1, -1, ''];
    for (const id of remaining) {
      const nb = adj.get(id)!;
      let sat = 0;
      for (const m of nb) if (out.has(m)) sat++;
      const key: [number, number, string] = [sat, nb.size, id];
      if (
        best === null ||
        key[0] > bestKey[0] ||
        (key[0] === bestKey[0] && key[1] > bestKey[1]) ||
        (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])
      ) {
        best = id;
        bestKey = key;
      }
    }
    const id = best!;
    remaining.delete(id);
    const used = [...adj.get(id)!].filter((m) => out.has(m)).map((m) => out.get(m)!);
    const want = pref.get(id)!;
    const ok = (s: Slot) => used.every((u) => !clash(s, u));
    if (ok(want)) {
      out.set(id, want);
      continue;
    }
    // Deterministik kayma sırası: görüntüleyen+oyuncu çiftinden türetilen başlangıç, sonra sırayla.
    const startIdx = (SLOTS.indexOf(want) + 1 + (hash32(`${viewerId ?? ''}|${id}`) % 7)) % SLOTS.length;
    let chosen: Slot | null = null;
    for (let k = 0; k < SLOTS.length; k++) {
      const s = SLOTS[(startIdx + k) % SLOTS.length]!;
      if (ok(s)) {
        chosen = s;
        break;
      }
    }
    if (!chosen) {
      // Yasaklı çift çatışmasını aynı renge tercih et: en az aynı-renk çakışması olan slot.
      let bestS: Slot = want;
      let bestCost = Infinity;
      for (const s of SLOTS) {
        const cost = used.reduce((c, u) => c + (u === s ? 10 : clash(s, u) ? 1 : 0), 0);
        if (cost < bestCost) {
          bestCost = cost;
          bestS = s;
        }
      }
      chosen = bestS;
    }
    out.set(id, chosen);
  }
  return out;
}
